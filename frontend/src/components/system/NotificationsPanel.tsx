import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2, ExternalLink, MessageCircle, RefreshCw, RotateCcw, Save, Send, Smartphone, Webhook } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'
import { fmtDateTime } from '@utils/detailFormat'

// Systems → Notifications: WhatsApp / SMS messages to guests (booking, reminder, reservation, payment).

type Provider = 'manual' | 'twilio_whatsapp' | 'twilio_sms' | 'webhook'
interface Settings { enabled: boolean; provider: Provider; country_code: string; events: Record<string, boolean>; templates: Record<string, string> }
interface EventDef { key: string; label: string; description: string; vars: string[]; template: string }
interface ProviderInfo { key: Provider; ready: boolean; missing: string[] }
interface Row { id: string; event: string; channel: string; to_phone: string | null; message: string; status: 'queued' | 'manual' | 'sent' | 'failed'; error: string | null; created_at: string; sent_at: string | null }

const PROVIDER_META: Record<Provider, { title: string; text: string; icon: JSX.Element }> = {
  manual: { title: 'Manual (WhatsApp click-to-send)', text: 'No setup. Each message is prepared for you — one tap opens WhatsApp with the text already written.', icon: <MessageCircle size={18} /> },
  twilio_whatsapp: { title: 'Twilio WhatsApp', text: 'Fully automatic through your Twilio WhatsApp number.', icon: <Smartphone size={18} /> },
  twilio_sms: { title: 'Twilio SMS', text: 'Fully automatic text messages through Twilio.', icon: <Smartphone size={18} /> },
  webhook: { title: 'Your own gateway (webhook)', text: 'The system POSTs each message to a URL you control — for a local SMS / WhatsApp provider.', icon: <Webhook size={18} /> },
}
const STATUS: Record<string, [string, string]> = {
  manual: ['Ready to send', TONES.butter.soft], sent: ['Sent', TONES.mint.soft], failed: ['Failed', TONES.rose.soft], queued: ['Sending…', TONES.sky.soft],
}
const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
const card = 'rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]'

export function NotificationsPanel() {
  const [s, setS] = useState<Settings | null>(null)
  const [events, setEvents] = useState<EventDef[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState({ to_send: 0, failed: 0, sent: 0 })
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testEvent, setTestEvent] = useState('booking_confirmed')
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({})

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }
  const loadLog = useCallback(() => api.get('/system/notifications', { params: filter ? { status: filter } : {} })
    .then(r => { setRows(r.data.data.rows); setCounts(r.data.data.counts) }).catch(e => setError(getApiErrorMessage(e))), [filter])
  const loadSettings = useCallback(() => api.get('/system/notifications/settings').then(r => {
    setS(r.data.data.settings); setEvents(r.data.data.events); setProviders(r.data.data.providers)
  }).catch(e => setError(getApiErrorMessage(e))), [])
  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadLog() }, [loadLog])

  const save = async () => {
    if (!s) return
    setBusy(true); setError('')
    try { await api.put('/system/notifications/settings', s); flash('Saved.'); loadSettings() }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const sendTest = async () => {
    setBusy(true); setError('')
    try {
      const r = await api.post('/system/notifications/test', { phone: testPhone, event: testEvent })
      const d = r.data.data
      if (d.status === 'manual') window.open(waLink(d.to_phone, d.message), '_blank', 'noopener')
      flash(d.status === 'sent' ? 'Test message sent.' : d.status === 'manual' ? 'Test message prepared — WhatsApp opened.' : `Test failed: ${d.error}`)
      loadLog()
    } catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const act = async (id: string, kind: 'mark-sent' | 'retry') => {
    setError('')
    try { await api.post(`/system/notifications/${id}/${kind}`); loadLog() } catch (e) { setError(getApiErrorMessage(e)) }
  }
  const insertVar = (key: string, v: string) => {
    const el = areas.current[key]; if (!el || !s) return
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a
    const next = el.value.slice(0, a) + `{${v}}` + el.value.slice(b)
    setS({ ...s, templates: { ...s.templates, [key]: next } })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + v.length + 2, a + v.length + 2) })
  }

  if (!s) return <div className="flex h-40 items-center justify-center"><RefreshCw className="animate-spin text-neutral-400" size={20} />{error && <p className="ml-3 text-rose-600">{error}</p>}</div>
  const active = providers.find(p => p.key === s.provider)

  return (
    <div className="space-y-5">
      {error && <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}
      {msg && <p className="flex items-center gap-2 rounded-2xl bg-[#dcf2e6] px-4 py-3 text-[13px] font-semibold text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]"><CheckCircle2 size={15} />{msg}</p>}

      {/* master switch */}
      <section className={`flex flex-wrap items-center gap-4 rounded-3xl border p-5 ${s.enabled ? TONES.mint.card : TONES.sky.card}`}>
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${s.enabled ? TONES.mint.chip : TONES.sky.chip}`}><BellRing size={22} /></span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-[16px] font-extrabold ${s.enabled ? TONES.mint.ink : TONES.sky.ink}`}>Guest messages are {s.enabled ? 'ON' : 'OFF'}</h3>
          <p className={`text-[12.5px] opacity-80 ${s.enabled ? TONES.mint.ink : TONES.sky.ink}`}>Confirm bookings, remind guests on check-out day, confirm table reservations and thank guests for payments.</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" checked={s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} className="peer sr-only" />
          <span className="h-7 w-12 rounded-full bg-neutral-300 transition peer-checked:bg-emerald-500 dark:bg-white/20" />
          <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </label>
      </section>

      {/* provider */}
      <section className={card}>
        <h3 className="mb-3 text-[15px] font-bold text-neutral-900 dark:text-white">How are messages sent?</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(PROVIDER_META) as Provider[]).map(p => {
            const info = providers.find(x => x.key === p), on = s.provider === p
            return (
              <button key={p} onClick={() => setS({ ...s, provider: p })}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${on ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200 dark:border-indigo-400/60 dark:bg-indigo-500/10 dark:ring-indigo-500/20' : 'border-neutral-200 hover:bg-neutral-50 dark:border-white/[0.08] dark:hover:bg-white/[0.03]'}`}>
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? TONES.lilac.chip : TONES.sky.soft}`}>{PROVIDER_META[p].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-neutral-800 dark:text-white">{PROVIDER_META[p].title}
                    {p !== 'manual' && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${info?.ready ? TONES.mint.soft : TONES.butter.soft}`}>{info?.ready ? 'configured' : 'not configured'}</span>}</span>
                  <span className="mt-0.5 block text-[12px] text-neutral-500">{PROVIDER_META[p].text}</span>
                </span>
              </button>)
          })}
        </div>
        {active && !active.ready && (
          <p className={`mt-3 flex items-start gap-2 rounded-2xl px-4 py-3 text-[12.5px] ${TONES.butter.soft}`}><AlertTriangle size={15} className="mt-0.5 shrink-0" />
            To use this, add <b className="font-mono">{active.missing.join(', ')}</b> to the server’s <b>.env</b> file and restart the server. Until then messages are saved in the log as “Failed — provider not configured”.</p>)}
        <div className="mt-4 flex items-center gap-3">
          <label className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">Country code</label>
          <input value={s.country_code} onChange={e => setS({ ...s, country_code: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            className="w-24 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] font-bold outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
          <span className="text-[12px] text-neutral-400">Added to numbers written like 0615 123 456 (Somalia = 252)</span>
        </div>
      </section>

      {/* templates */}
      <section className={card}>
        <h3 className="mb-1 text-[15px] font-bold text-neutral-900 dark:text-white">Messages</h3>
        <p className="mb-4 text-[12.5px] text-neutral-500">Switch each message on or off and edit the wording. Tap a tag to insert it at the cursor.</p>
        <div className="space-y-4">
          {events.map(ev => (
            <div key={ev.key} className="rounded-2xl border border-neutral-100 p-4 dark:border-white/[0.06]">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={s.events[ev.key] !== false} onChange={e => setS({ ...s, events: { ...s.events, [ev.key]: e.target.checked } })} className="mt-1 h-[18px] w-[18px] accent-indigo-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-neutral-800 dark:text-white">{ev.label}</p>
                  <p className="text-[12px] text-neutral-400">{ev.description}</p>
                </div>
                <button onClick={() => setS({ ...s, templates: { ...s.templates, [ev.key]: ev.template } })} title="Restore the original wording" className="rounded-lg p-1.5 text-neutral-400 hover:text-indigo-600"><RotateCcw size={14} /></button>
              </div>
              <textarea ref={el => { areas.current[ev.key] = el }} rows={3} maxLength={600} value={s.templates[ev.key] ?? ''} onChange={e => setS({ ...s, templates: { ...s.templates, [ev.key]: e.target.value } })}
                className="mt-3 w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
              <div className="mt-2 flex flex-wrap gap-1.5">{ev.vars.map(v => (
                <button key={v} type="button" onClick={() => insertVar(ev.key, v)} className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold hover:opacity-80 ${TONES.lilac.soft}`}>{`{${v}}`}</button>))}</div>
            </div>))}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save size={14} /> {busy ? 'Saving…' : 'Save'}</button>
        </div>
      </section>

      {/* test */}
      <section className={card}>
        <h3 className="mb-3 text-[15px] font-bold text-neutral-900 dark:text-white">Send a test</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Your phone, e.g. 0615 123 456" className="w-64 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
          <select value={testEvent} onChange={e => setTestEvent(e.target.value)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:[color-scheme:dark]">
            {events.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
          <button onClick={sendTest} disabled={busy || !testPhone} className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"><Send size={14} /> Send test</button>
          <span className="text-[12px] text-neutral-400">Uses sample guest data. Save your changes first.</span>
        </div>
      </section>

      {/* log */}
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-2 text-[15px] font-bold text-neutral-900 dark:text-white">Message log</h3>
          {([['', 'All'], ['manual', `To send (${counts.to_send})`], ['failed', `Failed (${counts.failed})`], ['sent', `Sent (${counts.sent})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${filter === k ? 'bg-indigo-600 text-white' : 'border border-neutral-200 text-neutral-600 dark:border-white/[0.08] dark:text-neutral-300'}`}>{l}</button>))}
          <button onClick={loadLog} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:text-indigo-600 dark:border-white/[0.08]"><RefreshCw size={13} /></button>
        </div>
        {rows.length === 0 ? <p className="py-8 text-center text-[13px] text-neutral-400">No messages yet.</p> : (
          <ul className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-neutral-400"><b className="font-semibold text-neutral-600 dark:text-neutral-300">{events.find(e => e.key === r.event)?.label ?? r.event}</b> · {r.to_phone ? `+${r.to_phone.replace(/^\+/, '')}` : 'no number'} · {fmtDateTime(r.created_at)}</p>
                  <p className="mt-0.5 text-[13px] text-neutral-700 dark:text-neutral-200">{r.message}</p>
                  {r.error && <p className="mt-0.5 text-[12px] text-rose-600">{r.error}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {r.status === 'manual' && r.to_phone && <>
                    <a href={waLink(r.to_phone, r.message)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-emerald-700"><ExternalLink size={12} /> Open WhatsApp</a>
                    <button onClick={() => act(r.id, 'mark-sent')} className={`rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ${TONES.mint.soft}`}>Mark sent</button></>}
                  {r.status === 'failed' && r.to_phone && <button onClick={() => act(r.id, 'retry')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ${TONES.sky.soft}`}><RotateCcw size={12} /> Retry</button>}
                </div>
              </li>))}
          </ul>)}
      </section>
    </div>
  )
}
