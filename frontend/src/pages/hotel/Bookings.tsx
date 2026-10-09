import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, RefreshCw, Building2, Pencil, Trash2, ArrowRightLeft, Repeat, FileText, Banknote } from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { DatePicker } from '@/components/ui/DatePicker'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useLoadMore } from '@hooks/useLoadMore'
import { BookingPaymentModal } from '@/components/hotel/BookingPaymentModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string; booking_ref: string
  guest_name?: string; guest_phone?: string
  room_id?: string; room_number?: string; room_type_name?: string
  check_in_date: string; check_out_date: string
  num_nights: number; num_adults: number; num_children: number
  rate_per_night: string; total_amount: string
  status: string; source?: string; special_requests?: string; created_at: string
}
interface Guest    { id: string; first_name: string; last_name: string; email?: string }
interface Room     { id: string; room_number: string; room_type_name: string }
interface RatePlan { id: string; name: string; price_per_night: string; room_type_name: string }
// Full room roster (with live status) — used by Room Transfer to offer only
// rooms that are actually free right now, unlike the date-range `Room` type
// above which the New Booking form uses.
interface AllRoom { id: string; room_number: string; room_type: string; status: string }

interface BookingForm {
  primary_guest_id: string; room_id: string; rate_plan_id: string
  check_in_date: string; check_out_date: string
  rate_per_night: string; special_requests: string
}

interface BookingEditForm {
  check_in_date: string; check_out_date: string
  rate_per_night: string; num_adults: string
  num_children: string; special_requests: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  pending:     'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  confirmed:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  checked_in:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  checked_out: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  cancelled:   'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  no_show:     'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
}

const EMPTY_FORM: BookingForm = {
  primary_guest_id: '', room_id: '', rate_plan_id: '',
  check_in_date: '', check_out_date: '',
  rate_per_night: '', special_requests: '',
}

const EMPTY_EDIT: BookingEditForm = {
  check_in_date: '', check_out_date: '',
  rate_per_night: '', num_adults: '1',
  num_children: '0', special_requests: '',
}

function nights(a: string, b: string) {
  if (!a || !b) return 0
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Bookings() {
  const { items: bookings, loading, loadingMore, hasMore, loadMore, reload: load, error: loadError } =
    useLoadMore<Booking>('/hotel/bookings', { pageSize: 50 })
  const [guests,   setGuests]   = useState<Guest[]>([])
  const [rooms,    setRooms]    = useState<Room[]>([])
  const [plans,    setPlans]    = useState<RatePlan[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const [mode,         setMode]         = useState<null | 'add' | 'edit' | 'cancel' | 'delete' | 'transfer' | 'exchange'>(null)
  const [selected,     setSelected]     = useState<Booking | null>(null)
  const [form,         setForm]         = useState<BookingForm>(EMPTY_FORM)
  const [editForm,     setEditForm]     = useState<BookingEditForm>(EMPTY_EDIT)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter,   setDateFilter]   = useState('')
  const [refLoaded,    setRefLoaded]    = useState(false)
  const [allRooms,       setAllRooms]       = useState<AllRoom[]>([])
  const [transferRoomId, setTransferRoomId] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)
  const [payFor, setPayFor] = useState<Booking | null>(null)
  const [exchangeAId, setExchangeAId] = useState('')
  const [exchangeBId, setExchangeBId] = useState('')

  const f  = (k: keyof BookingForm,     v: string) => setForm(p     => ({ ...p, [k]: v }))
  const ef = (k: keyof BookingEditForm, v: string) => setEditForm(p => ({ ...p, [k]: v }))

  // Scroll error into view whenever it changes
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error])

  // Only the booking list loads on page mount (via useLoadMore, 50 at a time)
  // — guest/rate-plan reference data is only needed inside the New Booking
  // form, so it's fetched lazily the first time that modal opens.
  const ensureRefData = useCallback(async () => {
    if (refLoaded) return
    try {
      const [gRes, pRes] = await Promise.all([
        api.get('/hotel/guests'),
        api.get('/hotel/rate-plans'),
      ])
      setGuests(gRes.data.data)
      setPlans(pRes.data.data)
      setRefLoaded(true)
    } catch (e) { setError(getApiErrorMessage(e)) }
  }, [refLoaded])

  useEffect(() => {
    if (form.check_in_date && form.check_out_date) {
      api.get(`/hotel/rooms/available?check_in=${form.check_in_date}&check_out=${form.check_out_date}`)
        .then(r => setRooms(r.data.data))
        .catch(() => setRooms([]))
    }
  }, [form.check_in_date, form.check_out_date])

  const close   = () => {
    setMode(null); setSelected(null); setError(''); setTransferRoomId('')
    setExchangeAId(''); setExchangeBId('')
  }
  const openAdd = () => { setForm(EMPTY_FORM); setRooms([]); setMode('add'); setError(''); ensureRefData() }

  const setCheckIn  = (v: string) => setForm(p => ({ ...p, check_in_date: v,  room_id: '' }))
  const setCheckOut = (v: string) => setForm(p => ({ ...p, check_out_date: v, room_id: '' }))

  const handlePlanChange = (id: string) => {
    const plan = plans.find(p => p.id === id)
    setForm(p => ({ ...p, rate_plan_id: id, rate_per_night: plan ? plan.price_per_night : p.rate_per_night }))
  }

  const openEdit = (b: Booking) => {
    setEditForm({
      check_in_date:    b.check_in_date?.toString().slice(0, 10)  ?? '',
      check_out_date:   b.check_out_date?.toString().slice(0, 10) ?? '',
      rate_per_night:   b.rate_per_night ?? '',
      num_adults:       String(b.num_adults  ?? 1),
      num_children:     String(b.num_children ?? 0),
      special_requests: b.special_requests ?? '',
    })
    setSelected(b); setMode('edit'); setError('')
  }

  const openDelete = (b: Booking) => { setSelected(b); setMode('delete'); setError('') }
  const openCancel = (b: Booking) => { setSelected(b); setMode('cancel'); setError('') }

  // ── Room Transfer ──────────────────────────────────────────────────────────
  // Openable two ways: from a specific row's icon (booking pre-picked), or
  // from the header "Room Transfer" button (b omitted — pick the guest first
  // via the Booking field below). Either way the room roster is fetched
  // fresh every time (not lazily cached like guests/plans) since occupancy
  // status changes constantly and staleness here would let staff pick a
  // room that just got occupied.
  const transferable = bookings.filter(b => ['confirmed', 'checked_in'].includes(b.status))

  const openTransfer = (b?: Booking) => {
    setSelected(b ?? null); setTransferRoomId(''); setMode('transfer'); setError('')
    setTransferLoading(true)
    api.get('/hotel/rooms')
      .then(r => setAllRooms(r.data.data))
      .catch(e => setError(getApiErrorMessage(e)))
      .finally(() => setTransferLoading(false))
  }

  const pickTransferBooking = (id: string) => {
    setSelected(transferable.find(b => b.id === id) ?? null)
    setTransferRoomId('')
  }

  const availableForTransfer = allRooms.filter(r => r.status === 'available' && r.id !== selected?.room_id)

  const doTransfer = async () => {
    if (!selected || !transferRoomId) return
    setSaving(true); setError('')
    try {
      await api.patch(`/hotel/bookings/${selected.id}/transfer`, { room_id: transferRoomId })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Room Exchange ──────────────────────────────────────────────────────────
  // Straight swap between two active bookings — neither guest ever vacates
  // a room, so unlike Transfer there's no room-availability check needed.
  const openExchange = () => {
    setExchangeAId(''); setExchangeBId(''); setMode('exchange'); setError('')
  }
  const bookingA = transferable.find(b => b.id === exchangeAId)
  const bookingB = transferable.find(b => b.id === exchangeBId)

  const doExchange = async () => {
    if (!exchangeAId || !exchangeBId) return
    setSaving(true); setError('')
    try {
      await api.patch(`/hotel/bookings/${exchangeAId}/exchange`, { with_booking_id: exchangeBId })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Add ────────────────────────────────────────────────────────────────────
  const numNights      = nights(form.check_in_date, form.check_out_date)
  const estimatedTotal = form.rate_per_night && numNights > 0
    ? (Number(form.rate_per_night) * numNights).toFixed(2) : null
  const isAddValid = form.primary_guest_id && form.room_id &&
                     form.check_in_date && form.check_out_date && form.rate_per_night

  const save = async () => {
    if (!isAddValid) { setError('Guest, room, dates and rate per night are required.'); return }
    setSaving(true); setError('')
    try {
      await api.post('/hotel/bookings', {
        primary_guest_id: form.primary_guest_id,
        room_id:          form.room_id,
        rate_plan_id:     form.rate_plan_id  || undefined,
        check_in_date:    form.check_in_date,
        check_out_date:   form.check_out_date,
        rate_per_night:   Number(form.rate_per_night),
        special_requests: form.special_requests || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  const editNights    = nights(editForm.check_in_date, editForm.check_out_date)
  const editEstimated = editForm.rate_per_night && editNights > 0
    ? (Number(editForm.rate_per_night) * editNights).toFixed(2) : null
  const isEditValid = editForm.check_in_date && editForm.check_out_date && editForm.rate_per_night

  const doUpdate = async () => {
    if (!isEditValid) { setError('Check-in date, check-out date, and rate per night are required.'); return }
    setSaving(true); setError('')
    try {
      await api.put(`/hotel/bookings/${selected!.id}`, {
        check_in_date:    editForm.check_in_date,
        check_out_date:   editForm.check_out_date,
        rate_per_night:   Number(editForm.rate_per_night),
        num_adults:       Number(editForm.num_adults)   || 1,
        num_children:     Number(editForm.num_children) || 0,
        special_requests: editForm.special_requests || undefined,
      })
      close(); load()
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const doDelete = async () => {
    if (!selected) return
    setSaving(true)
    try { await api.delete(`/hotel/bookings/${selected.id}`); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)); setSaving(false) }
  }

  // ── Status actions ─────────────────────────────────────────────────────────
  // An online request waits as "pending" until the front desk accepts it (the guest is messaged)
  const doConfirm = async (b: Booking) => {
    try { await api.patch(`/hotel/bookings/${b.id}/confirm`); load() }
    catch (e) { alert(getApiErrorMessage(e)) }
  }
  const doCheckIn  = async (b: Booking) => {
    try { await api.patch(`/hotel/bookings/${b.id}/checkin`);  load() }
    catch (e) { alert(getApiErrorMessage(e)) }
  }
  const doCheckOut = async (b: Booking, earlyOk = false) => {
    try {
      const r = await api.patch(`/hotel/bookings/${b.id}/checkout`, earlyOk ? { early_ok: true } : {})
      load()
      if (r.data?.data?.balance_due > 0) alert(r.data.message)   // tell the cashier what the guest still owes
    } catch (e: any) {
      // The guest leaves before the booked departure: the server asks first because it changes the bill
      if (e?.response?.status === 409 && e.response.data?.data?.code === 'early_checkout') {
        if (window.confirm(`${e.response.data.message}\n\nCheck out now?`)) return doCheckOut(b, true)
        return
      }
      alert(getApiErrorMessage(e))
    }
  }
  const doCancel = async () => {
    if (!selected) return
    setSaving(true)
    try { await api.patch(`/hotel/bookings/${selected.id}/cancel`); close(); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
    finally { setSaving(false) }
  }

  // ─── Shared error banner (uses single ref for scroll) ─────────────────────
  const ErrorBanner = () => error ? (
    <div ref={errorRef} tabIndex={-1}
      className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 outline-none">
      {error}
    </div>
  ) : null

  // ─── Table columns ──────────────────────────────────────────────────────────

  const COLS: DTColumn<Booking>[] = [
    { key: 'booking_ref', label: 'Ref #', render: r =>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{r.booking_ref}
          {r.source === 'online' && <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 align-middle font-sans text-[9.5px] font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">ONLINE</span>}</span> },
    { key: 'guest_name', label: 'Guest', render: r =>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{r.guest_name ?? '—'}</span> },
    { key: 'room_number', label: 'Room', render: r =>
        <span className="whitespace-nowrap">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">{r.room_number}</span>
          <span className="ml-1 text-[11px] text-neutral-400">{r.room_type_name}</span>
        </span> },
    { key: 'check_in_date',  label: 'Check-in',  render: r =>
        <span className="whitespace-nowrap text-neutral-500">{r.check_in_date?.slice(0,10)}</span> },
    { key: 'check_out_date', label: 'Check-out', render: r =>
        <span className="whitespace-nowrap text-neutral-500">{r.check_out_date?.slice(0,10)}</span> },
    { key: 'num_nights', label: 'Nts', render: r =>
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">{r.num_nights}</span> },
    { key: 'total_amount', label: 'Total', render: r =>
        <span className="font-bold text-neutral-800 dark:text-white">${Number(r.total_amount).toFixed(2)}</span> },
    { key: 'status', label: 'Status', render: r =>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_BADGE[r.status] ?? ''}`}>
          {r.status.replace('_',' ')}
        </span> },
    { key: '_act', label: '', sortable: false, render: r => (
      <div className="flex gap-1.5 whitespace-nowrap">
        {!['cancelled', 'no_show'].includes(r.status) && (
          <button onClick={() => setPayFor(r)} title="Record a payment from this guest"
            className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 transition-colors">
            <Banknote size={11}/>
          </button>
        )}
        <a href={`/hotel/bookings/${r.id}/statement`} target="_blank" rel="noreferrer"
          title="Guest statement (room + restaurant) — print / save as PDF"
          className="rounded-lg bg-amber-50 px-2 py-1 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 transition-colors">
          <FileText size={11}/>
        </a>
        {r.status === 'pending' && (
          <button onClick={() => doConfirm(r)} title="Accept this booking request"
            className="rounded-lg bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 transition-colors">
            Confirm
          </button>
        )}
        {r.status === 'confirmed' && (
          <button onClick={() => doCheckIn(r)}
            className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 transition-colors">
            Check In
          </button>
        )}
        {r.status === 'checked_in' && (
          <button onClick={() => doCheckOut(r)}
            className="rounded-lg bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-200 dark:bg-sky-500/20 dark:text-sky-300 transition-colors">
            Check Out
          </button>
        )}
        {['confirmed','checked_in'].includes(r.status) && (
          <button onClick={() => openTransfer(r)} title="Transfer to another room"
            className="rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-200 dark:bg-violet-500/20 dark:text-violet-300 transition-colors">
            <ArrowRightLeft size={11}/>
          </button>
        )}
        <button onClick={() => openEdit(r)}
          className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 transition-colors">
          <Pencil size={11}/>
        </button>
        {['pending','confirmed'].includes(r.status) && (
          <button onClick={() => openCancel(r)}
            className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 transition-colors">
            Cancel
          </button>
        )}
        {['cancelled','checked_out','no_show'].includes(r.status) && (
          <button onClick={() => openDelete(r)}
            className="rounded-lg bg-rose-50 px-2 py-1 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 transition-colors">
            <Trash2 size={11}/>
          </button>
        )}
      </div>
    )},
  ]

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = bookings
    .filter(b => !statusFilter || b.status === statusFilter)
    .filter(b => !dateFilter   || b.check_in_date?.slice(0,10) === dateFilter)

  const CARDS = [
    { key: 'confirmed',  label: 'Confirmed',  color: 'text-indigo-700 dark:text-indigo-300',  ring: 'ring-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-500/10',  activeBg: 'bg-indigo-100 dark:bg-indigo-500/20'  },
    { key: 'checked_in', label: 'Checked In', color: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', activeBg: 'bg-emerald-100 dark:bg-emerald-500/20' },
    { key: 'pending',    label: 'Pending',    color: 'text-amber-700 dark:text-amber-300',    ring: 'ring-amber-500',   bg: 'bg-amber-50 dark:bg-amber-500/10',     activeBg: 'bg-amber-100 dark:bg-amber-500/20'    },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Bookings</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {filtered.length}{filtered.length !== bookings.length ? ` of ${bookings.length}` : ''} bookings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date filter — same pattern as Housekeeping */}
          <div className="flex items-center gap-1">
            <div className="w-44">
              <DatePicker value={dateFilter} onChange={setDateFilter} placeholder="Filter by date"/>
            </div>
            {dateFilter && (
              <button onClick={() => setDateFilter('')}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-400 hover:border-rose-300 hover:text-rose-500 dark:border-white/[0.08] dark:bg-white/[0.04] transition-colors text-[14px] font-bold">
                ×
              </button>
            )}
          </div>
          <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={() => openTransfer()}
            className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-[13px] font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 transition-colors">
            <ArrowRightLeft size={15}/> Room Transfer
          </button>
          <button onClick={openExchange}
            className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-[13px] font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20 transition-colors">
            <Repeat size={15}/> Room Exchange
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors">
            <Plus size={15}/> New Booking
          </button>
        </div>
      </div>

      {/* Clickable status cards */}
      <div className="grid grid-cols-3 gap-3">
        {CARDS.map(c => {
          const count   = bookings.filter(b => b.status === c.key).length
          const active  = statusFilter === c.key
          return (
            <button key={c.key} type="button"
              onClick={() => setStatusFilter(p => p === c.key ? '' : c.key)}
              className={`rounded-2xl border p-4 text-left transition-all ${c.color}
                ${active
                  ? `${c.activeBg} border-current ring-2 ${c.ring} scale-[1.02] shadow-md`
                  : `${c.bg} border-neutral-200/60 dark:border-white/[0.06] hover:shadow-md hover:scale-[1.01]`
                }`}>
              <p className="text-[24px] font-extrabold leading-none">{count}</p>
              <p className="mt-1 text-[12px] font-semibold opacity-80">{c.label}</p>
              {active && <p className="mt-1 text-[10px] opacity-60">Click to clear</p>}
            </button>
          )
        })}
      </div>

      {loadError && (
        <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{loadError}</p>
      )}

      <DataTable columns={COLS} data={filtered} title="Bookings" filename="bookings"
        rowKey={r => r.id} searchPlaceholder="Search guest, room, ref…" loading={loading}
        onLoadMore={loadMore} hasMore={hasMore} loadingMore={loadingMore}/>

      <BookingPaymentModal booking={payFor} onClose={() => setPayFor(null)} onDone={load} />

      {/* ── New Booking Modal ──────────────────────────────────────────── */}
      <Modal open={mode === 'add'} onClose={close} title="New Booking" size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={save} disabled={!isAddValid || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Create Booking
          </button>
        </>}>
        <div className="space-y-4">
          <ErrorBanner/>

          <Field label="Guest">
            <Select value={form.primary_guest_id} onChange={v => f('primary_guest_id', v)}
              placeholder="— Select guest —" autoFocus
              options={guests.map(g => ({
                value: g.id,
                label: `${g.first_name} ${g.last_name}${g.email ? ` (${g.email})` : ''}`,
              }))}/>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-in Date">
              <DatePicker value={form.check_in_date} onChange={setCheckIn} placeholder="Select date"/>
            </Field>
            <Field label="Check-out Date">
              <DatePicker value={form.check_out_date} onChange={setCheckOut} placeholder="Select date"/>
            </Field>
          </div>

          {numNights > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-2.5 dark:bg-indigo-500/10">
              <span className="text-[20px] font-extrabold text-indigo-700 dark:text-indigo-300">{numNights}</span>
              <span className="text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">
                night{numNights !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <Field label="Available Room">
            <Select value={form.room_id} onChange={v => f('room_id', v)}
              placeholder={
                !form.check_in_date || !form.check_out_date ? '— Select dates first —'
                : rooms.length === 0 ? '— No rooms available —'
                : '— Select room —'
              }
              disabled={!form.check_in_date || !form.check_out_date || rooms.length === 0}
              options={rooms.map(r => ({ value: r.id, label: `Room ${r.room_number} — ${r.room_type_name}` }))}/>
          </Field>

          <Field label="Rate Plan (optional)">
            <Select value={form.rate_plan_id} onChange={handlePlanChange}
              placeholder="— No rate plan —"
              options={plans.map(p => ({
                value: p.id,
                label: `${p.name}  ·  $${p.price_per_night}/night  ·  ${p.room_type_name}`,
              }))}/>
          </Field>

          <Field label="Rate per Night ($)">
            <input type="number" min="0" step="0.01" value={form.rate_per_night}
              onChange={e => f('rate_per_night', e.target.value)}
              placeholder="e.g. 80.00" className={INPUT}/>
          </Field>

          {estimatedTotal && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-500">Estimated Total</p>
                <p className="text-[18px] font-extrabold text-emerald-700 dark:text-emerald-300">${estimatedTotal}</p>
              </div>
              <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                {numNights} nights × ${form.rate_per_night}
              </p>
            </div>
          )}

          <Field label="Special Requests">
            <textarea value={form.special_requests} onChange={e => f('special_requests', e.target.value)}
              rows={2} placeholder="Special requests…" className={`${INPUT} resize-none`}/>
          </Field>
        </div>
      </Modal>

      {/* ── Edit Booking Modal ─────────────────────────────────────────── */}
      <Modal open={mode === 'edit'} onClose={close}
        title={`Edit Booking — ${selected?.booking_ref}`} size="lg"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doUpdate} disabled={!isEditValid || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Save Changes
          </button>
        </>}>
        <div className="space-y-4">
          <ErrorBanner/>

          {/* Read-only guest & room info */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <p className="text-[13px]">
              <span className="font-semibold text-neutral-800 dark:text-white">{selected?.guest_name}</span>
              <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>
              <span className="text-neutral-500">Room {selected?.room_number} {selected?.room_type_name}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-in Date">
              <DatePicker value={editForm.check_in_date}
                onChange={v => ef('check_in_date', v)} placeholder="Select date"/>
            </Field>
            <Field label="Check-out Date">
              <DatePicker value={editForm.check_out_date}
                onChange={v => ef('check_out_date', v)} placeholder="Select date"/>
            </Field>
          </div>

          {editNights > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-2.5 dark:bg-indigo-500/10">
              <span className="text-[20px] font-extrabold text-indigo-700 dark:text-indigo-300">{editNights}</span>
              <span className="text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">
                night{editNights !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <Field label="Rate per Night ($)">
            <input type="number" min="0" step="0.01" value={editForm.rate_per_night}
              onChange={e => ef('rate_per_night', e.target.value)}
              placeholder="e.g. 80.00" className={INPUT}/>
          </Field>

          {editEstimated && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-500">New Total</p>
                <p className="text-[18px] font-extrabold text-emerald-700 dark:text-emerald-300">${editEstimated}</p>
              </div>
              <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                {editNights} nights × ${editForm.rate_per_night}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Adults">
              <input type="number" min="1" value={editForm.num_adults}
                onChange={e => ef('num_adults', e.target.value)} className={INPUT}/>
            </Field>
            <Field label="Children">
              <input type="number" min="0" value={editForm.num_children}
                onChange={e => ef('num_children', e.target.value)} className={INPUT}/>
            </Field>
          </div>

          <Field label="Special Requests">
            <textarea value={editForm.special_requests}
              onChange={e => ef('special_requests', e.target.value)}
              rows={2} placeholder="Special requests…" className={`${INPUT} resize-none`}/>
          </Field>
        </div>
      </Modal>

      {/* ── Cancel Confirm ─────────────────────────────────────────────── */}
      <Modal open={mode === 'cancel'} onClose={close} title="Cancel Booking" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doCancel} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-amber-600 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Yes, Cancel
          </button>
        </>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
            <Building2 size={24} className="text-amber-600 dark:text-amber-400"/>
          </div>
          <div>
            <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Cancel {selected?.booking_ref}?</p>
            <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
              {selected?.guest_name} · Room {selected?.room_number}
            </p>
          </div>
          <ErrorBanner/>
        </div>
      </Modal>

      {/* ── Room Transfer ──────────────────────────────────────────────── */}
      <Modal open={mode === 'transfer'} onClose={close}
        title={selected ? `Transfer Room — ${selected.booking_ref}` : 'Room Transfer'} size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doTransfer} disabled={!selected || !transferRoomId || saving}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <ArrowRightLeft size={13}/>}
            Transfer
          </button>
        </>}>
        <div className="space-y-4">
          <ErrorBanner/>

          <Field label="Guest / Booking">
            <Select value={selected?.id ?? ''} onChange={pickTransferBooking}
              placeholder={transferable.length === 0 ? '— No confirmed or checked-in guests —' : '— Select guest —'}
              disabled={transferable.length === 0}
              options={transferable.map(b => ({
                value: b.id,
                label: `${b.guest_name} — Room ${b.room_number} (${b.status.replace('_',' ')})`,
              }))}/>
          </Field>

          {selected && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <p className="text-[13px]">
                <span className="font-semibold text-neutral-800 dark:text-white">{selected.guest_name}</span>
                <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>
                <span className="text-neutral-500">Currently in Room {selected.room_number} ({selected.room_type_name})</span>
              </p>
            </div>
          )}

          <Field label="Move To Room">
            <Select value={transferRoomId} onChange={setTransferRoomId}
              placeholder={
                !selected ? '— Select a guest first —'
                : transferLoading ? '— Loading rooms —'
                : availableForTransfer.length === 0 ? '— No other rooms available —'
                : '— Select room —'
              }
              disabled={!selected || transferLoading || availableForTransfer.length === 0}
              options={availableForTransfer.map(r => ({ value: r.id, label: `Room ${r.room_number} — ${r.room_type}` }))}/>
          </Field>
          <p className="text-[11.5px] text-neutral-400">
            Only rooms currently marked <b>available</b> are shown — occupied, cleaning, and out-of-service rooms are hidden.
            {selected?.status === 'checked_in' && ' The current room will be sent to housekeeping for cleaning.'}
          </p>
        </div>
      </Modal>

      {/* ── Room Exchange ─────────────────────────────────────────────── */}
      <Modal open={mode === 'exchange'} onClose={close} title="Room Exchange" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doExchange} disabled={!exchangeAId || !exchangeBId || exchangeAId === exchangeBId || saving}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Repeat size={13}/>}
            Exchange
          </button>
        </>}>
        <div className="space-y-4">
          <ErrorBanner/>

          <Field label="Guest A">
            <Select value={exchangeAId} onChange={setExchangeAId}
              placeholder={transferable.length === 0 ? '— No confirmed or checked-in guests —' : '— Select guest —'}
              disabled={transferable.length === 0}
              options={transferable.map(b => ({
                value: b.id,
                label: `${b.guest_name} — Room ${b.room_number} (${b.status.replace('_',' ')})`,
              }))}/>
          </Field>

          <Field label="Guest B">
            <Select value={exchangeBId} onChange={setExchangeBId}
              placeholder={transferable.length === 0 ? '— No confirmed or checked-in guests —' : '— Select guest —'}
              disabled={transferable.length === 0}
              options={transferable
                .filter(b => b.id !== exchangeAId)
                .map(b => ({
                  value: b.id,
                  label: `${b.guest_name} — Room ${b.room_number} (${b.status.replace('_',' ')})`,
                }))}/>
          </Field>

          {bookingA && bookingB && (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-center">
                <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">{bookingA.guest_name}</p>
                <p className="text-[11px] text-neutral-500">Room {bookingA.room_number}</p>
              </div>
              <Repeat size={16} className="shrink-0 text-teal-500"/>
              <div className="text-center">
                <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">{bookingB.guest_name}</p>
                <p className="text-[11px] text-neutral-500">Room {bookingB.room_number}</p>
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-neutral-400">
            Each guest moves straight into the other's room — no availability check is needed since both rooms
            are already occupied by the two of them, and neither room needs cleaning in between.
          </p>
        </div>
      </Modal>

      {/* ── Delete Confirm ─────────────────────────────────────────────── */}
      <Modal open={mode === 'delete'} onClose={close} title="Delete Booking" size="sm"
        footer={<>
          <CancelBtn onClick={close}/>
          <button onClick={doDelete} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : null}
            Yes, Delete
          </button>
        </>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/20">
            <Trash2 size={24} className="text-rose-600 dark:text-rose-400"/>
          </div>
          <div>
            <p className="text-[14px] font-bold text-neutral-800 dark:text-white">Delete {selected?.booking_ref}?</p>
            <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
              {selected?.guest_name} · Room {selected?.room_number}
            </p>
            <p className="mt-2 text-[12px] text-rose-500">This action cannot be undone.</p>
          </div>
          <ErrorBanner/>
        </div>
      </Modal>
    </div>
  )
}
