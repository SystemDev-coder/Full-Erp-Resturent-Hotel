import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, Plus } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface StockRow {
  item_id: string; item_name: string; category: string; unit_of_measure: string
  quantity_on_hand: number; reorder_level: number; unit_cost: number
  warehouse_name: string; last_updated: string
}
interface Form { item_id: string; quantity_change: string; reason: string }

export default function Stock() {
  const [stock,   setStock]   = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [mode,    setMode]    = useState<null | 'adjust'>(null)
  const [form,    setForm]    = useState<Form>({ item_id: '', quantity_change: '', reason: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/inventory/stock')
      setStock(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const lowStock = stock.filter(s => s.quantity_on_hand <= s.reorder_level)

  const openAdjust = () => { setForm({ item_id: '', quantity_change: '', reason: '' }); setMode('adjust'); setError('') }
  const close = () => { setMode(null); setError('') }

  const doAdjust = async () => {
    if (!form.item_id || !form.quantity_change || !form.reason) { setError('All fields are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/inventory/stock/adjust', {
        item_id: form.item_id,
        quantity_change: parseFloat(form.quantity_change),
        reason: form.reason,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const COLS: DTColumn<StockRow>[] = [
    { key:'item_name',        label:'Item',        render:r=><span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.item_name}</span> },
    { key:'category',         label:'Category',    render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.category?.replace(/_/g,' ')}</span> },
    { key:'unit_of_measure',  label:'Unit',        render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.unit_of_measure}</span> },
    { key:'quantity_on_hand', label:'On Hand',     render:r=>{
      const low = r.quantity_on_hand <= r.reorder_level
      return <span className={`font-bold ${low?'text-rose-600 dark:text-rose-400':'text-neutral-800 dark:text-white'}`}>
        {r.quantity_on_hand} {r.unit_of_measure}
        {low && <AlertTriangle size={12} className="inline ml-1 text-rose-500"/>}
      </span>
    }, exportValue:r=>r.quantity_on_hand },
    { key:'reorder_level',    label:'Reorder At',  render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.reorder_level} {r.unit_of_measure}</span>, exportValue:r=>r.reorder_level },
    { key:'unit_cost',        label:'Unit Cost',   render:r=><span className="text-neutral-500 dark:text-neutral-400">${Number(r.unit_cost).toFixed(2)}</span>, exportValue:r=>r.unit_cost },
    { key:'warehouse_name',   label:'Warehouse',   render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.warehouse_name ?? '—'}</span> },
    { key:'_low', label:'', sortable:false, render:r=>(
      r.quantity_on_hand <= r.reorder_level
        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Low Stock</span>
        : null
    )},
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Stock</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {stock.length} items
            {lowStock.length > 0 && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">{lowStock.length} low stock</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdjust}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 transition-colors">
            <Plus size={15}/> Adjust Stock
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {lowStock.length > 0 && (
        <div className="flex flex-wrap items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/25 dark:bg-rose-500/10">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"/>
          <div className="flex-1">
            <p className="text-[12.5px] font-bold text-rose-800 dark:text-rose-300">Low Stock Alert</p>
            <p className="text-[12px] text-rose-600 dark:text-rose-400">{lowStock.map(s => s.item_name).join(', ')}</p>
          </div>
        </div>
      )}

      <DataTable columns={COLS} data={stock} title="Stock" filename="stock_levels" rowKey={r=>r.item_id}
        searchPlaceholder="Search items…" loading={loading}/>

      <Modal open={mode === 'adjust'} onClose={close} title="Adjust Stock" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doAdjust} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Save Adjustment
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Item">
            <select value={form.item_id} onChange={e=>setForm(p=>({...p,item_id:e.target.value}))} className={INPUT}>
              <option value="">— Select item —</option>
              {stock.map(s=><option key={s.item_id} value={s.item_id}>{s.item_name} ({s.quantity_on_hand} {s.unit_of_measure})</option>)}
            </select>
          </Field>
          <Field label="Quantity Change (negative to reduce)">
            <input type="number" step="0.1" value={form.quantity_change}
              onChange={e=>setForm(p=>({...p,quantity_change:e.target.value}))}
              placeholder="e.g. 10 or -5" className={INPUT}/>
          </Field>
          <Field label="Reason">
            <input value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}
              placeholder="e.g. Purchase received, Waste adjustment…" className={INPUT}/>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
