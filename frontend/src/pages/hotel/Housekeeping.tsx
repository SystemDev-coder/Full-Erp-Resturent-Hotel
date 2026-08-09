import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, Clock, AlertCircle, RefreshCw,
  UserCheck, Loader2, BedDouble, SprayCan, Wrench, ClipboardList,
  Plus, Pencil, Trash2,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HKTask {
  id: string; task_type: string; status: string; scheduled_for: string
  room_id: string; room_number: string; room_type: string
  assigned_to_id?: string; assigned_to_name?: string; notes?: string
}
interface Room  { id: string; room_number: string; room_type: string; floor: number }
interface Staff { id: string; first_name: string; last_name: string; role: string }

interface HKTaskForm {
  room_id: string; task_type: string
  scheduled_date: string; scheduled_time: string
  notes: string; assigned_to: string
}

function nowISO() {
  const n = new Date(); const p = (x: number) => String(x).padStart(2,'0')
  return { date: `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}`, time: `${p(n.getHours())}:${p(n.getMinutes())}` }
}

const EMPTY_FORM = (): HKTaskForm => {
  const { date, time } = nowISO()
  return { room_id: '', task_type: 'checkout_clean', scheduled_date: date, scheduled_time: time, notes: '', assigned_to: '' }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; badge: string; icon: React.ReactNode; iconBox: string }> = {
  pending:     { label:'Pending',     badge:'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',   icon:<Clock size={12}/>,                            iconBox:'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400' },
  in_progress: { label:'In Progress', badge:'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',         icon:<Loader2 size={12} className="animate-spin"/>, iconBox:'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  completed:   { label:'Completed',   badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', icon:<CheckCircle2 size={12}/>,                      iconBox:'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  skipped:     { label:'Skipped',     badge:'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',             icon:<AlertCircle size={12}/>,                       iconBox:'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' },
}

const TASK_TYPES = [
  { value: 'checkout_clean',     label: 'Checkout Clean' },
  { value: 'stayover',           label: 'Stayover' },
  { value: 'deep_clean',         label: 'Deep Clean' },
  { value: 'inspection',         label: 'Inspection' },
  { value: 'turndown',           label: 'Turndown' },
  { value: 'maintenance_report', label: 'Maintenance Report' },
]

const TASK_ICON: Record<string, React.ReactNode> = {
  checkout_clean: <BedDouble size={14}/>, stayover: <BedDouble size={14}/>,
  deep_clean: <SprayCan size={14}/>, inspection: <ClipboardList size={14}/>,
  turndown: <BedDouble size={14}/>, maintenance_report: <Wrench size={14}/>,
}

const VALID_NEXT: Record<string, string[]> = {
  pending: ['in_progress','skipped'], in_progress: ['completed','pending'],
  skipped: ['pending'], completed: [],
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Housekeeping() {
  const [tasks,   setTasks]   = useState<HKTask[]>([])
  const [rooms,   setRooms]   = useState<Room[]>([])
  const [staff,   setStaff]   = useState<Staff[]>([])
  const [date,    setDate]    = useState(() => nowISO().date)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [mode,        setMode]        = useState<null | 'add' | 'edit' | 'assign' | 'status' | 'delete'>(null)
  const [selected,    setSelected]    = useState<HKTask | null>(null)
  const [form,        setForm]        = useState<HKTaskForm>(EMPTY_FORM)
  const [assignStaff, setAssignStaff] = useState('')
  const [newStatus,   setNewStatus]   = useState('')
  const [refLoaded,   setRefLoaded]   = useState(false)

  const f = (k: keyof HKTaskForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Task list re-fetches whenever the date filter changes. Rooms/staff are
  // static reference data used only by the Add/Edit/Assign forms — fetched
  // once, lazily, the first time a form needs them, instead of re-fetching
  // on every date change.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/hotel/housekeeping?date=${date}`)
      setTasks(data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { load() }, [load])

  const ensureRefData = useCallback(async (): Promise<Room[]> => {
    if (refLoaded) return rooms
    try {
      const [rRes, sRes] = await Promise.all([
        api.get('/hotel/rooms'),
        api.get('/hr/staff'),
      ])
      setRooms(rRes.data.data)
      setStaff(sRes.data.data)
      setRefLoaded(true)
      return rRes.data.data
    } catch (e) { setError(getApiErrorMessage(e)); return [] }
  }, [refLoaded, rooms])

  const openAdd = async () => {
    const roomList = await ensureRefData()
    const ef = EMPTY_FORM()
    setForm({ ...ef, room_id: roomList[0]?.id ?? '' })
    setSelected(null); setMode('add'); setError('')
  }

  const openEdit = (t: HKTask) => {
    ensureRefData()
    const sf = t.scheduled_for ? t.scheduled_for.slice(0, 16) : `${nowISO().date}T${nowISO().time}`
    setForm({
      room_id: t.room_id, task_type: t.task_type,
      scheduled_date: sf.slice(0, 10), scheduled_time: sf.slice(11, 16) || '09:00',
      notes: t.notes ?? '', assigned_to: t.assigned_to_id ?? '',
    })
    setSelected(t); setMode('edit'); setError('')
  }

  const openAssign = (t: HKTask) => { ensureRefData(); setSelected(t); setAssignStaff(t.assigned_to_id ?? ''); setMode('assign'); setError('') }
  const openStatus = (t: HKTask) => { setSelected(t); setNewStatus(t.status); setMode('status'); setError('') }
  const openDelete = (t: HKTask) => { setSelected(t); setMode('delete'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError('') }

  const save = async () => {
    if (!form.room_id || !form.task_type || !form.scheduled_date) {
      setError('Room, task type, and scheduled date are required'); return
    }
    setSaving(true); setError('')
    try {
      const scheduled_for = `${form.scheduled_date}T${form.scheduled_time || '09:00'}`
      const payload = {
        room_id: form.room_id, task_type: form.task_type, scheduled_for,
        notes: form.notes || undefined,
        assigned_to: form.assigned_to || undefined,
      }
      if (mode === 'add') await api.post('/hotel/housekeeping', payload)
      else if (selected)   await api.put(`/hotel/housekeeping/${selected.id}`, payload)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doAssign = async () => {
    if (!selected || !assignStaff) { setError('Please select a staff member'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/hotel/housekeeping/${selected.id}/assign`, { staff_id: assignStaff })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doStatus = async () => {
    if (!selected || newStatus === selected.status) { close(); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/hotel/housekeeping/${selected.id}/status`, { status: newStatus })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.delete(`/hotel/housekeeping/${selected.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
  }

  const counts = Object.keys(STATUS_CFG).reduce<Record<string,number>>((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s).length; return acc
  }, {})

  const COLS: DTColumn<HKTask>[] = [
    { key:'room_number', label:'Room', render:t=>(
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/15 text-[13px] font-extrabold text-sky-700 dark:text-sky-400">
          {t.room_number}
        </div>
        <div>
          <p className="font-bold text-neutral-800 dark:text-neutral-200">{t.room_number}</p>
          <p className="text-[11px] text-neutral-400">{t.room_type}</p>
        </div>
      </div>
    )},
    { key:'task_type', label:'Task', render:t=>(
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
          {TASK_ICON[t.task_type] ?? <ClipboardList size={14}/>}
        </div>
        <span className="font-semibold capitalize text-neutral-700 dark:text-neutral-300">
          {t.task_type.replace(/_/g,' ')}
        </span>
      </div>
    )},
    { key:'scheduled_for', label:'Schedule', render:t=>(
      <div>
        <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t.scheduled_for ? new Date(t.scheduled_for).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}
        </p>
        <p className="text-[11px] text-neutral-400">
          {t.scheduled_for ? new Date(t.scheduled_for).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : ''}
        </p>
      </div>
    )},
    { key:'assigned_to_name', label:'Assigned To', render:t=>(
      <div className="flex items-center gap-1.5 text-[12px]">
        <UserCheck size={12} className="text-neutral-400"/>
        <span className={t.assigned_to_name ? 'font-semibold text-neutral-700 dark:text-neutral-300' : 'text-neutral-400'}>
          {t.assigned_to_name ?? 'Unassigned'}
        </span>
      </div>
    )},
    { key:'status', label:'Status', render:t=>{
      const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.pending
      return <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.badge}`}>{cfg.icon} {cfg.label}</span>
    }},
    { key:'_act', label:'', sortable:false, render:t=>(
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={()=>openAssign(t)}
          className="rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 transition-colors">
          Assign
        </button>
        {(VALID_NEXT[t.status]?.length ?? 0) > 0 && (
          <button onClick={()=>openStatus(t)}
            className="rounded-xl bg-neutral-100 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-neutral-700 dark:text-neutral-300 transition-colors">
            Status
          </button>
        )}
        <button onClick={()=>openEdit(t)}
          className="rounded-xl bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={()=>openDelete(t)}
          className="rounded-xl bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Housekeeping</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {tasks.length} tasks · {counts.completed ?? 0} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Custom date filter */}
          <div className="w-44">
            <DatePicker value={date} onChange={setDate}/>
          </div>
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Plus size={15}/> Add Task
          </button>
        </div>
      </div>

      {error && !mode && (
        <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(STATUS_CFG).map(([s, cfg]) => (
          <div key={s} className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm ${cfg.iconBox}`}>{cfg.icon}</span>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{cfg.label}</p>
              <p className="text-[22px] font-extrabold leading-none text-neutral-900 dark:text-white">{counts[s] ?? 0}</p>
            </div>
          </div>
        ))}
      </div>

      <DataTable columns={COLS} data={tasks} title="Housekeeping Tasks" filename="housekeeping"
        rowKey={t => t.id} searchPlaceholder="Search room, task, staff…" loading={loading}/>

      {/* ── Add / Edit Task Modal ──────────────────────────────────────── */}
      <Modal open={mode === 'add' || mode === 'edit'} onClose={close}
        title={mode === 'add' ? 'Add Housekeeping Task' : `Edit Task — Room ${selected?.room_number}`} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={saving || !form.room_id || !form.task_type || !form.scheduled_date}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'add' ? 'Add Task' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <Field label="Room">
            <Select
              value={form.room_id} onChange={v => f('room_id', v)}
              placeholder="— Select room —"
              options={rooms.map(r => ({ value: r.id, label: `Room ${r.room_number} — ${r.room_type} (Floor ${r.floor})` }))}
            />
          </Field>

          <Field label="Task Type">
            <Select value={form.task_type} onChange={v => f('task_type', v)} options={TASK_TYPES}/>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Scheduled Date">
              <DatePicker value={form.scheduled_date} onChange={v => f('scheduled_date', v)} placeholder="Select date"/>
            </Field>
            <Field label="Scheduled Time">
              <input type="time" value={form.scheduled_time} onChange={e => f('scheduled_time', e.target.value)}
                className={INPUT}/>
            </Field>
          </div>

          <Field label="Assigned To (optional)">
            <Select
              value={form.assigned_to} onChange={v => f('assigned_to', v)}
              placeholder="— Unassigned —"
              options={staff.map(s => ({ value: s.id, label: `${s.first_name} ${s.last_name} (${s.role})` }))}
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)}
              placeholder="Any special instructions…" rows={2} className={`${INPUT} resize-none`}/>
          </Field>
        </div>
      </Modal>

      {/* ── Assign Modal ──────────────────────────────────────────────── */}
      <Modal open={mode === 'assign'} onClose={close}
        title={`Assign — Room ${selected?.room_number}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doAssign} disabled={!assignStaff || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Assign
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
            <p className="text-[13px] font-bold text-sky-800 dark:text-sky-300">
              Room {selected?.room_number} — {selected?.task_type?.replace(/_/g,' ')}
            </p>
            <p className="text-[12px] text-sky-600 dark:text-sky-400 mt-0.5">Currently: {selected?.assigned_to_name ?? 'Unassigned'}</p>
          </div>
          <Field label="Assign to Staff">
            <Select value={assignStaff} onChange={setAssignStaff} placeholder="— Select staff member —"
              options={staff.map(s => ({ value: s.id, label: `${s.first_name} ${s.last_name} (${s.role})` }))}/>
          </Field>
        </div>
      </Modal>

      {/* ── Status Modal ──────────────────────────────────────────────── */}
      <Modal open={mode === 'status'} onClose={close}
        title={`Status — Room ${selected?.room_number}`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doStatus} disabled={newStatus === selected?.status || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Update
          </button>
        </>}>
        <div className="space-y-3">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          {(VALID_NEXT[selected?.status ?? ''] ?? []).map(s => {
            const cfg = STATUS_CFG[s]
            return (
              <button key={s} type="button" onClick={() => setNewStatus(s)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                  newStatus === s ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-neutral-200 hover:border-neutral-300 dark:border-white/[0.08]'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${cfg.badge}`}>{cfg.icon}</span>
                <span className={`text-[13px] font-semibold ${newStatus === s ? 'text-indigo-700 dark:text-indigo-300' : 'text-neutral-600 dark:text-neutral-300'}`}>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      </Modal>

      {/* ── Delete Confirmation ───────────────────────────────────────── */}
      <Modal open={mode === 'delete'} onClose={close} title="Delete Task" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDelete} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null} Delete Task
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete task for Room {selected?.room_number}?</p>
          <p className="mt-1 text-[13px] text-neutral-500 capitalize">{selected?.task_type?.replace(/_/g,' ')}</p>
          <p className="mt-2 text-[12px] text-rose-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  )
}
