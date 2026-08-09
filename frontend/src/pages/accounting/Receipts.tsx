import { useState, useEffect, useCallback, useMemo } from 'react'
import { CreditCard, RefreshCw, UserCheck, Truck, Receipt, Printer, Plus, Download, FileStack, Trash2, Eye, UtensilsCrossed } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import { Tabs } from '@/components/ui/Tabs'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { Select } from '@/components/ui/Select'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useAuth } from '@hooks/useAuth'
import { useToast } from '@/contexts/ToastContext'
import { printHtml, esc, companyHeader, printStamp, type OrgInfo } from '@utils/print'
import { useLoadMore } from '@hooks/useLoadMore'

interface GuestPayment {
  id: string; invoice_number: string; invoice_date: string
  total_amount: string; amount_paid: string; amount_due: string
  status: string; payment_method?: string; updated_at: string
  guest_name?: string; booking_ref?: string
}
interface SupplierPayment {
  id: string; amount: string; transaction_date: string
  description: string; status: string; account_name: string
  invoice_number?: string; supplier_name?: string
}
interface InvoiceDue {
  id: string; invoice_number: string; invoice_date: string
  total_amount: string; amount_paid: string; amount_due: string; status: string
}
interface InvoiceLine { id: string; description: string; quantity: string; unit_price: string; line_total: string }
interface InvoiceDetail {
  id: string; invoice_number: string; invoice_date: string; created_at: string
  subtotal: string; discount_amount: string; tax_amount: string; vat_rate: string; service_charge: string
  total_amount: string; amount_paid: string; amount_due: string
  status: string; payment_method?: string; notes?: string
  guest_name?: string; order_ref?: string; order_type?: string; table_number?: string
  lines: InvoiceLine[]
}
interface GuestOption { id: string; first_name: string; last_name: string }
interface AccountOption { id: string; name: string; account_type: string; balance?: number }

interface ReceiptRow {
  id: string; receipt_number: string; receipt_date: string
  guest_id?: string; customer_name?: string; reference?: string
  payment_method: string; currency: string; notes?: string
  subtotal: string; total_amount: string; status: string
  created_at: string; updated_at: string
  guest_name?: string; item_count?: string | number
}
interface ReceiptLine { id?: string; description: string; quantity: string; unit_price: string }
interface ReceiptDetail extends ReceiptRow { account_id?: string; lines: { id: string; description: string; quantity: string; unit_price: string; amount: string }[] }
interface ReceiptForm {
  receipt_date: string; guest_id: string; customer_name: string; reference: string
  payment_method: string; currency: string; notes: string; status: string; account_id: string
  lines: ReceiptLine[]
}

const EMPTY_LINE: ReceiptLine = { description: '', quantity: '1', unit_price: '' }
const emptyReceipt = (): ReceiptForm => ({
  receipt_date: new Date().toISOString().slice(0, 10), guest_id: '', customer_name: '', reference: '',
  payment_method: 'cash', currency: 'USD', notes: '', status: 'issued', account_id: '', lines: [{ ...EMPTY_LINE }],
})

const INV_BADGE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  issued: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  draft: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}
const METHOD_BADGE: Record<string, string> = {
  cash: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  card: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
  mobile: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
  bank_transfer: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  room_charge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  complimentary: 'bg-neutral-50 text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400',
}
const METHODS = ['cash', 'card', 'mobile', 'bank_transfer']

export default function Receipts() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState<'guest' | 'supplier' | 'general'>('guest')
  const { items: guestPays, loading: guestLoading, loadingMore: guestLoadingMore, hasMore: guestHasMore,
          loadMore: loadMoreGuestPays, reload: reloadGuestPays, error: guestLoadError } =
    useLoadMore<GuestPayment>('/accounting/guest-payments', { pageSize: 50 })
  const { items: supplierPays, loading: supplierLoading, loadingMore: supplierLoadingMore, hasMore: supplierHasMore,
          loadMore: loadMoreSupplierPays, reload: reloadSupplierPays, error: supplierLoadError } =
    useLoadMore<SupplierPayment>('/accounting/supplier-payments', { pageSize: 50 })
  const { items: receipts, loading: receiptsLoading, loadingMore: receiptsLoadingMore, hasMore: receiptsHasMore,
          loadMore: loadMoreReceipts, reload: reloadReceipts, error: receiptsLoadError } =
    useLoadMore<ReceiptRow>('/accounting/receipts', { pageSize: 50 })
  const [invoices, setInvoices] = useState<InvoiceDue[]>([])
  const [guests, setGuests] = useState<GuestOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<null | 'recordPayment' | 'createReceipt' | 'editReceipt' | 'viewReceipt' | 'deleteReceipt' | 'viewInvoice'>(null)
  const [invDetail, setInvDetail] = useState<InvoiceDetail | null>(null)
  const [invoiceId, setInvoiceId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payAccountId, setPayAccountId] = useState('')

  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(emptyReceipt())
  const [activeReceipt, setActiveReceipt] = useState<ReceiptRow | null>(null)
  const [viewReceipt, setViewReceipt] = useState<ReceiptDetail | null>(null)

  // Guest Payments, Supplier Payments and General Receipts (the three tabs
  // most likely to grow large) each load 50 at a time via useLoadMore.
  // Reference data (due invoices, org info, guest picker) loads together.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, oRes, guestRes, accRes] = await Promise.all([
        api.get('/accounting/invoices'),
        api.get('/system/organization').catch(() => null),
        api.get('/hotel/guests').catch(() => null),
        api.get('/accounting/accounts').catch(() => null),
      ])
      setInvoices(iRes.data.data)
      if (oRes) setOrg(oRes.data.data)
      if (guestRes) setGuests(guestRes.data.data)
      if (accRes) setAccounts(accRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadAll = useCallback(() => {
    reloadGuestPays(); reloadSupplierPays(); reloadReceipts(); load()
  }, [reloadGuestPays, reloadSupplierPays, reloadReceipts, load])

  const printedBy = user?.full_name ?? user?.email ?? 'User'

  // Full itemized bill — styled like a real thermal restaurant receipt:
  // header · order/table info · ITEM/QTY/AMT lines · totals · payment block
  const printInvoiceBill = (d: InvoiceDetail) => {
    const totalQty = d.lines.reduce((s, l) => s + Number(l.quantity), 0)
    const when = new Date(d.created_at ?? d.invoice_date)
    printHtml(`
      ${companyHeader(org)}
      <hr/>
      <table class="sm">
        <tr><td>Invoice No</td><td class="right bold">${esc(d.invoice_number)}</td></tr>
        ${d.order_ref ? `<tr><td>Order No</td><td class="right">${esc(d.order_ref)}</td></tr>` : ''}
        <tr><td>Date</td><td class="right">${esc(d.invoice_date?.slice(0,10) ?? '')}</td></tr>
        <tr><td>Time</td><td class="right">${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td></tr>
        ${d.table_number ? `<tr><td>Table No</td><td class="right bold">${esc(d.table_number)}</td></tr>` : ''}
        <tr><td>Guest</td><td class="right">${esc(d.guest_name ?? 'Walk-in')}</td></tr>
      </table>
      <hr/>
      <table class="md">
        <tr><th>ITEM</th><th class="qty">QTY</th><th class="amt">AMT</th></tr>
        ${d.lines.map(l => `
          <tr>
            <td>${esc(l.description)}</td>
            <td class="qty">${Number(l.quantity)}</td>
            <td class="amt">${Number(l.line_total ?? Number(l.quantity) * Number(l.unit_price)).toFixed(2)}</td>
          </tr>`).join('')}
      </table>
      <hr/>
      <table class="sm">
        <tr><td>Total Qty : ${totalQty}</td><td class="right">Sub Total : $${Number(d.subtotal).toFixed(2)}</td></tr>
        ${Number(d.discount_amount) > 0 ? `<tr><td>Discount</td><td class="right">-$${Number(d.discount_amount).toFixed(2)}</td></tr>` : ''}
        ${Number(d.service_charge) > 0 ? `<tr><td>Service Charge</td><td class="right">$${Number(d.service_charge).toFixed(2)}</td></tr>` : ''}
        <tr><td>VAT${Number(d.vat_rate) > 0 ? ` (${Number(d.vat_rate)}%)` : ''}</td><td class="right">$${Number(d.tax_amount).toFixed(2)}</td></tr>
      </table>
      <hr/>
      <table class="md">
        <tr class="bold xl"><td>TOTAL</td><td class="right">$${Number(d.total_amount).toFixed(2)}</td></tr>
        <tr class="bold"><td>PAID</td><td class="right">$${Number(d.amount_paid).toFixed(2)}</td></tr>
        <tr><td>Balance due</td><td class="right">$${Number(d.amount_due).toFixed(2)}</td></tr>
        ${d.payment_method ? `<tr><td>Method</td><td class="right bold">${esc(d.payment_method.replace(/_/g,' '))}</td></tr>` : ''}
      </table>
      <hr/>
      <div class="center sm bold mt">Thank you — welcome again!</div>
      <div class="center xs mt">Printed by ${esc(printedBy)} · ${printStamp()}</div>
    `)
    api.post('/system/audit/print', {
      action: 'PRINT_RECEIPT',
      details: { receipt: d.invoice_number, items: d.lines.length, amount: Number(d.total_amount), printed_by: printedBy },
    }).catch(() => {})
  }

  // Load full invoice (with line items) then print the itemized bill
  const printGuestPayment = async (r: GuestPayment) => {
    try {
      const res = await api.get(`/accounting/invoices/${r.id}`)
      printInvoiceBill(res.data.data)
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
  }

  // Clicking an invoice opens the detail view with all its items
  const openViewInvoice = async (r: GuestPayment) => {
    try {
      const res = await api.get(`/accounting/invoices/${r.id}`)
      setInvDetail(res.data.data)
      setMode('viewInvoice')
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
  }

  // Print a supplier payment voucher
  const printSupplierPayment = (r: SupplierPayment) => {
    printHtml(`
      ${companyHeader(org)}
      <hr/>
      <div class="center bold lg">PAYMENT VOUCHER</div>
      <table class="sm mt">
        <tr><td>Supplier</td><td class="right bold">${esc(r.supplier_name ?? '—')}</td></tr>
        ${r.invoice_number ? `<tr><td>Bill</td><td class="right">${esc(r.invoice_number)}</td></tr>` : ''}
        <tr><td>Date</td><td class="right">${esc(r.transaction_date?.slice(0,10) ?? '')}</td></tr>
        <tr><td>Paid from</td><td class="right">${esc(r.account_name)}</td></tr>
      </table>
      <hr/>
      <table class="md">
        <tr class="bold lg"><td>AMOUNT PAID</td><td class="right">$${Number(r.amount).toFixed(2)}</td></tr>
      </table>
      ${r.description ? `<div class="note">${esc(r.description)}</div>` : ''}
      <hr/>
      <div class="center xs mt">Printed by ${esc(printedBy)} · ${printStamp()}</div>
    `)
    api.post('/system/audit/print', {
      action: 'PRINT_RECEIPT',
      details: { voucher: r.invoice_number ?? r.id, supplier: r.supplier_name, amount: Number(r.amount), printed_by: printedBy },
    }).catch(() => {})
  }

  const dueInvoices = invoices.filter(i => ['issued','partially_paid','unpaid'].includes(i.status) && Number(i.amount_due) > 0)
  const selectedInvoice = dueInvoices.find(i => i.id === invoiceId)
  const accountOptions = accounts.filter(a => a.account_type !== 'expense').map(a => ({
    value: a.id, label: `${a.name} (${a.account_type.replace(/_/g,' ')})`,
  }))
  const openPayment = () => {
    const first = dueInvoices[0]
    setInvoiceId(first?.id ?? '')
    setPayAmount(first ? String(first.amount_due) : '')
    setPayMethod('cash')
    setPayAccountId(accounts[0]?.id ?? '')
    setMode('recordPayment')
    setError('')
  }
  const close = () => { setMode(null); setError(''); setActiveReceipt(null); setViewReceipt(null); setInvDetail(null) }
  const savePayment = async () => {
    if (!invoiceId || !payAmount || !payMethod || !payAccountId) { setError('Invoice, amount, method and account are required'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/accounting/invoices/${invoiceId}/payment`, { amount: Number(payAmount), payment_method: payMethod, account_id: payAccountId })
      close(); showToast('Payment recorded', 'success'); loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // ── General Receipts CRUD ───────────────────────────────────────────────

  const openCreateReceipt = () => { setReceiptForm({ ...emptyReceipt(), account_id: accounts[0]?.id ?? '' }); setActiveReceipt(null); setMode('createReceipt'); setError('') }

  const openEditReceipt = async (r: ReceiptRow) => {
    setActiveReceipt(r); setError('')
    try {
      const res = await api.get(`/accounting/receipts/${r.id}`)
      const d: ReceiptDetail = res.data.data
      setReceiptForm({
        receipt_date: d.receipt_date?.slice(0,10) ?? '', guest_id: d.guest_id ?? '', customer_name: d.customer_name ?? '',
        reference: d.reference ?? '', payment_method: d.payment_method, currency: d.currency, notes: d.notes ?? '',
        status: d.status, account_id: d.account_id ?? accounts[0]?.id ?? '',
        lines: d.lines.map(l => ({ description: l.description, quantity: String(l.quantity), unit_price: String(l.unit_price) })),
      })
      setMode('editReceipt')
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
  }

  const openViewReceipt = async (r: ReceiptRow) => {
    setError('')
    try {
      const res = await api.get(`/accounting/receipts/${r.id}`)
      setViewReceipt(res.data.data)
      setMode('viewReceipt')
    } catch (e) { showToast(getApiErrorMessage(e), 'error') }
  }

  const openDeleteReceipt = (r: ReceiptRow) => { setActiveReceipt(r); setMode('deleteReceipt') }
  const doDeleteReceipt = async () => {
    if (!activeReceipt) return
    setSaving(true)
    try {
      await api.delete(`/accounting/receipts/${activeReceipt.id}`)
      close(); showToast('Receipt deleted', 'success'); loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); showToast(msg, 'error'); setError(msg) }
    finally { setSaving(false) }
  }

  const addLine = () => setReceiptForm(p => ({ ...p, lines: [...p.lines, { ...EMPTY_LINE }] }))
  const removeLine = (i: number) => setReceiptForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }))
  const updateLine = (i: number, field: keyof ReceiptLine, value: string) =>
    setReceiptForm(p => ({ ...p, lines: p.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }))

  const receiptSubtotal = useMemo(() =>
    receiptForm.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [receiptForm.lines])

  const receiptValid = receiptForm.lines.length > 0
    && receiptForm.lines.every(l => l.description.trim() && Number(l.quantity) > 0 && Number(l.unit_price) >= 0)
    && (receiptForm.guest_id || receiptForm.customer_name.trim())
    && (receiptForm.status === 'draft' || !!receiptForm.account_id)

  const saveReceipt = async () => {
    if (!receiptValid) { setError('Add at least one valid line item, a customer (guest or name), and an account (unless saving as draft)'); return }
    setSaving(true); setError('')
    const payload = {
      receipt_date: receiptForm.receipt_date, guest_id: receiptForm.guest_id || undefined,
      customer_name: receiptForm.customer_name || undefined, reference: receiptForm.reference || undefined,
      payment_method: receiptForm.payment_method, currency: receiptForm.currency, notes: receiptForm.notes || undefined,
      status: receiptForm.status, account_id: receiptForm.account_id || undefined,
      lines: receiptForm.lines.map(l => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
    }
    try {
      if (mode === 'editReceipt' && activeReceipt) {
        await api.put(`/accounting/receipts/${activeReceipt.id}`, payload)
        showToast('Receipt updated', 'success')
      } else {
        await api.post('/accounting/receipts', payload)
        showToast('Receipt created', 'success')
      }
      close(); loadAll()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  const printReceiptDoc = (r: ReceiptDetail) => {
    printHtml(`
      ${companyHeader(org)}
      <hr/>
      <div class="center bold lg">RECEIPT</div>
      <table class="sm mt">
        <tr><td>Receipt #</td><td class="right bold">${esc(r.receipt_number)}</td></tr>
        <tr><td>Date</td><td class="right">${esc(r.receipt_date?.slice(0,10) ?? '')}</td></tr>
        <tr><td>Customer</td><td class="right">${esc(r.guest_name ?? r.customer_name ?? 'Walk-in')}</td></tr>
        ${r.reference ? `<tr><td>Reference</td><td class="right">${esc(r.reference)}</td></tr>` : ''}
        <tr><td>Method</td><td class="right bold">${esc(r.payment_method.replace(/_/g,' '))}</td></tr>
      </table>
      <hr/>
      <table class="md">
        <tr><th>Item</th><th class="qty">Qty</th><th class="amt">Amount</th></tr>
        ${r.lines.map(l => `<tr><td>${esc(l.description)}</td><td class="qty">${Number(l.quantity)}</td><td class="amt">$${Number(l.amount).toFixed(2)}</td></tr>`).join('')}
      </table>
      <hr/>
      <table class="md">
        <tr class="bold lg"><td>TOTAL</td><td class="right">${esc(r.currency)} $${Number(r.total_amount).toFixed(2)}</td></tr>
      </table>
      ${r.notes ? `<div class="note">${esc(r.notes)}</div>` : ''}
      <hr/>
      <div class="center xs mt">Printed by ${esc(printedBy)} · ${printStamp()}</div>
    `)
    api.post('/system/audit/print', {
      action: 'PRINT_RECEIPT',
      details: { receipt: r.receipt_number, amount: Number(r.total_amount), printed_by: printedBy },
    }).catch(() => {})
  }

  const downloadReceiptPDF = (r: ReceiptDetail) => {
    const doc = new jsPDF()
    doc.setFontSize(15); doc.setFont('helvetica', 'bold')
    doc.text(org?.name ?? 'Receipt', 14, 18)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(120)
    doc.text(`Receipt ${r.receipt_number}  ·  ${r.receipt_date?.slice(0,10)}`, 14, 25)
    doc.text(`Customer: ${r.guest_name ?? r.customer_name ?? 'Walk-in'}`, 14, 31)
    autoTable(doc, {
      startY: 38,
      head: [['Description', 'Qty', 'Unit Price', 'Amount']],
      body: r.lines.map(l => [l.description, String(Number(l.quantity)), `$${Number(l.unit_price).toFixed(2)}`, `$${Number(l.amount).toFixed(2)}`]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      foot: [['', '', 'Total', `${r.currency} $${Number(r.total_amount).toFixed(2)}`]],
      footStyles: { fillColor: [240, 240, 250], textColor: 20, fontStyle: 'bold' },
    })
    doc.save(`${r.receipt_number}.pdf`)
  }

  const GUEST_COLS: DTColumn<GuestPayment>[] = [
    { key:'invoice_number', label:'Invoice #', render:r=>(
      <button onClick={()=>openViewInvoice(r)} title="View invoice items"
        className="font-mono font-bold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
        {r.invoice_number}
      </button>
    )},
    { key:'guest_name', label:'Guest', render:r=><div><p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.guest_name ?? 'Walk-in'}</p><p className="font-mono text-[11px] text-neutral-400">{r.booking_ref ?? '-'}</p></div> },
    { key:'invoice_date', label:'Date', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.invoice_date?.slice(0,10)}</span> },
    { key:'amount_paid', label:'Paid', render:r=><span className="font-extrabold text-emerald-600 dark:text-emerald-400">+${Number(r.amount_paid).toFixed(2)}</span>, exportValue:r=>r.amount_paid },
    { key:'total_amount', label:'Invoice Total', render:r=><span className="text-neutral-600 dark:text-neutral-300">${Number(r.total_amount).toFixed(2)}</span>, exportValue:r=>r.total_amount },
    { key:'amount_due', label:'Balance Due', render:r=>{ const due = Number(r.amount_due); return <span className={`font-bold ${due > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}`}>${due.toFixed(2)}</span> }, exportValue:r=>r.amount_due },
    { key:'payment_method', label:'Method', render:r=> r.payment_method ? <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${METHOD_BADGE[r.payment_method] ?? ''}`}>{r.payment_method.replace(/_/g,' ')}</span> : <span className="text-neutral-400">-</span> },
    { key:'status', label:'Status', render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${INV_BADGE[r.status] ?? ''}`}>{r.status.replace(/_/g,' ')}</span> },
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex items-center gap-1.5">
        <button onClick={()=>openViewInvoice(r)} title="View items"
          className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 transition-colors">
          <Eye size={11}/> View
        </button>
        <button onClick={()=>printGuestPayment(r)} title="Print itemized bill"
          className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Printer size={11}/> Print
        </button>
      </div>
    )},
  ]
  const SUPPLIER_COLS: DTColumn<SupplierPayment>[] = [
    { key:'transaction_date', label:'Date', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.transaction_date?.slice(0,10)}</span> },
    { key:'supplier_name', label:'Supplier', render:r=><div className="flex items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"><Truck size={13}/></div><div><p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.supplier_name ?? '-'}</p><p className="font-mono text-[11px] text-neutral-400">{r.invoice_number ?? ''}</p></div></div> },
    { key:'amount', label:'Paid', render:r=><span className="font-extrabold text-rose-600 dark:text-rose-400">-${Number(r.amount).toFixed(2)}</span>, exportValue:r=>r.amount },
    { key:'account_name', label:'Paid From', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.account_name}</span> },
    { key:'description', label:'Description', render:r=><span className="text-[12px] text-neutral-400">{r.description}</span> },
    { key:'status', label:'Status', render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'}`}>{r.status}</span> },
    { key:'_act', label:'', sortable:false, render:r=>(
      <button onClick={()=>printSupplierPayment(r)} title="Print voucher"
        className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
        <Printer size={11}/> Print
      </button>
    )},
  ]
  const RECEIPT_COLS: DTColumn<ReceiptRow>[] = [
    { key:'receipt_number', label:'Receipt #', render:r=><span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.receipt_number}</span> },
    { key:'receipt_date', label:'Date', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.receipt_date?.slice(0,10)}</span> },
    { key:'customer', label:'Customer', exportValue:r=>r.guest_name ?? r.customer_name ?? '', render:r=><span className="font-semibold text-neutral-800 dark:text-neutral-200">{r.guest_name ?? r.customer_name ?? 'Walk-in'}</span> },
    { key:'reference', label:'Reference', render:r=><span className="text-[12px] text-neutral-400">{r.reference ?? '—'}</span> },
    { key:'payment_method', label:'Method', render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${METHOD_BADGE[r.payment_method] ?? ''}`}>{r.payment_method.replace(/_/g,' ')}</span> },
    { key:'item_count', label:'Items', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.item_count ?? 0}</span> },
    { key:'total_amount', label:'Total', render:r=><span className="font-extrabold text-neutral-800 dark:text-neutral-100">{r.currency} ${Number(r.total_amount).toFixed(2)}</span>, exportValue:r=>r.total_amount },
    { key:'status', label:'Status', render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${INV_BADGE[r.status] ?? ''}`}>{r.status}</span> },
    { key:'_act', label:'Actions', sortable:false, headerClassName:'text-right', className:'text-right', render:r=>(
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={()=>openViewReceipt(r)} title="View" className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 transition-colors"><Receipt size={13}/></button>
        {r.status !== 'cancelled' && (
          <button onClick={()=>openEditReceipt(r)} title="Edit" className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 transition-colors">
            <FileStack size={13}/>
          </button>
        )}
        <button onClick={()=>openDeleteReceipt(r)} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={13}/>
        </button>
      </div>
    )},
  ]

  // These sums only cover rows currently loaded into the page — accurate
  // once every page has been fetched (no "Load More" left), otherwise
  // labelled as partial so nobody reads a partial sum as the full total.
  const guestTotal = guestPays.reduce((s, g) => s + Number(g.amount_paid), 0)
  const supplierTotal = supplierPays.reduce((s, p) => s + Number(p.amount), 0)
  const totalsComplete = !guestHasMore && !supplierHasMore

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Receipts</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            Collected <span className="font-bold text-emerald-600 dark:text-emerald-400">${guestTotal.toFixed(2)}</span> · Paid out <span className="font-bold text-rose-600 dark:text-rose-400">${supplierTotal.toFixed(2)}</span>
            {!totalsComplete && <span className="ml-1.5 text-[11px] text-neutral-400">(loaded rows — Load More for the full total)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'general' ? (
            <button onClick={openCreateReceipt} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"><Plus size={15}/> New Receipt</button>
          ) : (
            <button onClick={openPayment} disabled={dueInvoices.length === 0} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"><CreditCard size={15}/> Record Payment</button>
          )}
          <button onClick={loadAll} className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-violet-300 hover:text-violet-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors"><RefreshCw size={15} className={(loading || guestLoading || supplierLoading || receiptsLoading) ? 'animate-spin' : ''}/></button>
        </div>
      </div>

      {(error || guestLoadError || supplierLoadError || receiptsLoadError) && !mode && (
        <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error || guestLoadError || supplierLoadError || receiptsLoadError}</p>
      )}

      <Tabs active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: 'guest', label: 'Guest Payments', icon: <UserCheck size={14}/>, count: guestPays.length },
        { key: 'supplier', label: 'Supplier Payments', icon: <Truck size={14}/>, count: supplierPays.length },
        { key: 'general', label: 'General Receipts', icon: <Receipt size={14}/>, count: receipts.length },
      ]} />

      {tab === 'guest' && <DataTable columns={GUEST_COLS} data={guestPays} title="Guest Payments" filename="guest_payments" rowKey={r=>r.id} searchPlaceholder="Search invoice, guest..." loading={guestLoading}
        onLoadMore={loadMoreGuestPays} hasMore={guestHasMore} loadingMore={guestLoadingMore}/>}
      {tab === 'supplier' && <DataTable columns={SUPPLIER_COLS} data={supplierPays} title="Supplier Payments" filename="supplier_payments" rowKey={r=>r.id} searchPlaceholder="Search supplier, invoice..." loading={supplierLoading}
        onLoadMore={loadMoreSupplierPays} hasMore={supplierHasMore} loadingMore={supplierLoadingMore}/>}
      {tab === 'general' && <DataTable columns={RECEIPT_COLS} data={receipts} title="General Receipts" filename="receipts" rowKey={r=>r.id} searchPlaceholder="Search receipt #, customer..." loading={receiptsLoading}
        onLoadMore={loadMoreReceipts} hasMore={receiptsHasMore} loadingMore={receiptsLoadingMore}/>}

      {tab !== 'general' && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-100 bg-sky-50 p-4 dark:border-sky-500/20 dark:bg-sky-500/10">
          <Receipt size={15} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400"/>
          <p className="text-[12.5px] text-sky-700 dark:text-sky-300">Use <b>Record Payment</b> here to collect guest invoice payments. Supplier payments still appear from supplier bill workflows. Need a standalone receipt (not tied to an invoice)? Use <b>General Receipts</b>.</p>
        </div>
      )}

      <Modal open={mode === 'recordPayment'} onClose={close} title="Record Payment" size="sm" footer={<><CancelBtn onClick={close}/><button onClick={savePayment} disabled={saving || !invoiceId || !payAmount || !payAccountId} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">{saving ? <RefreshCw size={13} className="animate-spin"/> : <CreditCard size={13}/>} Record</button></>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Invoice"><select value={invoiceId} onChange={e=>{ const next = dueInvoices.find(i => i.id === e.target.value); setInvoiceId(e.target.value); setPayAmount(next ? String(next.amount_due) : '') }} className={INPUT}><option value="">Select invoice</option>{dueInvoices.map(i=><option key={i.id} value={i.id}>{i.invoice_number} - due ${Number(i.amount_due).toFixed(2)}</option>)}</select></Field>
          {selectedInvoice && <div className="rounded-xl bg-violet-50 p-3 dark:bg-violet-500/10"><p className="text-[13px] font-bold text-violet-800 dark:text-violet-300">{selectedInvoice.invoice_number}</p><p className="text-[12px] text-violet-600 dark:text-violet-400">Total ${Number(selectedInvoice.total_amount).toFixed(2)} - paid ${Number(selectedInvoice.amount_paid).toFixed(2)}</p></div>}
          <div className="grid grid-cols-2 gap-3"><Field label="Amount"><input type="number" min="0" step="0.01" value={payAmount} onChange={e=>setPayAmount(e.target.value)} className={INPUT}/></Field><Field label="Method"><select value={payMethod} onChange={e=>setPayMethod(e.target.value)} className={INPUT}>{METHODS.map(m=><option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}</select></Field></div>
          <Field label="Deposit To (account)">
            <Select value={payAccountId} onChange={setPayAccountId} placeholder="— Select account —" options={accountOptions}/>
          </Field>
        </div>
      </Modal>

      {/* ── Create / Edit Receipt ────────────────────────────────────────── */}
      <Modal open={mode === 'createReceipt' || mode === 'editReceipt'} onClose={close}
        title={mode === 'editReceipt' ? `Edit Receipt ${activeReceipt?.receipt_number ?? ''}` : 'New Receipt'} size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={saveReceipt} disabled={saving || !receiptValid}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} {mode === 'editReceipt' ? 'Save Changes' : 'Create Receipt'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date"><input type="date" value={receiptForm.receipt_date} onChange={e=>setReceiptForm(p=>({...p, receipt_date:e.target.value}))} className={INPUT}/></Field>
            <Field label="Guest (optional)">
              <select value={receiptForm.guest_id} onChange={e=>setReceiptForm(p=>({...p, guest_id:e.target.value, customer_name: e.target.value ? '' : p.customer_name}))} className={INPUT}>
                <option value="">— Walk-in / custom name —</option>
                {guests.map(g=><option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
              </select>
            </Field>
            <Field label="Customer Name">
              <input value={receiptForm.customer_name} disabled={!!receiptForm.guest_id} onChange={e=>setReceiptForm(p=>({...p, customer_name:e.target.value}))}
                placeholder="Walk-in customer" className={`${INPUT} ${receiptForm.guest_id ? 'opacity-50 cursor-not-allowed' : ''}`}/>
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Reference"><input value={receiptForm.reference} onChange={e=>setReceiptForm(p=>({...p, reference:e.target.value}))} placeholder="PO / booking / note" className={INPUT}/></Field>
            <Field label="Payment Method"><select value={receiptForm.payment_method} onChange={e=>setReceiptForm(p=>({...p, payment_method:e.target.value}))} className={INPUT}>{METHODS.map(m=><option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}</select></Field>
            <Field label="Currency"><input value={receiptForm.currency} onChange={e=>setReceiptForm(p=>({...p, currency:e.target.value.toUpperCase()}))} maxLength={5} className={INPUT}/></Field>
            <Field label="Status"><select value={receiptForm.status} onChange={e=>setReceiptForm(p=>({...p, status:e.target.value}))} className={INPUT}><option value="draft">Draft</option><option value="issued">Issued</option><option value="cancelled">Cancelled</option></select></Field>
          </div>
          <Field label={`Deposit To (account)${receiptForm.status === 'draft' ? ' — optional while draft' : ''}`}>
            <Select value={receiptForm.account_id} onChange={v=>setReceiptForm(p=>({...p, account_id: v}))}
              placeholder="— Select account —" options={accountOptions}/>
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Items</p>
              <button onClick={addLine} className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11.5px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors"><Plus size={12}/> Add Line</button>
            </div>
            <div className="space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-white/[0.08]">
              {receiptForm.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_100px_32px] items-center gap-2">
                  <input value={l.description} onChange={e=>updateLine(i,'description',e.target.value)} placeholder="Description" className={INPUT}/>
                  <input type="number" min="0" step="0.01" value={l.quantity} onChange={e=>updateLine(i,'quantity',e.target.value)} placeholder="Qty" className={INPUT}/>
                  <input type="number" min="0" step="0.01" value={l.unit_price} onChange={e=>updateLine(i,'unit_price',e.target.value)} placeholder="Unit price" className={INPUT}/>
                  <span className="text-right text-[13px] font-bold text-neutral-700 dark:text-neutral-300">${((Number(l.quantity)||0)*(Number(l.unit_price)||0)).toFixed(2)}</span>
                  <button onClick={()=>removeLine(i)} disabled={receiptForm.lines.length===1} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-500/10 transition-colors"><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end text-[14px] font-extrabold text-neutral-800 dark:text-white">Total: {receiptForm.currency} ${receiptSubtotal.toFixed(2)}</div>
          </div>

          <Field label="Notes"><textarea value={receiptForm.notes} onChange={e=>setReceiptForm(p=>({...p, notes:e.target.value}))} rows={2} className={INPUT}/></Field>
        </div>
      </Modal>

      {/* ── View Receipt ─────────────────────────────────────────────────── */}
      <Modal open={mode === 'viewReceipt'} onClose={close} title={viewReceipt ? `Receipt ${viewReceipt.receipt_number}` : 'Receipt'} size="md"
        footer={viewReceipt ? <>
          <button onClick={()=>downloadReceiptPDF(viewReceipt)} className="flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors"><Download size={13}/> PDF</button>
          <button onClick={()=>printReceiptDoc(viewReceipt)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors"><Printer size={13}/> Print</button>
        </> : undefined}>
        {viewReceipt && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-y-1.5 text-[13px]">
              <span className="text-neutral-400">Date</span><span className="text-right font-semibold text-neutral-700 dark:text-neutral-200">{viewReceipt.receipt_date?.slice(0,10)}</span>
              <span className="text-neutral-400">Customer</span><span className="text-right font-semibold text-neutral-700 dark:text-neutral-200">{viewReceipt.guest_name ?? viewReceipt.customer_name ?? 'Walk-in'}</span>
              <span className="text-neutral-400">Reference</span><span className="text-right text-neutral-600 dark:text-neutral-300">{viewReceipt.reference ?? '—'}</span>
              <span className="text-neutral-400">Method</span><span className="text-right capitalize text-neutral-600 dark:text-neutral-300">{viewReceipt.payment_method.replace(/_/g,' ')}</span>
              <span className="text-neutral-400">Status</span><span className={`justify-self-end rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${INV_BADGE[viewReceipt.status] ?? ''}`}>{viewReceipt.status}</span>
            </div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-neutral-100 text-left text-neutral-400 dark:border-white/[0.06]"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 text-right">Price</th><th className="py-1.5 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.04]">
                {viewReceipt.lines.map(l => (
                  <tr key={l.id}><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right">{Number(l.quantity)}</td><td className="py-1.5 text-right">${Number(l.unit_price).toFixed(2)}</td><td className="py-1.5 text-right font-semibold">${Number(l.amount).toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-neutral-100 pt-3 text-[15px] font-extrabold text-neutral-900 dark:border-white/[0.06] dark:text-white">
              Total: {viewReceipt.currency} ${Number(viewReceipt.total_amount).toFixed(2)}
            </div>
            {viewReceipt.notes && <p className="rounded-xl bg-neutral-50 p-3 text-[12.5px] text-neutral-500 dark:bg-white/[0.03] dark:text-neutral-400">{viewReceipt.notes}</p>}
          </div>
        )}
      </Modal>

      {/* ── Delete Receipt ───────────────────────────────────────────────── */}
      <ConfirmModal
        open={mode === 'deleteReceipt'} onClose={close} onConfirm={doDeleteReceipt} loading={saving}
        title="Delete Receipt" confirmLabel="Delete"
        message={<>Delete receipt <b>{activeReceipt?.receipt_number}</b>? This cannot be undone.</>}
      />

      {/* ── View Invoice (itemized) ──────────────────────────────────────── */}
      <Modal open={mode === 'viewInvoice'} onClose={close}
        title={invDetail ? `Invoice ${invDetail.invoice_number}` : 'Invoice'} size="md"
        footer={invDetail ? (
          <button onClick={()=>printInvoiceBill(invDetail)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Printer size={13}/> Print Bill
          </button>
        ) : undefined}>
        {invDetail && (
          <div className="space-y-4">
            {/* Bill header info */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 text-[12.5px] dark:border-white/[0.05] dark:bg-white/[0.02] sm:grid-cols-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Date</p><p className="font-semibold text-neutral-700 dark:text-neutral-200">{invDetail.invoice_date?.slice(0,10)}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Guest</p><p className="font-semibold text-neutral-700 dark:text-neutral-200">{invDetail.guest_name ?? 'Walk-in'}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Status</p><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize ${INV_BADGE[invDetail.status] ?? ''}`}>{invDetail.status.replace(/_/g,' ')}</span></div>
              {invDetail.order_ref && <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Order No</p><p className="font-mono font-semibold text-neutral-700 dark:text-neutral-200">{invDetail.order_ref}</p></div>}
              {invDetail.table_number && <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Table</p><p className="font-semibold text-neutral-700 dark:text-neutral-200">{invDetail.table_number}</p></div>}
              {invDetail.payment_method && <div><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Method</p><p className="font-semibold capitalize text-neutral-700 dark:text-neutral-200">{invDetail.payment_method.replace(/_/g,' ')}</p></div>}
            </div>

            {/* Items */}
            {invDetail.lines.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 py-8 text-center dark:border-white/[0.08]">
                <UtensilsCrossed size={22} className="text-neutral-300"/>
                <p className="text-[12.5px] text-neutral-400">No line items on this invoice.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-white/[0.07]">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-neutral-200/70 bg-neutral-50 text-left text-[11px] font-bold uppercase tracking-wide text-neutral-400 dark:border-white/[0.07] dark:bg-white/[0.03]">
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-4 py-2.5 text-center">Qty</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.04]">
                    {invDetail.lines.map(l => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 font-semibold text-neutral-800 dark:text-neutral-200">{l.description}</td>
                        <td className="px-4 py-2.5 text-center text-neutral-600 dark:text-neutral-300">{Number(l.quantity)}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-500 dark:text-neutral-400">${Number(l.unit_price).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-neutral-800 dark:text-white">${Number(l.line_total ?? Number(l.quantity) * Number(l.unit_price)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="space-y-1.5 rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 text-[13px] dark:border-white/[0.05] dark:bg-white/[0.02]">
              <div className="flex justify-between text-neutral-500 dark:text-neutral-400"><span>Total Qty: {invDetail.lines.reduce((s,l)=>s+Number(l.quantity),0)}</span><span>Sub Total &nbsp; ${Number(invDetail.subtotal).toFixed(2)}</span></div>
              {Number(invDetail.discount_amount) > 0 && <div className="flex justify-between text-neutral-500 dark:text-neutral-400"><span>Discount</span><span>-${Number(invDetail.discount_amount).toFixed(2)}</span></div>}
              {Number(invDetail.service_charge) > 0 && <div className="flex justify-between text-neutral-500 dark:text-neutral-400"><span>Service Charge</span><span>${Number(invDetail.service_charge).toFixed(2)}</span></div>}
              <div className="flex justify-between text-neutral-500 dark:text-neutral-400"><span>VAT{Number(invDetail.vat_rate) > 0 ? ` (${Number(invDetail.vat_rate)}%)` : ''}</span><span>${Number(invDetail.tax_amount).toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-neutral-200/70 pt-2 text-[15px] font-extrabold text-neutral-900 dark:border-white/[0.07] dark:text-white">
                <span>TOTAL</span><span>${Number(invDetail.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400"><span>Paid</span><span>${Number(invDetail.amount_paid).toFixed(2)}</span></div>
              <div className={`flex justify-between font-bold ${Number(invDetail.amount_due) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}`}>
                <span>Balance Due</span><span>${Number(invDetail.amount_due).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
