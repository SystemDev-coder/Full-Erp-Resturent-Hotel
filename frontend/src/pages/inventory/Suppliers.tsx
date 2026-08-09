import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, Truck, Trash2, Pencil, Phone, Mail } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types (mirror the supplier table) ────────────────────────────────────────

interface Supplier {
  id: string; name: string; contact_name?: string
  phone?: string; email?: string; address?: string
  tax_id?: string; begin_balance: string; is_active: boolean
}

interface SupplierForm {
  name: string; contact_name: string; phone: string
  email: string; address: string; tax_id: string; begin_balance: string
}

const EMPTY: SupplierForm = {
  name: '', contact_name: '', phone: '', email: '', address: '', tax_id: '', begin_balance: '0',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const [mode,     setMode]     = useState<null | 'add' | 'edit' | 'delete'>(null)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [form,     setForm]     = useState<SupplierForm>(EMPTY)

  const f = (k: keyof SupplierForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/inventory/suppliers')
      setSuppliers(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd  = () => { setForm(EMPTY); setSelected(null); setMode('add'); setError('') }
  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name, contact_name: s.contact_name ?? '', phone: s.phone ?? '',
      email: s.email ?? '', address: s.address ?? '', tax_id: s.tax_id ?? '',
      begin_balance: String(s.begin_balance ?? 0),
    })
    setSelected(s); setMode('edit'); setError('')
  }
  const openDelete = (s: Supplier) => { setSelected(s); setMode('delete'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError('') }

  const save = async () => {
    if (!form.name.trim()) { setError('Supplier name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name:          form.name.trim(),
        contact_name:  form.contact_name || undefined,
        phone:         form.phone || undefined,
        email:         form.email || undefined,
        address:       form.address || undefined,
        tax_id:        form.tax_id || undefined,
        begin_balance: Number(form.begin_balance) || 0,
      }
      if (mode === 'add') await api.post('/inventory/suppliers', payload)
      else if (selected)   await api.put(`/inventory/suppliers/${selected.id}`, payload)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.delete(`/inventory/suppliers/${selected.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const COLS: DTColumn<Supplier>[] = [
    { key:'name', label:'Supplier', render:s=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          <Truck size={15}/>
        </div>
        <div>
          <p className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{s.name}</p>
          <p className="text-[11px] text-neutral-400">{s.contact_name ?? '—'}</p>
        </div>
      </div>
    )},
    { key:'phone', label:'Phone', render:s=>(
      <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
        {s.phone ? <><Phone size={11}/> {s.phone}</> : '—'}
      </span>
    )},
    { key:'email', label:'Email', render:s=>(
      <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
        {s.email ? <><Mail size={11}/> {s.email}</> : '—'}
      </span>
    )},
    { key:'tax_id', label:'Tax ID', render:s=><span className="font-mono text-[12px] text-neutral-500">{s.tax_id ?? '—'}</span> },
    { key:'begin_balance', label:'Begin Balance', render:s=>(
      <span className="font-bold text-neutral-800 dark:text-white">${Number(s.begin_balance).toFixed(2)}</span>
    ), exportValue:s=>s.begin_balance },
    { key:'is_active', label:'Status', render:s=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        s.is_active
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}>{s.is_active ? 'Active' : 'Inactive'}</span>
    )},
    { key:'_act', label:'', sortable:false, render:s=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEdit(s)}
          className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={()=>openDelete(s)}
          className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Suppliers</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {suppliers.length} suppliers · {suppliers.filter(s=>s.is_active).length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
            <Plus size={15}/> New Supplier
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <DataTable columns={COLS} data={suppliers} title="Suppliers" filename="suppliers"
        rowKey={s=>s.id} searchPlaceholder="Search supplier, contact, phone…" loading={loading}/>

      {/* Add / Edit */}
      <Modal open={mode === 'add' || mode === 'edit'} onClose={close}
        title={mode === 'add' ? 'New Supplier' : `Edit: ${selected?.name ?? ''}`} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={!form.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'add' ? 'Create Supplier' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier Name">
              <input value={form.name} onChange={e=>f('name', e.target.value)}
                placeholder="e.g. Banadir Foods Ltd" className={INPUT} autoFocus/>
            </Field>
            <Field label="Contact Person">
              <input value={form.contact_name} onChange={e=>f('contact_name', e.target.value)}
                placeholder="Contact name" className={INPUT}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={form.phone} onChange={e=>f('phone', e.target.value)}
                placeholder="+252 …" className={INPUT}/>
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e=>f('email', e.target.value)}
                placeholder="supplier@email.com" className={INPUT}/>
            </Field>
          </div>

          <Field label="Address">
            <input value={form.address} onChange={e=>f('address', e.target.value)}
              placeholder="Street, city…" className={INPUT}/>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax ID (optional)">
              <input value={form.tax_id} onChange={e=>f('tax_id', e.target.value)}
                placeholder="TIN-…" className={INPUT}/>
            </Field>
            <Field label="Opening Balance ($ we owe them)">
              <input type="number" step="0.01" value={form.begin_balance}
                onChange={e=>f('begin_balance', e.target.value)}
                placeholder="0.00" className={INPUT} disabled={mode === 'edit'}/>
            </Field>
          </div>
          {mode === 'add' && Number(form.begin_balance) > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              An unpaid opening bill of ${Number(form.begin_balance).toFixed(2)} will be created —
              it appears in payables and is settled through the normal pay flow.
            </p>
          )}
        </div>
      </Modal>

      {/* Delete */}
      <Modal open={mode === 'delete'} onClose={close} title="Delete Supplier" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDelete} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selected?.name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">Purchase history stays linked to this supplier.</p>
        </div>
      </Modal>
    </div>
  )
}
