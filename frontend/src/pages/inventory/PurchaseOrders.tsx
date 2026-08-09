import { useState, useEffect, useCallback } from 'react'
import {
  Plus, RefreshCw, CheckCircle2, Trash2, XCircle, ShoppingCart,
  FileText, PackageCheck, ListOrdered, Truck,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import { Tabs } from '@/components/ui/Tabs'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useToast } from '@/contexts/ToastContext'

// ─── Types (mirror purchase_order / purchase_line / goods_receipt tables) ─────

interface PO {
  id: string; po_number: string; supplier_name: string
  order_date: string; status: string; total_amount: string
}

interface POLine {
  id: string; po_id: string; po_number: string; po_status: string; order_date: string
  item_name: string; sku: string; unit_of_measure: string; supplier_name: string
  quantity_ordered: string; quantity_received: string; unit_cost: string; line_total: string
}

interface Receipt {
  id: string; receipt_number: string; received_at: string; notes?: string
  po_number: string; po_id: string; warehouse_name: string; supplier_name: string
  received_by_name?: string; total_value: string; line_count: string
}

interface ReceiptLine {
  id: string; receipt_number: string; received_at: string; po_number: string
  item_name: string; sku: string; unit_of_measure: string
  quantity_received: string; unit_cost: string; batch_number?: string; expiry_date?: string
}

interface Supplier  { id: string; name: string }
interface Warehouse { id: string; name: string }
interface Item      { id: string; name: string; sku: string; unit_of_measure: string; avg_cost: string }

// PO detail line (from GET /purchase-orders/:id) used by the receive modal
interface DetailLine {
  id: string; item_id: string; item_name: string; unit_of_measure: string
  quantity_ordered: string; quantity_received: string; unit_cost: string
}

// ─── Forms ────────────────────────────────────────────────────────────────────

interface FormLine { item_id: string; quantity_ordered: string; unit_cost: string }

interface POForm {
  supplier_id: string; warehouse_id: string
  order_date: string; expected_date: string; notes: string
  lines: FormLine[]
}

function todayISO() {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`
}

const EMPTY_LINE: FormLine = { item_id: '', quantity_ordered: '', unit_cost: '' }

const EMPTY_PO = (): POForm => ({
  supplier_id: '', warehouse_id: '', order_date: todayISO(), expected_date: '', notes: '',
  lines: [{ ...EMPTY_LINE }],
})

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  sent:      'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  received:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchaseOrders() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'orders' | 'lines' | 'receipts' | 'receiptLines'>('orders')

  const [pos,          setPos]          = useState<PO[]>([])
  const [poLines,      setPoLines]      = useState<POLine[]>([])
  const [receipts,     setReceipts]     = useState<Receipt[]>([])
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([])
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([])
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([])
  const [items,        setItems]        = useState<Item[]>([])

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode,      setMode]      = useState<null | 'create' | 'receive' | 'cancel' | 'delete'>(null)
  const [receivePO, setReceivePO] = useState<PO | null>(null)
  const [cancelPO,  setCancelPO]  = useState<PO | null>(null)
  const [deletePOTarget, setDeletePOTarget] = useState<PO | null>(null)
  const [recvLines, setRecvLines] = useState<(DetailLine & { receive_now: string })[]>([])
  const [form,      setForm]      = useState<POForm>(EMPTY_PO)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, plRes, gRes, glRes, sRes, wRes, iRes] = await Promise.all([
        api.get('/inventory/purchase-orders'),
        api.get('/inventory/purchase-lines'),
        api.get('/inventory/goods-receipts'),
        api.get('/inventory/goods-receipt-lines'),
        api.get('/inventory/suppliers'),
        api.get('/inventory/warehouses'),
        api.get('/inventory/items'),
      ])
      setPos(pRes.data.data)
      setPoLines(plRes.data.data)
      setReceipts(gRes.data.data)
      setReceiptLines(glRes.data.data)
      setSuppliers(sRes.data.data)
      setWarehouses(wRes.data.data)
      setItems(iRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const close = () => { setMode(null); setReceivePO(null); setCancelPO(null); setDeletePOTarget(null); setError('') }

  // ── Create PO ───────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm({ ...EMPTY_PO(), supplier_id: suppliers[0]?.id ?? '', warehouse_id: warehouses[0]?.id ?? '' })
    setMode('create'); setError('')
  }

  const setLine = (idx: number, k: keyof FormLine, v: string) =>
    setForm(p => ({ ...p, lines: p.lines.map((l, i) => i === idx ? { ...l, [k]: v } : l) }))

  const pickLineItem = (idx: number, itemId: string) => {
    const it = items.find(i => i.id === itemId)
    setForm(p => ({
      ...p,
      lines: p.lines.map((l, i) => i === idx
        ? { ...l, item_id: itemId, unit_cost: l.unit_cost || (it ? Number(it.avg_cost).toFixed(2) : '') }
        : l),
    }))
  }

  const addLine    = () => setForm(p => ({ ...p, lines: [...p.lines, { ...EMPTY_LINE }] }))
  const removeLine = (idx: number) => setForm(p => ({ ...p, lines: p.lines.filter((_, i) => i !== idx) }))

  const formTotal = form.lines.reduce((sum, l) =>
    sum + (Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0), 0)

  const validLines = form.lines.filter(l => l.item_id && Number(l.quantity_ordered) > 0 && Number(l.unit_cost) > 0)

  const doCreate = async () => {
    if (!form.supplier_id || !form.warehouse_id) { setError('Supplier and warehouse are required'); return }
    if (validLines.length === 0) { setError('Add at least one line with item, quantity and unit cost'); return }
    setSaving(true); setError('')
    try {
      await api.post('/inventory/purchase-orders', {
        supplier_id:   form.supplier_id,
        warehouse_id:  form.warehouse_id,
        order_date:    form.order_date,
        expected_date: form.expected_date || undefined,
        notes:         form.notes || undefined,
        lines: validLines.map(l => ({
          item_id:          l.item_id,
          quantity_ordered: Number(l.quantity_ordered),
          unit_cost:        Number(l.unit_cost),
        })),
      })
      close(); showToast('Purchase order created', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // ── Receive PO ──────────────────────────────────────────────────────────────

  const openReceive = async (po: PO) => {
    setReceivePO(po); setMode('receive'); setError(''); setRecvLines([])
    try {
      const r = await api.get(`/inventory/purchase-orders/${po.id}`)
      const lines: DetailLine[] = r.data.data.lines ?? []
      setRecvLines(
        lines
          .filter(l => Number(l.quantity_ordered) > Number(l.quantity_received))
          .map(l => ({
            ...l,
            receive_now: String(Number(l.quantity_ordered) - Number(l.quantity_received)),
          }))
      )
    } catch (e) { setError(getApiErrorMessage(e)) }
  }

  const setRecvQty = (id: string, v: string) =>
    setRecvLines(p => p.map(l => l.id === id ? { ...l, receive_now: v } : l))

  const doReceive = async () => {
    if (!receivePO) return
    const toReceive = recvLines.filter(l => Number(l.receive_now) > 0)
    if (toReceive.length === 0) { setError('Enter a quantity to receive on at least one line'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/inventory/purchase-orders/${receivePO.id}/receive`, {
        receipt_lines: toReceive.map(l => ({
          po_line_id:        l.id,
          item_id:           l.item_id,
          quantity_received: Number(l.receive_now),
          unit_cost:         Number(l.unit_cost),
        })),
      })
      close(); showToast('Goods received', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // ── Cancel PO ───────────────────────────────────────────────────────────────

  const openCancel = (po: PO) => { setCancelPO(po); setMode('cancel'); setError('') }

  const doCancel = async () => {
    if (!cancelPO) return
    setSaving(true); setError('')
    try {
      await api.patch(`/inventory/purchase-orders/${cancelPO.id}/cancel`)
      close(); showToast('Purchase order cancelled', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); setError(msg); showToast(msg, 'error') }
    finally { setSaving(false) }
  }

  // ── Delete PO (draft only) ──────────────────────────────────────────────────

  const openDeletePO = (po: PO) => { setDeletePOTarget(po); setMode('delete'); setError('') }

  const doDeletePO = async () => {
    if (!deletePOTarget) return
    setSaving(true)
    try {
      await api.delete(`/inventory/purchase-orders/${deletePOTarget.id}`)
      close(); showToast('Purchase order deleted', 'success'); load()
    } catch (e) { const msg = getApiErrorMessage(e); showToast(msg, 'error'); setError(msg) }
    finally { setSaving(false) }
  }

  // ── Columns ─────────────────────────────────────────────────────────────────

  const PO_COLS: DTColumn<PO>[] = [
    { key:'po_number',     label:'PO #',     render:r=><span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.po_number}</span> },
    { key:'supplier_name', label:'Supplier', render:r=><span className="font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.supplier_name}</span> },
    { key:'order_date',    label:'Date',     render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.order_date?.slice(0,10)}</span> },
    { key:'total_amount',  label:'Total',    render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.total_amount).toFixed(2)}</span>, exportValue:r=>r.total_amount },
    { key:'status',        label:'Status',   render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_BADGE[r.status] ?? ''}`}>{r.status}</span> },
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        {['draft','sent','partial'].includes(r.status) ? <button onClick={()=>openReceive(r)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 transition-colors">
            <CheckCircle2 size={11}/> Receive
          </button>
        : null}
        {['draft','sent','partial'].includes(r.status) && (
          <button onClick={()=>openCancel(r)} className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><XCircle size={11}/> Cancel</button>
        )}
        {r.status === 'draft' && (
          <button onClick={()=>openDeletePO(r)} title="Delete draft"
            className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors"><Trash2 size={11}/></button>
        )}
      </div>
    )},
  ]

  const LINE_COLS: DTColumn<POLine>[] = [
    { key:'po_number', label:'PO #', render:r=>(
      <div>
        <p className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.po_number}</p>
        <p className="text-[11px] text-neutral-400">{r.order_date?.slice(0,10)}</p>
      </div>
    )},
    { key:'item_name', label:'Item', render:r=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.item_name}</p>
        <p className="font-mono text-[11px] text-neutral-400">{r.sku}</p>
      </div>
    )},
    { key:'supplier_name',    label:'Supplier', render:r=><span className="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{r.supplier_name}</span> },
    { key:'quantity_ordered', label:'Ordered',  render:r=><span className="font-bold text-neutral-800 dark:text-white">{Number(r.quantity_ordered)} {r.unit_of_measure}</span>, exportValue:r=>r.quantity_ordered },
    { key:'quantity_received', label:'Received', render:r=>{
      const full = Number(r.quantity_received) >= Number(r.quantity_ordered)
      return <span className={`font-bold ${full ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {Number(r.quantity_received)} {r.unit_of_measure}
      </span>
    }, exportValue:r=>r.quantity_received },
    { key:'unit_cost',  label:'Unit Cost', render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.unit_cost).toFixed(2)}</span>, exportValue:r=>r.unit_cost },
    { key:'line_total', label:'Line Total', render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.line_total).toFixed(2)}</span>, exportValue:r=>r.line_total },
    { key:'po_status',  label:'Status', render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_BADGE[r.po_status] ?? ''}`}>{r.po_status}</span> },
  ]

  const RECEIPT_COLS: DTColumn<Receipt>[] = [
    { key:'receipt_number', label:'GRN #', render:r=><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{r.receipt_number}</span> },
    { key:'po_number',      label:'PO #',  render:r=><span className="font-mono text-indigo-600 dark:text-indigo-400">{r.po_number}</span> },
    { key:'supplier_name',  label:'Supplier',  render:r=><span className="text-neutral-700 dark:text-neutral-300 whitespace-nowrap">{r.supplier_name}</span> },
    { key:'warehouse_name', label:'Warehouse', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.warehouse_name}</span> },
    { key:'received_at', label:'Received', render:r=>(
      <div>
        <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">
          {new Date(r.received_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
        </p>
        <p className="text-[11px] text-neutral-400">{r.received_by_name ?? '—'}</p>
      </div>
    )},
    { key:'line_count',  label:'Lines', render:r=><span className="font-bold text-neutral-700 dark:text-neutral-300">{r.line_count}</span>, exportValue:r=>r.line_count },
    { key:'total_value', label:'Value', render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.total_value).toFixed(2)}</span>, exportValue:r=>r.total_value },
  ]

  const RLINE_COLS: DTColumn<ReceiptLine>[] = [
    { key:'receipt_number', label:'GRN #', render:r=><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{r.receipt_number}</span> },
    { key:'po_number',      label:'PO #',  render:r=><span className="font-mono text-indigo-600 dark:text-indigo-400">{r.po_number}</span> },
    { key:'item_name', label:'Item', render:r=>(
      <div>
        <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.item_name}</p>
        <p className="font-mono text-[11px] text-neutral-400">{r.sku}</p>
      </div>
    )},
    { key:'quantity_received', label:'Qty', render:r=><span className="font-bold text-emerald-600 dark:text-emerald-400">+{Number(r.quantity_received)} {r.unit_of_measure}</span>, exportValue:r=>r.quantity_received },
    { key:'unit_cost',    label:'Unit Cost', render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.unit_cost).toFixed(2)}</span>, exportValue:r=>r.unit_cost },
    { key:'batch_number', label:'Batch',  render:r=><span className="font-mono text-[12px] text-neutral-500">{r.batch_number ?? '—'}</span> },
    { key:'expiry_date',  label:'Expiry', render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.expiry_date?.slice(0,10) ?? '—'}</span> },
    { key:'received_at',  label:'Date',   render:r=><span className="text-[12px] text-neutral-400">{new Date(r.received_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span> },
  ]

  const pendingCount = pos.filter(p => ['draft','sent','partial'].includes(p.status)).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Purchase Orders</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {pos.length} orders · {pendingCount} pending · {receipts.length} receipts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
            <Plus size={15}/> New PO
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {/* Tabs — one per DB table */}
      <Tabs
        active={tab}
        onChange={k => setTab(k as typeof tab)}
        tabs={[
          { key: 'orders',       label: 'Purchase Orders', icon: <ShoppingCart size={14}/>, count: pos.length },
          { key: 'lines',        label: 'Purchase Lines',  icon: <ListOrdered size={14}/>,  count: poLines.length },
          { key: 'receipts',     label: 'Goods Receipts',  icon: <PackageCheck size={14}/>, count: receipts.length },
          { key: 'receiptLines', label: 'Receipt Lines',   icon: <FileText size={14}/>,     count: receiptLines.length },
        ]}
      />

      {tab === 'orders' && (
        <DataTable columns={PO_COLS} data={pos} title="Purchase Orders" filename="purchase_orders"
          rowKey={r=>r.id} searchPlaceholder="Search PO, supplier…" loading={loading}/>
      )}
      {tab === 'lines' && (
        <DataTable columns={LINE_COLS} data={poLines} title="Purchase Lines" filename="purchase_lines"
          rowKey={r=>r.id} searchPlaceholder="Search PO, item, supplier…" loading={loading}/>
      )}
      {tab === 'receipts' && (
        <DataTable columns={RECEIPT_COLS} data={receipts} title="Goods Receipts" filename="goods_receipts"
          rowKey={r=>r.id} searchPlaceholder="Search GRN, PO, supplier…" loading={loading}/>
      )}
      {tab === 'receiptLines' && (
        <DataTable columns={RLINE_COLS} data={receiptLines} title="Goods Receipt Lines" filename="goods_receipt_lines"
          rowKey={r=>r.id} searchPlaceholder="Search GRN, item…" loading={loading}/>
      )}

      {/* ── Create PO Modal ─────────────────────────────────────────────── */}
      <Modal open={mode === 'create'} onClose={close} title="New Purchase Order" size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doCreate} disabled={saving || !form.supplier_id || !form.warehouse_id || validLines.length === 0}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Create PO — ${formTotal.toFixed(2)}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <Select value={form.supplier_id} onChange={v=>setForm(p=>({...p, supplier_id: v}))}
                placeholder="— Select supplier —"
                options={suppliers.map(s => ({ value: s.id, label: s.name }))}/>
            </Field>
            <Field label="Deliver To (warehouse)">
              <Select value={form.warehouse_id} onChange={v=>setForm(p=>({...p, warehouse_id: v}))}
                placeholder="— Select warehouse —"
                options={warehouses.map(w => ({ value: w.id, label: w.name }))}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Order Date">
              <DatePicker value={form.order_date} onChange={v=>setForm(p=>({...p, order_date: v}))}/>
            </Field>
            <Field label="Expected Delivery (optional)">
              <DatePicker value={form.expected_date} onChange={v=>setForm(p=>({...p, expected_date: v}))} placeholder="Select date"/>
            </Field>
          </div>

          {/* Line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-neutral-600 dark:text-neutral-400">Line Items</p>
              <button type="button" onClick={addLine}
                className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 transition-colors">
                <Plus size={11}/> Add Line
              </button>
            </div>

            <div className="space-y-2">
              {form.lines.map((line, idx) => (
                <div key={idx} className="flex items-end gap-2 rounded-xl border border-neutral-100 bg-neutral-50/60 p-2.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
                  <div className="flex-1 min-w-0">
                    {idx === 0 && <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">Item</p>}
                    <Select value={line.item_id} onChange={v=>pickLineItem(idx, v)}
                      placeholder="— Select item —"
                      options={items.map(i => ({ value: i.id, label: `${i.name} (${i.unit_of_measure})` }))}/>
                  </div>
                  <div className="w-24 shrink-0">
                    {idx === 0 && <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">Qty</p>}
                    <input type="number" step="0.1" min="0" value={line.quantity_ordered}
                      onChange={e=>setLine(idx, 'quantity_ordered', e.target.value)}
                      placeholder="0" className={INPUT}/>
                  </div>
                  <div className="w-28 shrink-0">
                    {idx === 0 && <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">Unit Cost $</p>}
                    <input type="number" step="0.01" min="0" value={line.unit_cost}
                      onChange={e=>setLine(idx, 'unit_cost', e.target.value)}
                      placeholder="0.00" className={INPUT}/>
                  </div>
                  <div className="w-24 shrink-0 pb-2.5 text-right">
                    {idx === 0 && <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">Total</p>}
                    <span className="text-[13px] font-bold text-neutral-800 dark:text-white">
                      ${((Number(line.quantity_ordered) || 0) * (Number(line.unit_cost) || 0)).toFixed(2)}
                    </span>
                  </div>
                  <button type="button" onClick={()=>removeLine(idx)} disabled={form.lines.length === 1}
                    className="mb-1.5 shrink-0 rounded-lg bg-rose-50 p-1.5 text-rose-500 hover:bg-rose-100 disabled:opacity-30 dark:bg-rose-500/10 transition-colors">
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>

            {/* Live total */}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
              <span className="text-[12.5px] font-semibold text-emerald-800 dark:text-emerald-300">Order Total</span>
              <span className="text-[18px] font-extrabold text-emerald-700 dark:text-emerald-300">${formTotal.toFixed(2)}</span>
            </div>
          </div>

          <Field label="Notes (optional)">
            <input value={form.notes} onChange={e=>setForm(p=>({...p, notes: e.target.value}))}
              placeholder="Delivery instructions…" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* ── Receive PO Modal ────────────────────────────────────────────── */}
      <Modal open={mode === 'receive'} onClose={close}
        title={`Receive — ${receivePO?.po_number ?? ''}`} size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doReceive} disabled={saving || recvLines.every(l => !Number(l.receive_now))}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <PackageCheck size={13}/>}
            Confirm Receipt
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
            <p className="flex items-center gap-2 text-[12.5px] font-bold text-sky-800 dark:text-sky-300">
              <Truck size={13}/> {receivePO?.supplier_name} — {receivePO?.po_number}
            </p>
            <p className="mt-0.5 text-[12px] text-sky-600 dark:text-sky-400">
              Enter the quantity that actually arrived per line. Stock and average cost update automatically.
            </p>
          </div>

          {recvLines.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-neutral-400">
              {error ? '' : 'Loading lines… (or everything is already received)'}
            </p>
          ) : (
            <div className="space-y-2">
              {recvLines.map(l => {
                const remaining = Number(l.quantity_ordered) - Number(l.quantity_received)
                return (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{l.item_name}</p>
                      <p className="text-[11px] text-neutral-400">
                        Ordered {Number(l.quantity_ordered)} · Received {Number(l.quantity_received)} · Remaining {remaining} {l.unit_of_measure}
                      </p>
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="number" step="0.1" min="0" max={remaining} value={l.receive_now}
                        onChange={e=>setRecvQty(l.id, e.target.value)} className={INPUT}/>
                    </div>
                    <span className="w-20 shrink-0 text-right text-[12px] text-neutral-500">
                      @ ${Number(l.unit_cost).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={mode === 'cancel'} onClose={close} title="Cancel Purchase Order" size="sm"
        footer={<><CancelBtn onClick={close}/><button onClick={doCancel} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">{saving ? <RefreshCw size={13} className="animate-spin"/> : <XCircle size={13}/>} Cancel PO</button></>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Cancel {cancelPO?.po_number}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">This keeps the order history but stops future receiving.</p>
        </div>
      </Modal>

      <ConfirmModal
        open={mode === 'delete'} onClose={close} onConfirm={doDeletePO} loading={saving}
        title="Delete Draft Purchase Order" confirmLabel="Delete"
        message={<>Delete <b>{deletePOTarget?.po_number}</b>? Only draft orders (nothing received yet) can be deleted — this cannot be undone.</>}
      />
    </div>
  )
}
