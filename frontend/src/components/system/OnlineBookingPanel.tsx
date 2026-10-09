import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { CheckCircle2, Copy, ExternalLink, Globe, Inbox, QrCode, Save } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'

// Systems → Online booking: switch the public booking page on, set the rules, share the link / QR code.

interface Settings { enabled: boolean; hold_hours: number; max_nights: number; terms: string }
interface Data { settings: Settings; branch_id: string; has_hotel: boolean; pending: number; total: number }

export function OnlineBookingPanel() {
  const [d, setD] = useState<Data | null>(null)
  const [s, setS] = useState<Settings | null>(null)
  const [qr, setQr] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => api.get('/system/online-booking').then(r => { setD(r.data.data); setS(r.data.data.settings) }).catch(e => setError(getApiErrorMessage(e)))
  useEffect(() => { load() }, [])
  const link = d ? `${window.location.origin}/book/${d.branch_id}` : ''
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 240, margin: 1 }).then(setQr).catch(() => setQr('')) }, [link])

  const save = async () => {
    if (!s) return
    setBusy(true); setError(''); setMsg('')
    try { await api.put('/system/online-booking', s); setMsg(s.enabled ? 'Saved — the booking page is LIVE.' : 'Saved — the booking page is switched off.'); setTimeout(() => setMsg(''), 4000); load() }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* blocked */ } }
  const downloadQr = () => { const a = document.createElement('a'); a.href = qr; a.download = 'online-booking-qr.png'; a.click() }

  if (!d || !s) return <p className="py-10 text-center text-[13px] text-neutral-400">{error || 'Loading…'}</p>

  return (
    <div className="space-y-5">
      {error && <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}
      {msg && <p className="flex items-center gap-2 rounded-2xl bg-[#dcf2e6] px-4 py-3 text-[13px] font-semibold text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]"><CheckCircle2 size={15} />{msg}</p>}
      {!d.has_hotel && <p className={`rounded-2xl px-4 py-3 text-[13px] ${TONES.butter.soft}`}>This branch has no hotel set up — online booking is for hotels.</p>}

      <section className={`flex flex-wrap items-center gap-4 rounded-3xl border p-5 ${s.enabled ? TONES.mint.card : TONES.sky.card}`}>
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${s.enabled ? TONES.mint.chip : TONES.sky.chip}`}><Globe size={22} /></span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-[16px] font-extrabold ${s.enabled ? TONES.mint.ink : TONES.sky.ink}`}>Online booking page is {s.enabled ? 'LIVE' : 'OFF'}</h3>
          <p className={`text-[12.5px] opacity-80 ${s.enabled ? TONES.mint.ink : TONES.sky.ink}`}>Guests pick dates and a room type, leave their phone number, and you confirm. Nothing is paid online.</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" checked={s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} className="peer sr-only" />
          <span className="h-7 w-12 rounded-full bg-neutral-300 transition peer-checked:bg-emerald-500 dark:bg-white/20" />
          <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </label>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
          <h3 className="mb-3 text-[15px] font-bold text-neutral-900 dark:text-white">Rules</h3>
          <div className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Hold an unconfirmed request for (hours)</span>
              <input type="number" min={1} max={168} value={s.hold_hours} onChange={e => setS({ ...s, hold_hours: Number(e.target.value) })} className="w-28 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] font-bold outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
              <span className="mt-1 block text-[11.5px] text-neutral-400">After this the room is released automatically, so strangers cannot block rooms.</span></label>
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Longest stay bookable online (nights)</span>
              <input type="number" min={1} max={90} value={s.max_nights} onChange={e => setS({ ...s, max_nights: Number(e.target.value) })} className="w-28 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] font-bold outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" /></label>
            <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Message shown before booking (payment, cancellation…)</span>
              <textarea rows={4} maxLength={1000} value={s.terms} onChange={e => setS({ ...s, terms: e.target.value })} placeholder="Pay at the hotel on arrival. Free cancellation up to 24 hours before check-in."
                className="w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" /></label>
          </div>
          <div className="mt-4 flex justify-end"><button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button></div>
        </section>

        <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-neutral-900 dark:text-white"><QrCode size={16} className="text-indigo-500" /> Share it</h3>
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-neutral-600 dark:text-neutral-300">{link}</span>
            <button onClick={copy} className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-semibold text-neutral-700 shadow-sm dark:bg-white/10 dark:text-neutral-200"><Copy size={12} /> {copied ? 'Copied' : 'Copy'}</button>
            <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-semibold text-neutral-700 shadow-sm dark:bg-white/10 dark:text-neutral-200"><ExternalLink size={12} /> Open</a>
          </div>
          <div className="mt-4 flex items-center gap-5">
            {qr && <img src={qr} alt="QR code of the booking page" className="h-36 w-36 rounded-2xl border border-neutral-200 bg-white p-1.5" />}
            <div className="space-y-2 text-[12.5px] text-neutral-500">
              <p>Put the link on your website, WhatsApp status, Facebook page and business card — or print the QR code at the reception and in the rooms.</p>
              <button onClick={downloadQr} disabled={!qr} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${TONES.sky.soft}`}>Download QR (PNG)</button>
              {!s.enabled && <p className="text-amber-600">The link shows “not available” until you switch the page on and save.</p>}
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-white/[0.04]">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${d.pending > 0 ? TONES.butter.chip : TONES.mint.chip}`}><Inbox size={18} /></span>
            <div className="flex-1 text-[13px]"><p className="font-bold text-neutral-800 dark:text-white">{d.pending} request{d.pending === 1 ? '' : 's'} waiting for you</p><p className="text-[11.5px] text-neutral-400">{d.total} online booking{d.total === 1 ? '' : 's'} so far</p></div>
            <Link to="/hotel/bookings" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-indigo-700">Open Bookings</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
