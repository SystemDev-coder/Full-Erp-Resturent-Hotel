import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BedDouble, CalendarDays, CheckCircle2, Clock, Coffee, Mail, MapPin, Maximize2, Minus, Phone, Plus, Search, ShieldCheck, User, Users, WifiOff } from 'lucide-react'

// Public online-booking page (no login), opened from the hotel's link / QR code:  /book/<branchId>
// The guest picks dates → sees the room types that are really free, with the real price → leaves their details.
// The hotel confirms the request; nothing is charged online.

interface Hotel {
  name: string; branch: string; logo_url?: string | null; phone?: string | null; email?: string | null; address?: string | null
  check_in_time: string; check_out_time: string; amenities: string[]; terms: string; hold_hours: number; max_nights: number
}
interface RoomType {
  id: string; name: string; description?: string | null; bed_configuration?: string | null; area_sqm?: string | null; features: string[]
  max_adults: number; max_children: number; breakfast: boolean; price_per_night: number; total: number; left: number
}
interface Availability { check_in: string; check_out: string; nights: number; adults: number; children: number; room_types: RoomType[] }
interface Receipt { booking_ref: string; hotel: string; room_type: string; check_in: string; check_out: string; nights: number; total: number; hold_hours: number; contact_phone?: string | null }

const API = import.meta.env.VITE_API_BASE_URL || '/api'
const money = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d) }
const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}/public/hotel/${path}`, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.message ?? 'Something went wrong — please try again.')
  return j.data as T
}

function Counter({ label, value, min, max, onChange, icon }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; icon: JSX.Element }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <div className="flex h-11 items-center justify-between rounded-xl border border-neutral-200 bg-white px-2">
        <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(min, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" disabled={value <= min}><Minus size={15} /></button>
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-neutral-800">{icon}{value}</span>
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 disabled:opacity-30" disabled={value >= max}><Plus size={15} /></button>
      </div>
    </div>
  )
}

export default function BookPage() {
  const { branchId = '' } = useParams<{ branchId: string }>()
  const today = useMemo(() => iso(new Date()), [])
  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [checkIn, setCheckIn] = useState(addDays(today, 1))
  const [checkOut, setCheckOut] = useState(addDays(today, 3))
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [avail, setAvail] = useState<Availability | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')

  const [picked, setPicked] = useState<RoomType | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', special_requests: '', website: '' })
  const [agree, setAgree] = useState(false)
  const [sending, setSending] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  useEffect(() => {
    api<Hotel>(encodeURIComponent(branchId)).then(setHotel).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [branchId])

  const search = async () => {
    setSearching(true); setSearchErr(''); setAvail(null); setPicked(null)
    try { setAvail(await api<Availability>(`${encodeURIComponent(branchId)}/availability?check_in=${checkIn}&check_out=${checkOut}&adults=${adults}&children=${children}`)) }
    catch (e) { setSearchErr((e as Error).message) } finally { setSearching(false) }
  }

  const book = async () => {
    if (!picked || !avail) return
    setSending(true); setFormErr('')
    try {
      setReceipt(await api<Receipt>(`${encodeURIComponent(branchId)}/book`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, room_type_id: picked.id, check_in: avail.check_in, check_out: avail.check_out, adults: avail.adults, children: avail.children }),
      }))
    } catch (e) { setFormErr((e as Error).message) } finally { setSending(false) }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-neutral-50"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-sky-500" /></div>
  if (error || !hotel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600"><WifiOff size={26} /></span>
        <p className="text-[15px] font-bold text-neutral-800">Online booking is not available right now</p>
        <p className="max-w-xs text-[13px] text-neutral-500">{error || 'Please contact the hotel directly to book a room.'}</p>
      </div>
    )
  }

  const canSend = form.first_name.trim() && form.phone.replace(/\D/g, '').length >= 7 && agree && !sending

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-neutral-50 to-neutral-50 pb-16 text-neutral-900">
      <header className="border-b border-neutral-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3.5">
          {hotel.logo_url ? <img src={hotel.logo_url} alt="" className="h-11 w-11 rounded-xl object-contain" /> : <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white"><BedDouble size={20} /></span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-extrabold leading-tight">{hotel.name}</h1>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-neutral-500">
              {hotel.address && <span className="flex items-center gap-1"><MapPin size={11} />{hotel.address}</span>}
              {hotel.phone && <span className="flex items-center gap-1"><Phone size={11} />{hotel.phone}</span>}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 pt-6">
        {receipt ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={34} /></span>
            <h2 className="mt-4 text-[22px] font-extrabold">Request received — thank you!</h2>
            <p className="mx-auto mt-1 max-w-md text-[14px] text-neutral-500">The hotel will confirm your booking shortly. We hold the room for you for {receipt.hold_hours} hours.</p>
            <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-sky-50 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Your booking reference</p>
              <p className="mt-0.5 font-mono text-[26px] font-extrabold tracking-wider text-sky-900">{receipt.booking_ref}</p>
            </div>
            <dl className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-x-4 gap-y-2 text-left text-[13px]">
              <dt className="text-neutral-500">Room</dt><dd className="text-right font-semibold">{receipt.room_type}</dd>
              <dt className="text-neutral-500">Arrive</dt><dd className="text-right font-semibold">{fmt(receipt.check_in)}</dd>
              <dt className="text-neutral-500">Leave</dt><dd className="text-right font-semibold">{fmt(receipt.check_out)}</dd>
              <dt className="text-neutral-500">Nights</dt><dd className="text-right font-semibold">{receipt.nights}</dd>
              <dt className="text-neutral-500">Total</dt><dd className="text-right text-[15px] font-extrabold">{money(receipt.total)}</dd>
            </dl>
            <p className="mt-5 text-[12.5px] text-neutral-500">Nothing has been charged. You pay at the hotel.{receipt.contact_phone ? ` Questions? Call ${receipt.contact_phone}.` : ''}</p>
            <p className="mt-1 text-[12px] font-semibold text-neutral-600">Please keep your reference number.</p>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-[16px] font-extrabold"><CalendarDays size={18} className="text-sky-600" /> Find a room</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Arrival</span>
                  <input type="date" value={checkIn} min={today} onChange={e => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(addDays(e.target.value, 1)) }}
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] font-medium outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Departure</span>
                  <input type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={e => setCheckOut(e.target.value)}
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[14px] font-medium outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                <Counter label="Adults" value={adults} min={1} max={6} onChange={setAdults} icon={<User size={14} className="text-neutral-400" />} />
                <Counter label="Children" value={children} min={0} max={6} onChange={setChildren} icon={<Users size={14} className="text-neutral-400" />} />
              </div>
              <button onClick={search} disabled={searching || !checkIn || !checkOut}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 text-[14px] font-bold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700 active:scale-[0.99] disabled:opacity-50 sm:w-auto sm:px-8">
                {searching ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <><Search size={16} /> Check availability</>}
              </button>
              {searchErr && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700">{searchErr}</p>}
              <p className="mt-3 text-[11.5px] text-neutral-400">Check-in from {hotel.check_in_time} · check-out by {hotel.check_out_time} · stays up to {hotel.max_nights} nights</p>
            </section>

            {avail && (
              <section className="space-y-3">
                <h2 className="text-[15px] font-extrabold">
                  {avail.room_types.length === 0 ? 'No rooms are free for those dates' : `${avail.room_types.length} room type${avail.room_types.length === 1 ? '' : 's'} available`}
                  <span className="ml-2 text-[12.5px] font-medium text-neutral-500">{fmt(avail.check_in)} → {fmt(avail.check_out)} · {avail.nights} night{avail.nights === 1 ? '' : 's'}</span>
                </h2>
                {avail.room_types.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-8 text-center text-[13.5px] text-neutral-500">Try other dates, or call us{hotel.phone ? ` on ${hotel.phone}` : ''} — we may still be able to help.</p>}
                {avail.room_types.map(rt => (
                  <article key={rt.id} className={`rounded-3xl border bg-white p-5 shadow-sm transition ${picked?.id === rt.id ? 'border-sky-400 ring-4 ring-sky-100' : 'border-neutral-200/70'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[17px] font-extrabold">{rt.name}</h3>
                        {rt.description && <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">{rt.description}</p>}
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-neutral-500">
                          <span className="flex items-center gap-1"><Users size={13} />Up to {rt.max_adults} adult{rt.max_adults === 1 ? '' : 's'}{rt.max_children > 0 ? ` + ${rt.max_children} child${rt.max_children === 1 ? '' : 'ren'}` : ''}</span>
                          {rt.bed_configuration && <span className="flex items-center gap-1"><BedDouble size={13} />{rt.bed_configuration}</span>}
                          {rt.area_sqm && <span className="flex items-center gap-1"><Maximize2 size={13} />{Number(rt.area_sqm)} m²</span>}
                          {rt.breakfast && <span className="flex items-center gap-1 font-semibold text-emerald-600"><Coffee size={13} />Breakfast included</span>}
                        </div>
                        {rt.features.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{rt.features.slice(0, 8).map(f => <span key={f} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">{f}</span>)}</div>}
                      </div>
                      <div className="flex shrink-0 flex-row items-end justify-between gap-3 sm:w-44 sm:flex-col sm:items-end">
                        <div className="sm:text-right">
                          <p className="text-[24px] font-extrabold leading-none">{money(rt.price_per_night)}</p>
                          <p className="text-[11.5px] text-neutral-500">per night</p>
                          <p className="mt-1.5 text-[12.5px] font-semibold text-neutral-700">{money(rt.total)} for {avail.nights} night{avail.nights === 1 ? '' : 's'}</p>
                          {rt.left <= 2 && <p className="mt-1 text-[11.5px] font-bold text-amber-600">Only {rt.left} left!</p>}
                        </div>
                        <button onClick={() => { setPicked(rt); setFormErr(''); setTimeout(() => document.getElementById('guest-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }}
                          className={`h-11 rounded-xl px-6 text-[13.5px] font-bold transition ${picked?.id === rt.id ? 'bg-sky-100 text-sky-700' : 'bg-sky-600 text-white hover:bg-sky-700'}`}>{picked?.id === rt.id ? 'Selected' : 'Select'}</button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}

            {picked && avail && (
              <section id="guest-form" className="scroll-mt-4 rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-[16px] font-extrabold">Your details</h2>
                <p className="mt-0.5 text-[12.5px] text-neutral-500">{picked.name} · {fmt(avail.check_in)} → {fmt(avail.check_out)} · <b>{money(picked.total)}</b> total, payable at the hotel</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">First name *</span>
                    <input autoComplete="given-name" maxLength={100} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-[14px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                  <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Last name</span>
                    <input autoComplete="family-name" maxLength={100} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-[14px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                  <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500"><Phone size={11} /> Phone / WhatsApp *</span>
                    <input type="tel" autoComplete="tel" maxLength={30} placeholder="+252 61 5123456" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-[14px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                  <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500"><Mail size={11} /> Email (optional)</span>
                    <input type="email" autoComplete="email" maxLength={255} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-[14px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                  <label className="block sm:col-span-2"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Anything we should know? (optional)</span>
                    <textarea rows={3} maxLength={500} value={form.special_requests} onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))} placeholder="Late arrival, extra bed, quiet room…" className="w-full resize-none rounded-xl border border-neutral-200 px-3 py-2.5 text-[14px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" /></label>
                  {/* honeypot — hidden from people, bots fill it in */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                    <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></label>
                  </div>
                </div>
                {hotel.terms && <p className="mt-4 flex items-start gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-[12.5px] leading-relaxed text-neutral-600"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-sky-600" />{hotel.terms}</p>}
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13px] text-neutral-700">
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] accent-sky-600" />
                  <span>I understand this is a request: the hotel confirms it, and I pay at the hotel.</span>
                </label>
                {formErr && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700">{formErr}</p>}
                <button onClick={book} disabled={!canSend}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[14.5px] font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 sm:w-auto sm:px-10">
                  {sending ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <><Clock size={16} /> Send booking request</>}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
