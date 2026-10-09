import api from '@/services/api'
import { companyHeader, esc, printHtml, printStamp, type OrgInfo } from './print'

// The customer's BILL on an 80 mm thermal roll: company header, call number, table, every item with its price,
// discount, VAT and the total to pay. Printed the moment the waiter taps "Bill" (and can be reprinted from the order view).

export interface BillLine { item_name_snap: string; quantity: number; unit_price: string | number; line_total: string | number; status: string }
export interface BillOrder {
  order_ref: string; call_no?: number | null; order_type: string; table_number?: string | null; waiter_name?: string | null; opened_at?: string
  subtotal: string | number; discount_amount: string | number; tax_amount: string | number; vat_rate: string | number; service_charge: string | number; total_amount: string | number
  invoice?: { invoice_number: string; status: string; total_amount: string | number; amount_paid: string | number; subtotal: string | number; discount_amount: string | number; tax_amount: string | number; vat_rate: string | number; service_charge: string | number } | null
  lines: BillLine[]
}

let orgCache: OrgInfo | null = null
const getOrg = async () => orgCache ?? (orgCache = await api.get('/system/organization').then(r => r.data.data).catch(() => null))
const m = (v: unknown) => '$' + Number(v).toFixed(2)
const TYPE: Record<string, string> = { dine_in: 'Dine in', takeaway: 'Takeaway', delivery: 'Delivery', room_service: 'Room service' }

export async function printBill(o: BillOrder) {
  const org = await getOrg()
  const t = o.invoice ?? o            // the invoice holds the final, billed figures
  const lines = o.lines.filter(l => l.status !== 'cancelled')
  const rows = lines.map(l => `
    <tr><td class="qty">${l.quantity}×</td>
        <td>${esc(l.item_name_snap)}<div class="xs">@ ${m(l.unit_price)}</div></td>
        <td class="amt">${m(l.line_total)}</td></tr>`).join('')
  const due = o.invoice ? Number(o.invoice.total_amount) - Number(o.invoice.amount_paid) : Number(o.total_amount)
  const paid = o.invoice ? Number(o.invoice.amount_paid) >= Number(o.invoice.total_amount) && Number(o.invoice.total_amount) > 0 : false
  printHtml(`
    ${companyHeader(org)}
    <hr/>
    <div class="center bold lg">${o.invoice ? (paid ? 'RECEIPT' : 'BILL') : 'ORDER SUMMARY'}</div>
    ${o.call_no ? `<div class="center bold xl mt">Order #${o.call_no}</div>` : ''}
    <table class="sm mt">
      ${o.invoice ? `<tr><td>Invoice</td><td class="right bold">${esc(o.invoice.invoice_number)}</td></tr>` : `<tr><td>Order</td><td class="right bold">${esc(o.order_ref)}</td></tr>`}
      <tr><td>${o.table_number ? 'Table' : 'Type'}</td><td class="right">${esc(o.table_number ?? TYPE[o.order_type] ?? o.order_type)}</td></tr>
      ${o.waiter_name ? `<tr><td>Served by</td><td class="right">${esc(o.waiter_name)}</td></tr>` : ''}
      <tr><td>Date</td><td class="right">${printStamp()}</td></tr>
    </table>
    <hr/>
    <table>${rows}</table>
    <hr/>
    <table class="md">
      <tr><td>Subtotal</td><td class="right">${m(t.subtotal)}</td></tr>
      ${Number(t.discount_amount) > 0 ? `<tr><td>Discount</td><td class="right">-${m(t.discount_amount)}</td></tr>` : ''}
      ${Number(t.service_charge) > 0 ? `<tr><td>Service charge</td><td class="right">${m(t.service_charge)}</td></tr>` : ''}
      ${Number(t.tax_amount) > 0 ? `<tr><td>VAT (${Number(t.vat_rate)}%)</td><td class="right">${m(t.tax_amount)}</td></tr>` : ''}
      <tr class="bold lg"><td>TOTAL</td><td class="right">${m(t.total_amount)}</td></tr>
      ${o.invoice && Number(o.invoice.amount_paid) > 0 ? `<tr><td>Paid</td><td class="right">${m(o.invoice.amount_paid)}</td></tr>` : ''}
      ${o.invoice && !paid ? `<tr class="bold"><td>TO PAY</td><td class="right">${m(due)}</td></tr>` : ''}
    </table>
    <hr/>
    <div class="center sm bold mt">${paid ? 'Thank you — welcome again!' : o.invoice ? 'Please pay at the cashier — thank you!' : 'This is not a bill yet.'}</div>
  `)
}

/** Fetch the order (items, totals, its invoice) and print the bill for it */
export async function printBillFor(orderId: string) {
  const r = await api.get(`/restaurant/orders/${orderId}`)
  await printBill(r.data.data as BillOrder)
}
