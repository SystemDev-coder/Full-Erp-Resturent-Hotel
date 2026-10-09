import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, ConciergeBell, Printer, X } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { printReadySlipFor } from '@utils/readySlip'

// Floating "Ready to serve" panel for waiters / cashiers: when the kitchen marks an order READY it appears here
// with a sound, the call number and the table. One tap = served (and the slip can be printed again).
// `waiterId` (POS): that waiter's own orders come first and are highlighted.

interface Ready { id: string; order_ref: string; call_no: number | null; order_type: string; table_number: string | null; waiter_name: string | null; server_staff_id: string | null; updated_at: string }

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[988, 1319, 988].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'triangle'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16)
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + i * 0.16 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.35)
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.4)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch { /* audio needs a first click on some browsers */ }
}

export function ReadyAlerts({ waiterId }: { waiterId?: string }) {
  const [list, setList] = useState<Ready[]>([])
  const [open, setOpen] = useState(true)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const seen = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/restaurant/orders', { params: { status: 'ready' } })
      const rows: Ready[] = r.data.data
      if (seen.current && rows.some(x => !seen.current!.has(x.id))) { chime(); setFlash(true); setOpen(true); setTimeout(() => setFlash(false), 4000) }
      seen.current = new Set(rows.map(x => x.id))
      setList(rows); setError('')
    } catch { /* offline / not allowed — stay quiet */ }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(() => { if (!document.hidden) load() }, 6000)
    const clock = setInterval(() => setNow(Date.now()), 20_000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [load])

  const served = async (id: string) => {
    setError('')
    try { await api.patch(`/restaurant/orders/${id}/status`, { status: 'served' }); setList(l => l.filter(x => x.id !== id)); load() }
    catch (e) { setError(getApiErrorMessage(e)) }
  }

  if (list.length === 0) return null
  const mine = (x: Ready) => !!waiterId && x.server_staff_id === waiterId
  const sorted = [...list].sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.updated_at.localeCompare(b.updated_at))
  const mins = (x: Ready) => Math.max(0, Math.floor((now - new Date(x.updated_at).getTime()) / 60_000))

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)]">
      <button onClick={() => setOpen(o => !o)}
        className={`ml-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold text-white shadow-lg transition ${flash ? 'animate-bounce bg-emerald-500' : 'bg-emerald-600'} hover:bg-emerald-700`}>
        <BellRing size={15} /> {list.length} ready to serve
      </button>
      {open && (
        <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-3xl border border-emerald-200 bg-white p-2 shadow-2xl dark:border-emerald-500/30 dark:bg-[#1c2333]">
          {error && <p className="mx-2 mb-1 rounded-lg bg-rose-50 px-2 py-1 text-[11.5px] text-rose-600">{error}</p>}
          {sorted.map(x => (
            <div key={x.id} className={`mb-1.5 flex items-center gap-3 rounded-2xl px-3 py-2.5 last:mb-0 ${mine(x) ? 'bg-emerald-50 ring-2 ring-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/40' : 'bg-neutral-50 dark:bg-white/[0.04]'}`}>
              <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-600 leading-none text-white">
                <span className="text-[9px] font-semibold opacity-80">CALL</span><span className="text-[20px] font-extrabold">{x.call_no ?? '—'}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-neutral-900 dark:text-white">{x.table_number ? `Table ${x.table_number}` : x.order_type === 'takeaway' ? 'Takeaway' : x.order_type.replace('_', ' ')}</p>
                <p className="truncate text-[11px] text-neutral-500">{x.waiter_name ?? 'No waiter'}{mine(x) ? ' · yours' : ''} · waiting {mins(x)} min</p>
              </div>
              <button onClick={() => printReadySlipFor(x.id).catch(e => setError(getApiErrorMessage(e)))} title="Print the ready slip" className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-white hover:text-indigo-600 dark:hover:bg-white/10"><Printer size={15} /></button>
              <button onClick={() => served(x.id)} title="Delivered to the customer" className="flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-[12px] font-bold text-white hover:bg-emerald-700"><ConciergeBell size={14} /> Served</button>
            </div>
          ))}
          <button onClick={() => setOpen(false)} className="mx-auto mt-1 flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600"><X size={11} /> hide</button>
        </div>
      )}
    </div>
  )
}
