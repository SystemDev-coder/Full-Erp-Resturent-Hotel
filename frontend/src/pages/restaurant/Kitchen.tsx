import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BellRing, BellOff, CheckCheck, CheckCircle2, ChefHat, Clock, Flame, ConciergeBell, Maximize2, Minimize2, Printer, RefreshCw, StickyNote } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { printReadySlip } from '@utils/readySlip'
import { TONES } from '@utils/tones'

// Kitchen Display (KDS): what the waiters sent to the kitchen, as live tickets. Cooks tick items off,
// the ticket moves to "Ready for pickup", and the waiter clears it when the food is served.

interface KLine {
  id: string; name: string; quantity: number; status: 'preparing' | 'ready'
  special_request: string | null; category: string | null; modifiers: string[]; prep_minutes: number | null
}
interface Ticket {
  id: string; order_ref: string; call_no: number | null; order_type: string; table_number: string | null; waiter_name: string | null
  sent_at: string; lines: KLine[]; stage: 'cooking' | 'ready'; prep_minutes: number; notes: string | null
}
interface Feed { tickets: Ticket[]; categories: string[]; server_time: string }

const POLL_MS = 5000
const TYPE_LABEL: Record<string, string> = { dine_in: 'Dine in', takeaway: 'Takeaway', delivery: 'Delivery', room_service: 'Room service' }

// Short two-tone chime for a new ticket (no audio file needed)
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.4)
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.45)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch { /* audio blocked until the first click — harmless */ }
}

export default function Kitchen() {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [error, setError] = useState('')
  const [station, setStation] = useState('all')
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('kds-sound') !== 'off' } catch { return true } })
  const [full, setFull] = useState(false)
  // print the "order ready" slip (big call number) when the cook taps "All ready"
  const [slip, setSlip] = useState(() => { try { return localStorage.getItem('kds-slip') !== 'off' } catch { return true } })
  useEffect(() => { try { localStorage.setItem('kds-slip', slip ? 'on' : 'off') } catch { /* private mode */ } }, [slip])
  const [busy, setBusy] = useState<string | null>(null)
  const [skew, setSkew] = useState(0)                 // server clock − browser clock, so timers are right on any PC
  const [, setTick] = useState(0)
  const seen = useRef<Set<string> | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const root = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/restaurant/kitchen')
      const data: Feed = r.data.data
      setSkew(new Date(data.server_time).getTime() - Date.now())
      const ids = new Set(data.tickets.map(t => t.id))
      // chime for tickets that were not on screen last time (never on the very first load)
      if (seen.current && soundRef.current && data.tickets.some(t => !seen.current!.has(t.id))) chime()
      seen.current = ids
      setFeed(data); setError('')
    } catch (e) { setError(getApiErrorMessage(e)) }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const clock = setInterval(() => setTick(n => n + 1), 15_000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [load])

  useEffect(() => { try { localStorage.setItem('kds-sound', sound ? 'on' : 'off') } catch { /* private mode */ } }, [sound])
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else root.current?.requestFullscreen().catch(() => undefined) }

  const act = async (key: string, call: () => Promise<unknown>) => {
    setBusy(key); setError('')
    try { await call(); await load() }
    catch (e) { setError(getApiErrorMessage(e)); load() }
    finally { setBusy(null) }
  }
  const lineReady = (t: Ticket, l: KLine) => act(l.id, () => api.patch(`/restaurant/kitchen/orders/${t.id}/lines/${l.id}`, { status: 'ready' }))
  const ticketReady = (t: Ticket) => act(t.id, async () => {
    await api.patch(`/restaurant/kitchen/orders/${t.id}/status`, { status: 'ready' })
    if (slip) printReadySlip({ call_no: t.call_no, order_ref: t.order_ref, order_type: t.order_type, table_number: t.table_number, waiter_name: t.waiter_name, lines: t.lines.map(l => ({ name: l.name, quantity: l.quantity })) })
  })
  const ticketServed = (t: Ticket) => act(t.id, () => api.patch(`/restaurant/kitchen/orders/${t.id}/status`, { status: 'served' }))

  const tickets = useMemo(() => {
    if (!feed) return []
    if (station === 'all') return feed.tickets
    return feed.tickets
      .map(t => ({ ...t, lines: t.lines.filter(l => l.category === station) }))
      .filter(t => t.lines.length > 0)
      .map(t => ({ ...t, stage: (t.lines.some(l => l.status === 'preparing') ? 'cooking' : 'ready') as 'cooking' | 'ready' }))
  }, [feed, station])
  const cooking = tickets.filter(t => t.stage === 'cooking')
  const ready = tickets.filter(t => t.stage === 'ready')

  const minutes = (t: Ticket) => Math.max(0, Math.floor((Date.now() + skew - new Date(t.sent_at).getTime()) / 60_000))
  const tone = (t: Ticket) => {
    const m = minutes(t), target = Math.max(t.prep_minutes, 10)
    return m >= target * 1.5 ? TONES.rose : m >= target ? TONES.butter : TONES.mint
  }

  const Card = ({ t }: { t: Ticket }) => {
    const m = minutes(t), c = tone(t), isReady = t.stage === 'ready'
    return (
      <article className={`flex flex-col overflow-hidden rounded-3xl border shadow-sm ${isReady ? TONES.sky.card : c.card}`}>
        <header className="flex items-start gap-3 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <p className={`text-[17px] font-extrabold leading-tight ${isReady ? TONES.sky.ink : c.ink}`}>
              {t.call_no ? <span className="mr-2 rounded-lg bg-white/70 px-2 py-0.5 text-[15px] dark:bg-white/10">#{t.call_no}</span> : null}{t.table_number ? `Table ${t.table_number}` : TYPE_LABEL[t.order_type] ?? t.order_type}
            </p>
            <p className={`mt-0.5 truncate text-[11.5px] opacity-75 ${isReady ? TONES.sky.ink : c.ink}`}>
              {t.order_ref}{t.table_number ? ` · ${TYPE_LABEL[t.order_type] ?? t.order_type}` : ''}{t.waiter_name ? ` · ${t.waiter_name}` : ''}
            </p>
          </div>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums ${isReady ? TONES.sky.chip : c.chip}`}>
            <Clock size={12} /> {m} min
          </span>
        </header>
        {t.notes && <p className="mx-4 mt-2 flex items-start gap-1.5 rounded-xl bg-white/60 px-3 py-1.5 text-[11.5px] text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300"><StickyNote size={12} className="mt-0.5 shrink-0" />{t.notes}</p>}

        <ul className="mt-3 space-y-1.5 px-4">
          {t.lines.map(l => (
            <li key={l.id} className={`flex items-start gap-2.5 rounded-2xl bg-white/70 px-3 py-2 dark:bg-white/[0.06] ${l.status === 'ready' ? 'opacity-60' : ''}`}>
              <span className={`mt-0.5 flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1 text-[14px] font-extrabold ${isReady ? TONES.sky.chip : c.chip}`}>{l.quantity}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] font-bold leading-snug text-neutral-800 dark:text-white ${l.status === 'ready' ? 'line-through' : ''}`}>{l.name}</p>
                {l.modifiers.length > 0 && <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400">+ {l.modifiers.join(', ')}</p>}
                {l.special_request && <p className="mt-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">⚠ {l.special_request}</p>}
              </div>
              {l.status === 'preparing'
                ? <button onClick={() => lineReady(t, l)} disabled={busy === l.id} title="Mark this item ready"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"><CheckCircle2 size={16} /></button>
                : <CheckCircle2 size={18} className="mt-1 shrink-0 text-emerald-500" />}
            </li>
          ))}
        </ul>

        <footer className="mt-auto p-4 pt-3">
          {isReady
            ? <button onClick={() => ticketServed(t)} disabled={busy === t.id}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-sky-700 active:scale-[0.99] disabled:opacity-50"><ConciergeBell size={15} /> Picked up / served</button>
            : <button onClick={() => ticketReady(t)} disabled={busy === t.id}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-2.5 text-[13px] font-bold text-white transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50"><CheckCheck size={15} /> All ready</button>}
        </footer>
      </article>
    )
  }

  return (
    <div ref={root} className={`space-y-5 ${full ? 'overflow-y-auto bg-neutral-50 p-5 dark:bg-[#0f1117]' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${TONES.peach.chip}`}><ChefHat size={22} /></span>
          <div>
            <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Kitchen</h1>
            <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400">{cooking.length} cooking · {ready.length} ready for pickup · updates every {POLL_MS / 1000}s</p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={() => setSound(s => !s)} title={sound ? 'New-order sound is on' : 'New-order sound is off'}
          className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-semibold transition ${sound ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-neutral-200 text-neutral-500 dark:border-white/[0.08]'}`}>
          {sound ? <BellRing size={15} /> : <BellOff size={15} />} Sound {sound ? 'on' : 'off'}
        </button>
        <button onClick={() => setSlip(s => !s)} title="Print the ready slip when you tap All ready"
          className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-semibold transition ${slip ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300' : 'border-neutral-200 text-neutral-500 dark:border-white/[0.08]'}`}>
          <Printer size={15} /> Slip {slip ? 'on' : 'off'}
        </button>
        <button onClick={load} className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:text-indigo-600 dark:border-white/[0.08]" title="Refresh"><RefreshCw size={15} /></button>
        <button onClick={toggleFull} className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:text-indigo-600 dark:border-white/[0.08]" title="Full screen">{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
      </div>

      {feed && feed.categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {['all', ...feed.categories].map(c => (
            <button key={c} onClick={() => setStation(c)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${station === c ? 'bg-indigo-600 text-white' : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300'}`}>
              {c === 'all' ? 'All stations' : c}
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}

      {!feed ? (
        <div className="flex h-60 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-indigo-500" /></div>
      ) : tickets.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-200 text-center dark:border-white/[0.08]">
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${TONES.mint.chip}`}><Flame size={26} /></span>
          <p className="mt-3 text-[15px] font-bold text-neutral-700 dark:text-neutral-200">The kitchen is clear</p>
          <p className="mt-1 text-[12.5px] text-neutral-400">New orders appear here the moment a waiter sends them.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-neutral-500"><Flame size={14} className="text-orange-500" /> Cooking <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] dark:bg-white/[0.08]">{cooking.length}</span></h2>
            <div className="grid gap-4 md:grid-cols-2">{cooking.map(t => <Card key={t.id} t={t} />)}</div>
            {cooking.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-200 py-10 text-center text-[13px] text-neutral-400 dark:border-white/[0.08]">Nothing cooking</p>}
          </section>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-neutral-500"><ConciergeBell size={14} className="text-sky-500" /> Ready for pickup <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] dark:bg-white/[0.08]">{ready.length}</span></h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">{ready.map(t => <Card key={t.id} t={t} />)}</div>
            {ready.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-200 py-10 text-center text-[13px] text-neutral-400 dark:border-white/[0.08]">Nothing waiting</p>}
          </section>
        </div>
      )}
    </div>
  )
}
