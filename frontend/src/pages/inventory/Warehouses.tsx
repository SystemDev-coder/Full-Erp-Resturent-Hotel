import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, Warehouse as WarehouseIcon, Pencil, Power, Trash2 } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types (mirror the warehouse table) ───────────────────────────────────────

interface Warehouse {
  id: string; name: string; location_note?: string; is_active: boolean
}

interface WarehouseForm { name: string; location_note: string }

const EMPTY: WarehouseForm = { name: '', location_note: '' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const [mode,     setMode]     = useState<null | 'add' | 'edit' | 'delete'>(null)
  const [selected, setSelected] = useState<Warehouse | null>(null)
  const [form,     setForm]     = useState<WarehouseForm>(EMPTY)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/inventory/warehouses')
      setWarehouses(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd  = () => { setForm(EMPTY); setSelected(null); setMode('add'); setError('') }
  const openEdit = (w: Warehouse) => {
    setForm({ name: w.name, location_note: w.location_note ?? '' })
    setSelected(w); setMode('edit'); setError('')
  }
  const openDelete = (w: Warehouse) => { setSelected(w); setMode('delete'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError('') }

  const save = async () => {
    if (!form.name.trim()) { setError('Warehouse name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = { name: form.name.trim(), location_note: form.location_note || undefined }
      if (mode === 'add') await api.post('/inventory/warehouses', payload)
      else if (selected)   await api.put(`/inventory/warehouses/${selected.id}`, payload)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const toggleActive = async (w: Warehouse) => {
    try {
      await api.put(`/inventory/warehouses/${w.id}`, { is_active: !w.is_active })
      load()
    } catch (e) { setError(getApiErrorMessage(e)) }
  }

  const doDelete = async () => {
    if (!selected) return
    setSaving(true); setError('')
    try {
      await api.delete(`/inventory/warehouses/${selected.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }
  const COLS: DTColumn<Warehouse>[] = [
    { key:'name', label:'Warehouse', render:w=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          <WarehouseIcon size={15}/>
        </div>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{w.name}</span>
      </div>
    )},
    { key:'location_note', label:'Location', render:w=><span className="text-neutral-500 dark:text-neutral-400">{w.location_note ?? '—'}</span> },
    { key:'is_active', label:'Status', render:w=>(
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        w.is_active
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
      }`}>{w.is_active ? 'Active' : 'Inactive'}</span>
    )},
    { key:'_act', label:'', sortable:false, render:w=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openEdit(w)}
          className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>        <button onClick={()=>toggleActive(w)}
          title={w.is_active ? 'Deactivate' : 'Activate'}
          className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${
            w.is_active
              ? 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400'
              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400'
          }`}>
          <Power size={12}/>
        </button>
        <button onClick={()=>openDelete(w)}
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
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Warehouses</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {warehouses.length} warehouses · {warehouses.filter(w=>w.is_active).length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
            <Plus size={15}/> New Warehouse
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <DataTable columns={COLS} data={warehouses} title="Warehouses" filename="warehouses"
        rowKey={w=>w.id} searchPlaceholder="Search warehouses…" loading={loading}/>

      <Modal open={mode === 'add' || mode === 'edit'} onClose={close}
        title={mode === 'add' ? 'New Warehouse' : `Edit: ${selected?.name ?? ''}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={!form.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'add' ? 'Create Warehouse' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Warehouse Name">
            <input value={form.name} onChange={e=>setForm(p=>({...p, name: e.target.value}))}
              placeholder="e.g. Main Store" className={INPUT} autoFocus/>
          </Field>
          <Field label="Location Note (optional)">
            <input value={form.location_note} onChange={e=>setForm(p=>({...p, location_note: e.target.value}))}
              placeholder="e.g. Ground floor, behind kitchen" className={INPUT}/>
          </Field>
        </div>
      </Modal>
      <Modal open={mode === 'delete'} onClose={close} title="Delete Warehouse" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDelete} disabled={saving} className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} Delete
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selected?.name}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">Warehouses with stock cannot be deleted.</p>
        </div>
      </Modal>
    </div>
  )
}

