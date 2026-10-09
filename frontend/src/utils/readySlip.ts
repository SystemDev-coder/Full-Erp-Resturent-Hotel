import api from '@/services/api'
import { esc, printHtml, printStamp, setFooterOrg, type OrgInfo } from './print'

// "Order ready" slip (80 mm): printed at the kitchen pass or by the waiter. It carries the big CALL NUMBER the
// waiter shouts / the customer waits for, the table, and what is on the tray.

export interface SlipOrder {
  call_no?: number | null; order_ref: string; order_type?: string; table_number?: string | null
  waiter_name?: string | null; lines: { name: string; quantity: number }[]
}

let orgCache: OrgInfo | null = null
const getOrg = async () => orgCache ?? (orgCache = await api.get('/system/organization').then(r => r.data.data).catch(() => null))

const TYPE: Record<string, string> = { dine_in: 'Dine in', takeaway: 'TAKEAWAY', delivery: 'Delivery', room_service: 'Room service' }

export async function printReadySlip(o: SlipOrder) {
  const org = await getOrg()
  setFooterOrg(org?.name)
  const where = o.table_number ? `Table ${o.table_number}` : (TYPE[o.order_type ?? ''] ?? 'Takeaway')
  const rows = o.lines.map(l => `<tr><td class="qty lg">${l.quantity}×</td><td class="lg">${esc(l.name)}</td></tr>`).join('')
  printHtml(`
    <div class="center bold lg">${esc(org?.name ?? '')}</div>
    <hr/>
    <div class="center bold xl">*** ORDER READY ***</div>
    ${o.call_no ? `<div class="center bold" style="font-size:58px;line-height:1.05;margin:6px 0">#${o.call_no}</div>` : ''}
    <div class="center bold lg">${esc(where)}</div>
    <hr/>
    <table>${rows}</table>
    <hr/>
    <table class="md">
      <tr><td>Order</td><td class="right">${esc(o.order_ref)}</td></tr>
      ${o.waiter_name ? `<tr><td>Waiter</td><td class="right bold">${esc(o.waiter_name)}</td></tr>` : ''}
      <tr><td>Time</td><td class="right">${printStamp()}</td></tr>
    </table>
    <div class="center sm bold mt">Pick up and serve — call the customer</div>
  `)
}

/** Fetch the order's items, then print its ready slip */
export async function printReadySlipFor(orderId: string) {
  const r = await api.get(`/restaurant/orders/${orderId}`)
  const o = r.data.data
  await printReadySlip({
    call_no: o.call_no, order_ref: o.order_ref, order_type: o.order_type, table_number: o.table_number,
    lines: (o.lines as { item_name_snap: string; quantity: number; status: string }[]).filter(l => l.status !== 'cancelled').map(l => ({ name: l.item_name_snap, quantity: l.quantity })),
  })
}
