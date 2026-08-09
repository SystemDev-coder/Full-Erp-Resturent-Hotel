import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, CheckCircle2 } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface PayrollRun {
  id: string; period_label: string; period_start: string; period_end: string
  gross_total: number; net_total: number; status: string; staff_count: number
  created_at: string
}
interface PayLine {
  staff_id: string; staff_name: string; role: string; base_salary: number
  deductions: number; bonuses: number; net_pay: number
}

const STATUS_BADGE: Record<string,string> = {
  draft:     'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  processed: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  approved:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  paid:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
}

export default function Payroll() {
  const [runs,    setRuns]    = useState<PayrollRun[]>([])
  const [lines,   setLines]   = useState<PayLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [mode,    setMode]    = useState<null | 'create' | 'lines'>(null)
  const [selected,setSelected]= useState<PayrollRun | null>(null)
  const [form,    setForm]    = useState({ period_start: '', period_end: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/hr/payroll')
      setRuns(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
    const end   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10)
    setForm({ period_start: start, period_end: end })
    setMode('create'); setError('')
  }

  const openLines = async (run: PayrollRun) => {
    setSelected(run); setLines([]); setMode('lines')
    try {
      const r = await api.get(`/hr/payroll/${run.id}/lines`)
      setLines(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
  }

  const close = () => { setMode(null); setSelected(null); setLines([]); setError('') }

  const doCreate = async () => {
    if (!form.period_start || !form.period_end) { setError('Period dates are required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/hr/payroll', { period_start: form.period_start, period_end: form.period_end })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doApprove = async (id: string) => {
    setSaving(true)
    try {
      await api.patch(`/hr/payroll/${id}/approve`)
      load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const COLS: DTColumn<PayrollRun>[] = [
    { key:'period_label',  label:'Period',     render:r=><span className="font-semibold text-neutral-800 dark:text-neutral-200">{r.period_label ?? `${r.period_start?.slice(0,7)}`}</span> },
    { key:'period_start',  label:'From',       render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.period_start?.slice(0,10)}</span> },
    { key:'period_end',    label:'To',         render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.period_end?.slice(0,10)}</span> },
    { key:'staff_count',   label:'Staff',      render:r=><span className="font-semibold text-neutral-700 dark:text-neutral-300">{r.staff_count}</span>, exportValue:r=>r.staff_count },
    { key:'gross_total',   label:'Gross',      render:r=><span className="font-bold text-neutral-800 dark:text-white">${Number(r.gross_total).toFixed(2)}</span>, exportValue:r=>r.gross_total },
    { key:'net_total',     label:'Net',        render:r=><span className="font-bold text-emerald-700 dark:text-emerald-300">${Number(r.net_total).toFixed(2)}</span>, exportValue:r=>r.net_total },
    { key:'status',        label:'Status',     render:r=><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${STATUS_BADGE[r.status]??''}`}>{r.status}</span> },
    { key:'_act', label:'', sortable:false, render:r=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openLines(r)} className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-neutral-700 dark:text-neutral-300 transition-colors">
          View
        </button>
        {r.status === 'draft' && (
          <button onClick={()=>doApprove(r.id)} disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 transition-colors">
            <CheckCircle2 size={11}/> Approve
          </button>
        )}
      </div>
    )},
  ]

  const LINE_COLS: DTColumn<PayLine>[] = [
    { key:'staff_name',  label:'Staff',      render:r=><span className="font-semibold text-neutral-800 dark:text-neutral-200">{r.staff_name}</span> },
    { key:'role',        label:'Role',       render:r=><span className="capitalize text-neutral-500 dark:text-neutral-400">{r.role?.replace(/_/g,' ')}</span> },
    { key:'base_salary', label:'Base',       render:r=><span className="text-neutral-700 dark:text-neutral-300">${Number(r.base_salary).toFixed(2)}</span> },
    { key:'bonuses',     label:'Bonuses',    render:r=><span className="text-emerald-600 dark:text-emerald-400">+${Number(r.bonuses||0).toFixed(2)}</span> },
    { key:'deductions',  label:'Deductions', render:r=><span className="text-rose-600 dark:text-rose-400">−${Number(r.deductions||0).toFixed(2)}</span> },
    { key:'net_pay',     label:'Net Pay',    render:r=><span className="font-extrabold text-neutral-900 dark:text-white">${Number(r.net_pay).toFixed(2)}</span>, exportValue:r=>r.net_pay },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Payroll</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{runs.length} payroll runs</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-rose-300 hover:text-rose-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            <Plus size={15}/> Run Payroll
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <DataTable columns={COLS} data={runs} title="Payroll Runs" filename="payroll"
        rowKey={r=>r.id} searchPlaceholder="Search period…" loading={loading}/>

      {/* Create Modal */}
      <Modal open={mode==='create'} onClose={close} title="Run Payroll" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doCreate} disabled={saving || !form.period_start || !form.period_end}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Generate Payroll
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Field label="Period Start">
            <input type="date" value={form.period_start} onChange={e=>setForm(p=>({...p,period_start:e.target.value}))} className={INPUT}/>
          </Field>
          <Field label="Period End">
            <input type="date" value={form.period_end} onChange={e=>setForm(p=>({...p,period_end:e.target.value}))} className={INPUT}/>
          </Field>
          <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
            <p className="text-[12px] text-sky-700 dark:text-sky-300">Payroll will be calculated from all active staff base salaries for the selected period.</p>
          </div>
        </div>
      </Modal>

      {/* Lines Modal */}
      <Modal open={mode==='lines'} onClose={close}
        title={`Payroll Lines — ${selected?.period_label ?? selected?.period_start?.slice(0,7)}`} size="xl"
        footer={<CancelBtn onClick={close}/>}>
        <DataTable columns={LINE_COLS} data={lines} title="Payroll Lines" filename="payroll_lines" rowKey={r=>r.staff_id} searchPlaceholder="Search staff…"/>
      </Modal>
    </div>
  )
}
