import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, CreditCard, XCircle } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface Invoice {
  id: string; invoice_number: string; invoice_date: string
  guest_name: string; reference_type: string
  total_amount: number; amount_paid: number; balance_due: number; status: string
}
interface Guest { id: string; full_name: string }
interface InvForm { reference_type: string; guest_id: string; total_amount: string; notes: string }

const STATUS_BADGE: Record<string,string> = {
  paid:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  unpaid:         'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  draft:          'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  voided:         'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500',
}

const REF_TYPES = ['hotel_booking','restaurant_order','manual']

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [guests,   setGuests]   = useState<Guest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [mode,     setMode]     = useState<null | 'create' | 'pay' | 'void'>(null)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [payAmt,   setPayAmt]   = useState('')
  const [form,     setForm]     = useState<InvForm>({ reference_type:'manual', guest_id:'', total_amount:'', notes:'' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [iRes, gRes] = await Promise.all([
        api.get('/accounting/invoices'),
        api.get('/hotel/guests'),
      ])
      setInvoices(iRes.data.data)
      setGuests(gRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const totalPaid = invoices.reduce((s,i) => s + Number(i.amount_paid || 0), 0)
  const totalDue  = invoices.reduce((s,i) => s + Number(i.balance_due || 0), 0)

  const openCreate = () => { setForm({ reference_type:'manual', guest_id: guests[0]?.id??'', total_amount:'', notes:'' }); setMode('create'); setError('') }
  const openPay    = (i: Invoice) => { setSelected(i); setPayAmt(String(i.balance_due)); setMode('pay'); setError('') }
  const openVoid   = (i: Invoice) => { setSelected(i); setMode('void'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError('') }

  const doCreate = async () => {
    if (!form.total_amount || !form.guest_id) { setError('Guest and amount are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/accounting/invoices', {
        reference_type: form.reference_type,
        guest_id:       form.guest_id || undefined,
        total_amount:   parseFloat(form.total_amount),
        notes:          form.notes || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doPay = async () => {
    if (!selected || !payAmt) { setError('Amount is required'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/accounting/invoices/${selected.id}/payment`, { amount: parseFloat(payAmt) })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doVoid = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.patch(`/accounting/invoices/${selected.id}/void`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
  }

  const COLS: DTColumn<Invoice>[] = [
    { key:'invoice_number', label:'Invoice #', render:r=><span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.invoice_number}</span> },
    { key:'invoice_date',   label:'Date',      render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.invoice_date?.slice(0,10)}</span> },
    { key:'guest_name',     label:'Reference', render:r=><span className="font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.guest_name ?? '—'}</span> },
    { key:'reference_type', label:'Type',      render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.reference_type?.replace(/_/g,' ')}</span> },
    { key:'total_amount',   label:'Total',     render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.total_amount).toFixed(2)}</span>, exportValue:r=>r.total_amount },
    { key:'amount_paid',    label:'Paid',      render:r=><span className="text-emerald-600 dark:text-emerald-400">${Number(r.amount_paid||0).toFixed(2)}</span>, exportValue:r=>r.amount_paid },
    { key:'balance_due',    label:'Balance',   render:r=><span className={`font-bold ${Number(r.balance_due)>0?'text-rose-600 dark:text-rose-400':'text-neutral-400'}`}>${Number(r.balance_due||0).toFixed(2)}</span>, exportValue:r=>r.balance_due },
    { key:'status',         label:'Status',    render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_BADGE[r.status]??''}`}>{r.status?.replace('_',' ')}</span> },
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        {['unpaid','partially_paid'].includes(r.status) && (
          <button onClick={()=>openPay(r)} className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 transition-colors">
            <CreditCard size={11}/> Pay
          </button>
        )}
        {!['voided','paid'].includes(r.status) && (
          <button onClick={()=>openVoid(r)} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
            <XCircle size={11}/> Void
          </button>
        )}
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Invoices</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{invoices.length} invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-violet-300 hover:text-violet-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-violet-700 transition-colors">
            <Plus size={15}/> New Invoice
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Total Collected</p>
          <p className="mt-1 text-[22px] font-extrabold text-emerald-700 dark:text-emerald-300">${totalPaid.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200/60 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">Outstanding</p>
          <p className="mt-1 text-[22px] font-extrabold text-rose-700 dark:text-rose-300">${totalDue.toFixed(2)}</p>
        </div>
      </div>

      <DataTable columns={COLS} data={invoices} title="Invoices" filename="invoices"
        rowKey={r=>r.id} searchPlaceholder="Search invoice, guest…" loading={loading}/>

      {/* Create Modal */}
      <Modal open={mode==='create'} onClose={close} title="New Invoice" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doCreate} disabled={saving || !form.guest_id || !form.total_amount}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Create
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Type">
            <select value={form.reference_type} onChange={e=>setForm(p=>({...p,reference_type:e.target.value}))} className={INPUT}>
              {REF_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </Field>
          <Field label="Guest">
            <select value={form.guest_id} onChange={e=>setForm(p=>({...p,guest_id:e.target.value}))} className={INPUT}>
              <option value="">— Select guest —</option>
              {guests.map(g=><option key={g.id} value={g.id}>{g.full_name}</option>)}
            </select>
          </Field>
          <Field label="Total Amount ($)">
            <input type="number" min="0" step="0.01" value={form.total_amount}
              onChange={e=>setForm(p=>({...p,total_amount:e.target.value}))} placeholder="0.00" className={INPUT}/>
          </Field>
          <Field label="Notes">
            <input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
              placeholder="Optional notes…" className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* Pay Modal */}
      <Modal open={mode==='pay'} onClose={close} title={`Record Payment — ${selected?.invoice_number}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doPay} disabled={saving || !payAmt}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Record Payment
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-500/10">
            <p className="text-[13px] font-bold text-indigo-800 dark:text-indigo-300">{selected?.invoice_number}</p>
            <p className="text-[12px] text-indigo-600 dark:text-indigo-400">Balance due: ${Number(selected?.balance_due||0).toFixed(2)}</p>
          </div>
          <Field label="Payment Amount ($)">
            <input type="number" min="0" step="0.01" value={payAmt}
              onChange={e=>setPayAmt(e.target.value)} className={INPUT}/>
          </Field>
        </div>
      </Modal>

      {/* Void Confirm */}
      <Modal open={mode==='void'} onClose={close} title="Void Invoice" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doVoid} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Void
          </button>
        </>}>
        <div className="text-center py-2">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Void "{selected?.invoice_number}"?</p>
          <p className="mt-1 text-[13px] text-neutral-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  )
}
