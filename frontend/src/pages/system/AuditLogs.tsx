import { useState, useEffect, useCallback } from 'react'
import { Shield, RefreshCw } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface AuditLog {
  id: string; action: string; table_name: string; record_id: string
  user_name: string; user_email: string; branch_name: string
  old_values: Record<string,unknown> | null; new_values: Record<string,unknown> | null
  ip_address: string; created_at: string
}

const ACTION_BADGE: Record<string,string> = {
  INSERT:         'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  UPDATE:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  DELETE:         'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  LOGIN:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  LOGIN_FAILED:   'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  CHECKIN:        'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  CHECKOUT:       'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  APPROVE:        'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
}

export default function AuditLogs() {
  const [logs,    setLogs]    = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/system/audit?limit=200')
      setLogs(r.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const COLS: DTColumn<AuditLog>[] = [
    { key:'created_at',  label:'Time',     render:r=><span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</span> },
    { key:'action',      label:'Action',   render:r=><span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${ACTION_BADGE[r.action]??'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'}`}>{r.action}</span> },
    { key:'table_name',  label:'Resource', render:r=><span className="text-neutral-600 dark:text-neutral-400 capitalize">{r.table_name?.replace(/_/g,' ')}</span> },
    { key:'record_id',   label:'Record',   render:r=><span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500">{r.record_id ? String(r.record_id).slice(0,8) : '—'}</span> },
    { key:'user_name',   label:'Actor',    render:r=>(
      <div>
        <p className="text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">{r.user_name ?? '—'}</p>
        <p className="text-[11px] text-neutral-400">{r.user_email}</p>
      </div>
    )},
    { key:'branch_name', label:'Branch',   render:r=><span className="text-neutral-500 dark:text-neutral-400">{r.branch_name ?? '—'}</span> },
    { key:'ip_address',  label:'IP',       render:r=><span className="font-mono text-[11px] text-neutral-400">{r.ip_address ?? '—'}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/20">
            <Shield size={18} className="text-indigo-600 dark:text-indigo-400"/>
          </div>
          <div>
            <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Audit Log</h1>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400">{logs.length} entries (last 200)</p>
          </div>
        </div>
        <button onClick={load}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <DataTable columns={COLS} data={logs} title="Audit Logs" filename="audit_logs"
        rowKey={r=>r.id} searchPlaceholder="Search action, resource, actor…" loading={loading}/>
    </div>
  )
}
