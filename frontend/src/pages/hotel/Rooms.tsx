import { useState, useEffect, useCallback } from 'react'
import {
  BedDouble, Wrench, SprayCan, CheckCircle2, XCircle,
  RefreshCw, Users, Cigarette, BedSingle, Plus, Pencil, Trash2,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id: string; room_number: string; floor: number; status: string
  is_smoking: boolean; room_type: string; room_type_id: string
  max_adults: number; max_children: number; bed_configuration: string
}

interface RoomType { id: string; name: string; max_adults: number; max_children: number; bed_configuration: string }

interface RoomForm {
  room_number: string; floor: string; room_type_id: string
  bed_configuration: string; max_adults: string; max_children: string
  is_smoking: boolean; status: string
}

const EMPTY_FORM: RoomForm = {
  room_number: '', floor: '1', room_type_id: '',
  bed_configuration: '', max_adults: '', max_children: '',
  is_smoking: false, status: 'available',
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string; dot: string; cardBg: string; cardBorder: string; cardText: string
  badge: string; icon: React.ReactNode
}> = {
  available:    { label:'Available',    dot:'bg-emerald-500', cardBg:'bg-emerald-50 dark:bg-emerald-500/10',  cardBorder:'border-emerald-200 dark:border-emerald-500/25',  cardText:'text-emerald-700 dark:text-emerald-300', badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',  icon:<CheckCircle2 size={13}/> },
  occupied:     { label:'Occupied',     dot:'bg-indigo-500',  cardBg:'bg-indigo-50 dark:bg-indigo-500/10',    cardBorder:'border-indigo-200 dark:border-indigo-500/25',    cardText:'text-indigo-700 dark:text-indigo-300',   badge:'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',    icon:<BedDouble size={13}/> },
  cleaning:     { label:'Cleaning',     dot:'bg-amber-500',   cardBg:'bg-amber-50 dark:bg-amber-500/10',      cardBorder:'border-amber-200 dark:border-amber-500/25',      cardText:'text-amber-700 dark:text-amber-300',     badge:'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',        icon:<SprayCan size={13}/> },
  maintenance:  { label:'Maintenance',  dot:'bg-rose-500',    cardBg:'bg-rose-50 dark:bg-rose-500/10',        cardBorder:'border-rose-200 dark:border-rose-500/25',        cardText:'text-rose-700 dark:text-rose-300',       badge:'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',            icon:<Wrench size={13}/> },
  out_of_order: { label:'Out of Order', dot:'bg-neutral-400', cardBg:'bg-neutral-100 dark:bg-neutral-700/30', cardBorder:'border-neutral-200 dark:border-neutral-600',     cardText:'text-neutral-500 dark:text-neutral-400', badge:'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',  icon:<XCircle size={13}/> },
}

const ALL_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_order']

const BED_ICON: Record<string, React.ReactNode> = {
  single: <BedSingle size={14}/>,
  double: <BedDouble size={14}/>,
  twin:   <BedDouble size={14}/>,
  queen:  <BedDouble size={14}/>,
  king:   <BedDouble size={14}/>,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Rooms() {
  const [rooms,      setRooms]     = useState<Room[]>([])
  const [roomTypes,  setRoomTypes] = useState<RoomType[]>([])
  const [loading,    setLoading]   = useState(true)
  const [saving,     setSaving]    = useState(false)
  const [error,      setError]     = useState('')
  const [filter,     setFilter]    = useState('all')

  const [mode,      setMode]     = useState<null | 'add' | 'edit' | 'status' | 'delete'>(null)
  const [selected,  setSelected] = useState<Room | null>(null)
  const [form,      setForm]     = useState<RoomForm>(EMPTY_FORM)
  const [newStatus, setNewStatus] = useState('')
  const [rtLoaded,  setRtLoaded]  = useState(false)

  const f = (k: keyof RoomForm, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // Room types are only needed inside the Add/Edit form's type picker — fetched
  // lazily the first time one of those modals opens instead of on every visit.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/hotel/rooms')
      setRooms(data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const ensureRoomTypes = useCallback(async (): Promise<RoomType[]> => {
    if (rtLoaded) return roomTypes
    try {
      const { data } = await api.get('/hotel/room-types')
      setRoomTypes(data.data)
      setRtLoaded(true)
      return data.data
    } catch (e) { setError(getApiErrorMessage(e)); return [] }
  }, [rtLoaded, roomTypes])

  const openAdd = async () => {
    const types = await ensureRoomTypes()
    const rt = types[0]
    setForm({
      ...EMPTY_FORM,
      room_type_id:      rt?.id ?? '',
      bed_configuration: rt?.bed_configuration ?? '',
      max_adults:        rt ? String(rt.max_adults)  : '',
      max_children:      rt ? String(rt.max_children): '',
    })
    setSelected(null); setMode('add'); setError('')
  }
  const openEdit = (r: Room) => {
    ensureRoomTypes()
    setForm({
      room_number:       r.room_number,
      floor:             String(r.floor),
      room_type_id:      r.room_type_id,
      bed_configuration: r.bed_configuration,
      max_adults:        String(r.max_adults),
      max_children:      String(r.max_children),
      is_smoking:        r.is_smoking,
      status:            r.status,
    })
    setSelected(r); setMode('edit'); setError('')
  }

  const handleRoomTypeChange = (id: string) => {
    const rt = roomTypes.find(r => r.id === id)
    setForm(p => ({
      ...p,
      room_type_id:      id,
      bed_configuration: rt?.bed_configuration ?? p.bed_configuration,
      max_adults:        rt ? String(rt.max_adults)   : p.max_adults,
      max_children:      rt ? String(rt.max_children) : p.max_children,
    }))
  }
  const openStatus = (r: Room) => { setSelected(r); setNewStatus(r.status); setMode('status'); setError('') }
  const openDelete = (r: Room) => { setSelected(r); setMode('delete'); setError('') }
  const close = () => { setMode(null); setSelected(null); setError('') }

  const save = async () => {
    if (!form.room_number.trim() || !form.room_type_id) {
      setError('Room number and room type are required'); return
    }
    setSaving(true); setError('')
    try {
      const payload = {
        room_number:  form.room_number.trim(),
        floor:        parseInt(form.floor) || 1,
        room_type_id: form.room_type_id,
        is_smoking:   form.is_smoking,
        status:       form.status,
      }
      if (mode === 'add') {
        await api.post('/hotel/rooms', payload)
      } else if (selected) {
        await api.put(`/hotel/rooms/${selected.id}`, payload)
      }
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const updateStatus = async () => {
    if (!selected || newStatus === selected.status) { close(); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/hotel/rooms/${selected.id}/status`, { status: newStatus })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await api.delete(`/hotel/rooms/${selected.id}`)
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
  }

  const counts = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rooms.filter(r => r.status === s).length; return acc
  }, {})

  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.status === filter)

  const COLS: DTColumn<Room>[] = [
    { key: 'room_number', label: 'Room', render: r => {
      const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.available
      return (
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[14px] font-extrabold ${cfg.cardBg} ${cfg.cardText}`}>
            {r.room_number}
          </div>
          <div>
            <p className="font-bold text-neutral-800 dark:text-neutral-200">{r.room_number}</p>
            <p className="text-[11px] text-neutral-400">Floor {r.floor}</p>
          </div>
        </div>
      )
    }},
    { key: 'room_type', label: 'Type', render: r => (
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400">
          {BED_ICON[r.bed_configuration?.toLowerCase().split(' ')[0]] ?? <BedDouble size={14}/>}
        </div>
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">{r.room_type}</span>
      </div>
    )},
    { key: 'bed_configuration', label: 'Bed', render: r => (
      <span className="text-[12px] text-neutral-500 dark:text-neutral-400">{r.bed_configuration}</span>
    )},
    { key: 'max_adults', label: 'Capacity', render: r => (
      <div className="flex items-center gap-1.5 text-[12px] text-neutral-600 dark:text-neutral-400">
        <Users size={12}/>
        <span>{r.max_adults + r.max_children} guests</span>
        {r.is_smoking && (
          <span className="ml-1 flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            <Cigarette size={9}/> Smoking
          </span>
        )}
      </div>
    )},
    { key: 'status', label: 'Status', render: r => {
      const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.available
      return (
        <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cfg.badge}`}>
          {cfg.icon} {cfg.label}
        </span>
      )
    }},
    { key: '_act', label: '', sortable: false, render: r => (
      <div className="flex gap-1.5 whitespace-nowrap">
        <button onClick={() => openStatus(r)}
          className="rounded-xl border border-neutral-200/60 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300 transition-all">
          Status
        </button>
        <button onClick={() => openEdit(r)}
          className="rounded-xl bg-sky-50 px-2.5 py-1.5 text-[12px] font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 transition-colors">
          <Pencil size={12}/>
        </button>
        <button onClick={() => openDelete(r)}
          className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
          <Trash2 size={12}/>
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Rooms</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{rooms.length} total rooms</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Plus size={15}/> Add Room
          </button>
        </div>
      </div>

      {error && !mode && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {/* Status summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {ALL_STATUSES.map(s => {
          const cfg = STATUS_CONFIG[s]
          const isActive = filter === s
          return (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`rounded-2xl border p-4 text-left transition-all ${cfg.cardBorder} ${cfg.cardBg} ${isActive ? 'ring-2 ring-indigo-400 ring-offset-1' : 'hover:opacity-90'}`}>
              <div className={`flex items-center gap-1.5 ${cfg.cardText}`}>
                {cfg.icon}
                <span className="text-[11px] font-bold uppercase tracking-wide">{cfg.label}</span>
              </div>
              <p className={`mt-2 text-[28px] font-extrabold leading-none ${cfg.cardText}`}>{counts[s] ?? 0}</p>
            </button>
          )
        })}
      </div>

      {/* Active filter chip */}
      {filter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-neutral-500 dark:text-neutral-400">Showing:</span>
          <button onClick={() => setFilter('all')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS_CONFIG[filter]?.cardBg} ${STATUS_CONFIG[filter]?.cardText}`}>
            {STATUS_CONFIG[filter]?.icon}
            {STATUS_CONFIG[filter]?.label}
            <span className="ml-1 opacity-60">×</span>
          </button>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={COLS} data={filtered} title="Rooms" filename="rooms"
        rowKey={r => r.id} searchPlaceholder="Search room number, type…" loading={loading}/>

      {/* Add / Edit Room Modal */}
      <Modal open={mode === 'add' || mode === 'edit'} onClose={close}
        title={mode === 'add' ? 'Add Room' : `Edit Room ${selected?.room_number}`} size="md"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={saving || !form.room_number.trim() || !form.room_type_id}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            {mode === 'add' ? 'Add Room' : 'Save Changes'}
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Room Number">
              <input value={form.room_number} onChange={e => f('room_number', e.target.value)}
                placeholder="e.g. 101" className={INPUT} autoFocus/>
            </Field>
            <Field label="Floor">
              <input type="number" value={form.floor} onChange={e => f('floor', e.target.value)}
                min="1" placeholder="1" className={INPUT}/>
            </Field>
          </div>

          <Field label="Type">
            <Select
              value={form.room_type_id}
              onChange={handleRoomTypeChange}
              placeholder="— Select room type —"
              options={roomTypes.map(rt => ({ value: rt.id, label: rt.name }))}
            />
          </Field>

          <Field label="Bed">
            <input value={form.bed_configuration}
              onChange={e => f('bed_configuration', e.target.value)}
              placeholder="e.g. King Bed, Twin Beds…" className={INPUT}/>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Adults">
              <input type="number" value={form.max_adults}
                onChange={e => f('max_adults', e.target.value)}
                min="1" placeholder="2" className={INPUT}/>
            </Field>
            <Field label="Max Children">
              <input type="number" value={form.max_children}
                onChange={e => f('max_children', e.target.value)}
                min="0" placeholder="0" className={INPUT}/>
            </Field>
          </div>

          <Field label="Status">
            <Select
              value={form.status}
              onChange={v => f('status', v)}
              options={ALL_STATUSES.map(s => ({ value: s, label: STATUS_CONFIG[s]?.label ?? s }))}
            />
          </Field>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={form.is_smoking}
                onChange={e => f('is_smoking', e.target.checked)} className="sr-only"/>
              <div className={`flex h-6 w-11 items-center rounded-full transition-colors ${form.is_smoking ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}>
                <span className={`ml-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_smoking ? 'translate-x-5' : ''}`}/>
              </div>
            </div>
            <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Smoking Room</span>
            {form.is_smoking && <Cigarette size={14} className="text-amber-500"/>}
          </label>
        </div>
      </Modal>

      {/* Status Update Modal */}
      <Modal open={mode === 'status'} onClose={close}
        title={`Room ${selected?.room_number} — Update Status`} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={updateStatus} disabled={saving || newStatus === selected?.status}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Update Status
          </button>
        </>}>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-[16px] font-extrabold ${STATUS_CONFIG[selected?.status ?? 'available']?.cardBg} ${STATUS_CONFIG[selected?.status ?? 'available']?.cardText}`}>
                {selected?.room_number}
              </div>
              <div>
                <p className="text-[13px] font-bold text-neutral-800 dark:text-white">{selected?.room_type}</p>
                <p className="text-[12px] text-neutral-500">{selected?.bed_configuration} · Floor {selected?.floor}</p>
              </div>
            </div>
          </div>

          <Field label="New Status">
            <div className="grid grid-cols-1 gap-2">
              {ALL_STATUSES.map(s => {
                const cfg = STATUS_CONFIG[s]
                return (
                  <button key={s} type="button" onClick={() => setNewStatus(s)}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition-all ${
                      newStatus === s ? `border-indigo-500 ${cfg.cardBg}` : 'border-neutral-200 hover:border-neutral-300 dark:border-white/[0.08]'
                    }`}>
                    <span className={cfg.cardText}>{cfg.icon}</span>
                    <span className={`text-[13px] font-semibold ${newStatus === s ? cfg.cardText : 'text-neutral-600 dark:text-neutral-300'}`}>
                      {cfg.label}
                    </span>
                    {s === selected?.status && (
                      <span className="ml-auto text-[10px] font-bold text-neutral-400">current</span>
                    )}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={mode === 'delete'} onClose={close} title="Delete Room" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDelete} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Delete Room
          </button>
        </>}>
        <div className="py-2 text-center">
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 mb-3 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete Room {selected?.room_number}?</p>
          <p className="mt-1 text-[13px] text-neutral-500">{selected?.room_type} · Floor {selected?.floor}</p>
          <p className="mt-2 text-[12px] text-rose-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  )
}
