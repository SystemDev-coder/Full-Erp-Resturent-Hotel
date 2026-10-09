import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, Trash2, Calculator, Plus, ArrowLeft, Search, CheckCircle2, RefreshCw, Save, TrendingDown, TrendingUp, ChevronDown, AlertTriangle,
} from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Modal, { INPUT, Field, CancelBtn } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'
import { money, fmtDateTime } from '@utils/detailFormat'

// Inventory → Stock Control: count the shelves (stock-take), write off waste, and see what each dish really costs.

type Tab = 'take' | 'waste' | 'costing'
const Err = ({ msg }: { msg: string }) => msg ? <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{msg}</p> : null
const Ok = ({ msg }: { msg: string }) => msg ? <p className="flex items-center gap-2 rounded-2xl bg-[#dcf2e6] px-4 py-3 text-[13px] font-semibold text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]"><CheckCircle2 size={15} />{msg}</p> : null
const card = 'rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]'
const th = 'pb-2.5 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400'
const num = (v: unknown) => Number(v)
const fmtQ = (v: unknown) => String(Math.round(Number(v) * 1000) / 1000)

export default function StockControl() {
  const [tab, setTab] = useState<Tab>('take')
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Stock Control</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">Count the shelves, record waste, and know what every dish costs to make.</p>
      </div>
      <Tabs active={tab} onChange={k => setTab(k as Tab)} tabs={[
        { key: 'take', label: 'Stock-take', icon: <ClipboardCheck size={14} /> },
        { key: 'waste', label: 'Waste', icon: <Trash2 size={14} /> },
        { key: 'costing', label: 'Recipe costing', icon: <Calculator size={14} /> },
      ]} />
      {tab === 'take' && <StockTakes />}
      {tab === 'waste' && <Waste />}
      {tab === 'costing' && <Costing />}
    </div>
  )
}

// ── Stock-take ────────────────────────────────────────────────────────────────

interface TakeRow { id: string; reference: string; note: string | null; status: string; created_at: string; completed_at: string | null; warehouse_name: string; item_count: string; counted_count: string; variance_value: string }
interface TakeLine { item_id: string; name: string; sku: string; category: string; unit_of_measure: string; system_qty: string; counted_qty: string | null; unit_cost: string }
interface TakeDetail extends Omit<TakeRow, 'item_count' | 'counted_count' | 'variance_value'> { id: string; lines: TakeLine[] }

const STATUS_TONE: Record<string, string> = { counting: TONES.butter.soft, completed: TONES.mint.soft, cancelled: TONES.rose.soft }

function StockTakes() {
  const [rows, setRows] = useState<TakeRow[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get('/inventory/stock-takes').then(r => setRows(r.data.data)).catch(e => setError(getApiErrorMessage(e))), [])
  useEffect(() => { load() }, [load, openId])

  const start = async () => {
    setBusy(true); setError('')
    try { const r = await api.post('/inventory/stock-takes', {}); setOpenId(r.data.data.id) }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  if (openId) return <CountSheet id={openId} onBack={() => setOpenId(null)} />

  return (
    <div className="space-y-4">
      <Err msg={error} />
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-neutral-500">A stock-take compares what you physically count with what the system believes, and corrects the difference.</p>
        <button onClick={start} disabled={busy} className="flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Plus size={14} /> Start stock-take</button>
      </div>
      <section className={card}>
        {rows.length === 0 ? <p className="py-10 text-center text-[13px] text-neutral-400">No stock-takes yet. Start one when the shelves are quiet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
            <thead><tr><th className={th}>Reference</th><th className={th}>Started</th><th className={th}>Warehouse</th><th className={th}>Counted</th><th className={th}>Difference</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} className="border-t border-neutral-100 dark:border-white/[0.05]">
                <td className="py-3 pr-3 font-mono text-[11.5px] font-semibold text-neutral-700 dark:text-neutral-200">{r.reference}</td>
                <td className="whitespace-nowrap py-3 pr-3 text-neutral-500">{fmtDateTime(r.created_at)}</td>
                <td className="py-3 pr-3 text-neutral-500">{r.warehouse_name}</td>
                <td className="py-3 pr-3 tabular-nums">{r.counted_count} / {r.item_count}</td>
                <td className={`py-3 pr-3 font-semibold tabular-nums ${num(r.variance_value) < 0 ? 'text-rose-600' : num(r.variance_value) > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}>{r.status === 'cancelled' ? '—' : `${num(r.variance_value) > 0 ? '+' : ''}${money(r.variance_value)}`}</td>
                <td className="py-3 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${STATUS_TONE[r.status]}`}>{r.status}</span></td>
                <td className="py-3 text-right"><button onClick={() => setOpenId(r.id)} className={`rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ${TONES.sky.soft}`}>{r.status === 'counting' ? 'Continue' : 'View'}</button></td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
    </div>
  )
}

function CountSheet({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<TakeDetail | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'finish' | 'cancel' | null>(null)

  const load = useCallback(async () => {
    try {
      const d: TakeDetail = (await api.get(`/inventory/stock-takes/${id}`)).data.data
      setData(d); setDraft(Object.fromEntries(d.lines.map(l => [l.item_id, l.counted_qty === null ? '' : fmtQ(l.counted_qty)])))
    } catch (e) { setError(getApiErrorMessage(e)) }
  }, [id])
  useEffect(() => { load() }, [load])

  const editable = data?.status === 'counting'
  const dirty = useMemo(() => data ? data.lines.filter(l => (draft[l.item_id] ?? '') !== (l.counted_qty === null ? '' : fmtQ(l.counted_qty))) : [], [data, draft])

  const save = async (silent = false) => {
    if (dirty.length === 0) return true
    try {
      await api.patch(`/inventory/stock-takes/${id}/counts`, { counts: dirty.map(l => ({ item_id: l.item_id, counted_qty: draft[l.item_id] === '' ? null : Number(draft[l.item_id]) })) })
      if (!silent) setMsg('Counts saved'); setTimeout(() => setMsg(''), 2500)
      await load(); return true
    } catch (e) { setError(getApiErrorMessage(e)); return false }
  }
  const finish = async () => {
    setBusy(true); setError('')
    try {
      if (!(await save(true))) return
      const r = (await api.post(`/inventory/stock-takes/${id}/complete`)).data.data
      setConfirm(null)
      setMsg(`Done — ${r.adjusted} item${r.adjusted === 1 ? '' : 's'} corrected (${r.gains} more, ${r.losses} fewer). Net value ${r.net_value >= 0 ? '+' : ''}${money(r.net_value)}.`)
      await load()
    } catch (e) { setError(getApiErrorMessage(e)); setConfirm(null) } finally { setBusy(false) }
  }
  const cancelTake = async () => {
    setBusy(true)
    try { await api.post(`/inventory/stock-takes/${id}/cancel`); onBack() }
    catch (e) { setError(getApiErrorMessage(e)); setConfirm(null) } finally { setBusy(false) }
  }

  if (!data) return <div className="flex h-40 items-center justify-center"><RefreshCw className="animate-spin text-neutral-400" size={20} /></div>
  const lines = data.lines.filter(l => (!search || `${l.name} ${l.sku} ${l.category}`.toLowerCase().includes(search.toLowerCase())) && (!onlyOpen || (draft[l.item_id] ?? '') === ''))
  const counted = data.lines.filter(l => (draft[l.item_id] ?? '') !== '').length
  const diffOf = (l: TakeLine) => (draft[l.item_id] ?? '') === '' ? null : num(draft[l.item_id]) - num(l.system_qty)
  const totalDiff = data.lines.reduce((s, l) => { const d = diffOf(l); return d === null ? s : s + d * num(l.unit_cost) }, 0)

  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={msg} />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:text-indigo-600 dark:border-white/[0.08]"><ArrowLeft size={15} /></button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-extrabold text-neutral-900 dark:text-white">{data.reference} <span className={`ml-2 rounded-full px-2.5 py-0.5 align-middle text-[11px] font-semibold capitalize ${STATUS_TONE[data.status]}`}>{data.status}</span></h2>
          <p className="text-[12px] text-neutral-500">{data.warehouse_name} · {counted} of {data.lines.length} counted · difference {totalDiff >= 0 ? '+' : ''}{money(totalDiff)}</p>
        </div>
        {editable && <>
          <button onClick={() => setConfirm('cancel')} className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold ${TONES.rose.soft}`}>Cancel count</button>
          <button onClick={() => save()} disabled={dirty.length === 0} className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3.5 py-2 text-[12.5px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-neutral-200"><Save size={14} /> Save progress</button>
          <button onClick={() => setConfirm('finish')} disabled={counted === 0} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40"><CheckCircle2 size={14} /> Finish &amp; correct stock</button>
        </>}
      </div>

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find an item…" className={`${INPUT} pl-9`} /></div>
          {editable && <label className="flex items-center gap-2 text-[12.5px] text-neutral-600 dark:text-neutral-300"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Not counted yet</label>}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
          <thead><tr><th className={th}>Item</th><th className={th}>Category</th><th className={`${th} text-right`}>System</th><th className={`${th} text-right`}>Counted</th><th className={`${th} text-right`}>Difference</th></tr></thead>
          <tbody>{lines.map(l => {
            const d = diffOf(l)
            return (
              <tr key={l.item_id} className="border-t border-neutral-100 dark:border-white/[0.05]">
                <td className="py-2 pr-3"><p className="font-semibold text-neutral-800 dark:text-white">{l.name}</p><p className="text-[11px] text-neutral-400">{l.sku}</p></td>
                <td className="py-2 pr-3 capitalize text-neutral-500">{l.category}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{fmtQ(l.system_qty)} {l.unit_of_measure}</td>
                <td className="py-2 pr-3 text-right">
                  {editable
                    ? <input type="number" min={0} step="any" inputMode="decimal" value={draft[l.item_id] ?? ''} onChange={e => setDraft(p => ({ ...p, [l.item_id]: e.target.value }))} onBlur={() => save(true)}
                        placeholder="count" className="w-28 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
                    : <span className="tabular-nums">{l.counted_qty === null ? '—' : fmtQ(l.counted_qty)}</span>}
                </td>
                <td className={`py-2 text-right font-semibold tabular-nums ${d === null || d === 0 ? 'text-neutral-300' : d < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {d === null ? '—' : d === 0 ? 'OK' : <span className="inline-flex items-center gap-1">{d < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{d > 0 ? '+' : ''}{fmtQ(d)}</span>}
                </td>
              </tr>)
          })}</tbody>
        </table></div>
      </section>

      <ConfirmModal open={confirm === 'finish'} title="Finish this stock-take?" confirmLabel="Correct the stock" danger={false} loading={busy} onClose={() => setConfirm(null)} onConfirm={finish}
        message={<>The system quantity of <b>{counted}</b> counted item{counted === 1 ? '' : 's'} will be changed to what you counted (net value <b>{totalDiff >= 0 ? '+' : ''}{money(totalDiff)}</b>). Items you left empty are not touched. This cannot be undone.</>} />
      <ConfirmModal open={confirm === 'cancel'} title="Cancel this count?" confirmLabel="Cancel count" loading={busy} onClose={() => setConfirm(null)} onConfirm={cancelTake}
        message="The numbers you typed are thrown away and stock stays as it is." />
    </div>
  )
}

// ── Waste ─────────────────────────────────────────────────────────────────────

interface WasteData {
  rows: { id: string; moved_at: string; quantity: string; cost: string; reason: string; notes: string | null; item_name: string; unit_of_measure: string; recorded_by: string | null }[]
  total_cost: number; by_reason: { reason: string; cost: number; count: number }[]; from: string; to: string; reasons: string[]
}
interface StockRow { item_id: string; name: string; unit_of_measure: string; quantity_on_hand: string }
const REASON_LABEL: Record<string, string> = { spoilage: 'Spoiled', expired: 'Expired', breakage: 'Broken', spill: 'Spilled', staff_meal: 'Staff meal', theft: 'Missing / theft', other: 'Other' }
const REASON_TONE = [TONES.rose, TONES.peach, TONES.butter, TONES.lilac, TONES.sky, TONES.mint]

function Waste() {
  const [data, setData] = useState<WasteData | null>(null)
  const [stock, setStock] = useState<StockRow[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ item_id: '', quantity: '', reason: 'spoilage', notes: '' })
  const [error, setError] = useState('')
  const [formErr, setFormErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => api.get('/inventory/waste').then(r => setData(r.data.data)).catch(e => setError(getApiErrorMessage(e))), [])
  useEffect(() => { load(); api.get('/inventory/stock').then(r => setStock(r.data.data)).catch(() => undefined) }, [load])

  const item = stock.find(s => s.item_id === form.item_id)
  const submit = async () => {
    setBusy(true); setFormErr('')
    try {
      const r = await api.post('/inventory/waste', { item_id: form.item_id, quantity: Number(form.quantity), reason: form.reason, notes: form.notes || undefined })
      setOpen(false); setForm({ item_id: '', quantity: '', reason: 'spoilage', notes: '' })
      setMsg(`Recorded: ${r.data.data.quantity} ${r.data.data.unit} of ${r.data.data.item} (${money(r.data.data.cost)} lost)`); setTimeout(() => setMsg(''), 4000)
      load(); api.get('/inventory/stock').then(x => setStock(x.data.data)).catch(() => undefined)
    } catch (e) { setFormErr(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const maxCost = Math.max(1, ...(data?.by_reason.map(b => b.cost) ?? [1]))

  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={msg} />
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-neutral-500">Everything thrown away, spoiled, broken or eaten by staff. It leaves stock and is valued at cost{data ? ` — last 30 days (${data.from} → ${data.to})` : ''}.</p>
        <button onClick={() => setOpen(true)} className="flex shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-rose-700"><Trash2 size={14} /> Record waste</button>
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className={`rounded-3xl border p-5 ${TONES.rose.card}`}>
            <p className={`text-[12.5px] font-medium opacity-80 ${TONES.rose.ink}`}>Lost to waste</p>
            <p className={`mt-1 text-[28px] font-extrabold ${TONES.rose.ink}`}>{money(data.total_cost)}</p>
            <p className={`text-[11.5px] opacity-70 ${TONES.rose.ink}`}>{data.rows.length} entr{data.rows.length === 1 ? 'y' : 'ies'}</p>
          </div>
          <div className={`${card} md:col-span-2`}>
            <p className="mb-3 text-[13px] font-bold text-neutral-800 dark:text-white">By reason</p>
            {data.by_reason.length === 0 ? <p className="text-[13px] text-neutral-400">Nothing recorded — good.</p> : data.by_reason.map((b, i) => (
              <div key={b.reason} className="mb-2 flex items-center gap-3">
                <span className="w-28 shrink-0 text-[12px] text-neutral-600 dark:text-neutral-300">{REASON_LABEL[b.reason] ?? b.reason}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${(b.cost / maxCost) * 100}%`, background: REASON_TONE[i % REASON_TONE.length].bar }} /></div>
                <span className="w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums">{money(b.cost)}</span>
              </div>))}
          </div>
        </div>)}

      <section className={card}>
        {!data || data.rows.length === 0 ? <p className="py-8 text-center text-[13px] text-neutral-400">No waste recorded in this period.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
            <thead><tr><th className={th}>When</th><th className={th}>Item</th><th className={`${th} text-right`}>Quantity</th><th className={th}>Reason</th><th className={`${th} text-right`}>Cost</th><th className={th}>By</th><th className={th}>Note</th></tr></thead>
            <tbody>{data.rows.map(r => (
              <tr key={r.id} className="border-t border-neutral-100 dark:border-white/[0.05]">
                <td className="whitespace-nowrap py-2.5 pr-3 text-neutral-500">{fmtDateTime(r.moved_at)}</td>
                <td className="py-2.5 pr-3 font-semibold text-neutral-800 dark:text-white">{r.item_name}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{fmtQ(r.quantity)} {r.unit_of_measure}</td>
                <td className="py-2.5 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES.rose.soft}`}>{REASON_LABEL[r.reason] ?? r.reason}</span></td>
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-rose-600">{money(r.cost)}</td>
                <td className="py-2.5 pr-3 text-neutral-500">{r.recorded_by ?? '—'}</td>
                <td className="py-2.5 text-neutral-400">{r.notes ?? ''}</td>
              </tr>))}</tbody>
          </table></div>)}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Record waste" footer={<>
        <CancelBtn onClick={() => setOpen(false)} />
        <button onClick={submit} disabled={busy || !form.item_id || !(Number(form.quantity) > 0)} className="rounded-xl bg-rose-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40">{busy ? 'Saving…' : 'Write off'}</button></>}>
        <div className="space-y-4">
          {formErr && <Err msg={formErr} />}
          <Field label="Item"><Select value={form.item_id} onChange={v => setForm(f => ({ ...f, item_id: v }))} placeholder="Choose an item…"
            options={stock.map(s => ({ value: s.item_id, label: `${s.name} — ${fmtQ(s.quantity_on_hand)} ${s.unit_of_measure} in stock` }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Quantity${item ? ` (${item.unit_of_measure})` : ''}`}><input type="number" min={0} step="any" inputMode="decimal" className={INPUT} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></Field>
            <Field label="Reason"><Select value={form.reason} onChange={v => setForm(f => ({ ...f, reason: v }))} options={(data?.reasons ?? Object.keys(REASON_LABEL)).map(r => ({ value: r, label: REASON_LABEL[r] ?? r }))} /></Field>
          </div>
          <Field label="Note (optional)"><input className={INPUT} maxLength={300} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. fridge was off overnight" /></Field>
        </div>
      </Modal>
    </div>
  )
}

// ── Recipe costing ────────────────────────────────────────────────────────────

interface Dish {
  id: string; name: string; category: string; price: number; saved_cost: number; has_recipe: boolean; complete: boolean
  recipe_cost: number | null; margin: number | null; food_cost_pct: number | null
  ingredients: { item_id: string; name: string; quantity: number; unit: string; stock_unit: string; cost: number | null; problem: string | null }[]
}
interface Costing { dishes: Dish[]; summary: { dishes: number; costed: number; no_recipe: number; incomplete: number; avg_food_cost_pct: number | null; low_margin: number } }
const PROBLEM: Record<string, string> = { unit_mismatch: 'unit cannot be compared with the stock unit', no_cost: 'no purchase cost yet' }

function Costing() {
  const [data, setData] = useState<Costing | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'costed' | 'attention'>('all')
  const load = useCallback(() => api.get('/inventory/costing').then(r => setData(r.data.data)).catch(e => setError(getApiErrorMessage(e))), [])
  useEffect(() => { load() }, [load])

  const apply = async () => {
    setBusy(true); setError('')
    try { const r = await api.post('/inventory/costing/apply', {}); setMsg(`Updated the saved cost of ${r.data.data.updated} dish${r.data.data.updated === 1 ? '' : 'es'}.`); setTimeout(() => setMsg(''), 4000); load() }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }
  const tone = (p: number | null) => p === null ? TONES.sky : p > 40 ? TONES.rose : p > 30 ? TONES.butter : TONES.mint
  const dishes = (data?.dishes ?? []).filter(d => filter === 'all' ? true : filter === 'costed' ? d.recipe_cost !== null : d.recipe_cost === null || (d.food_cost_pct ?? 0) > 40)
  const s = data?.summary

  return (
    <div className="space-y-4">
      <Err msg={error} /><Ok msg={msg} />
      {s && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { t: TONES.mint, l: 'Dishes costed', v: `${s.costed} / ${s.dishes}`, sub: 'with a complete recipe' },
            { t: tone(s.avg_food_cost_pct), l: 'Average food cost', v: s.avg_food_cost_pct === null ? '—' : `${s.avg_food_cost_pct}%`, sub: 'of the selling price (aim for under 30–35%)' },
            { t: TONES.rose, l: 'Low margin', v: String(s.low_margin), sub: 'dishes above 40% food cost' },
            { t: TONES.butter, l: 'Need attention', v: String(s.no_recipe + s.incomplete), sub: `${s.no_recipe} without recipe · ${s.incomplete} incomplete` },
          ].map(c => (
            <div key={c.l} className={`rounded-3xl border p-5 ${c.t.card}`}>
              <p className={`text-[12.5px] font-medium opacity-80 ${c.t.ink}`}>{c.l}</p>
              <p className={`mt-1 text-[26px] font-extrabold leading-tight ${c.t.ink}`}>{c.v}</p>
              <p className={`mt-0.5 text-[11.5px] opacity-70 ${c.t.ink}`}>{c.sub}</p>
            </div>))}
        </div>)}

      <div className="flex flex-wrap items-center gap-3">
        {([['all', 'All dishes'], ['costed', 'Costed'], ['attention', 'Needs attention']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${filter === k ? 'bg-indigo-600 text-white' : 'border border-neutral-200 bg-white text-neutral-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300'}`}>{l}</button>))}
        <div className="flex-1" />
        <button onClick={apply} disabled={busy || !s?.costed} title="Save each calculated cost on its menu item so profit figures use it"
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40"><Save size={14} /> Save costs on menu items</button>
      </div>

      <section className={card}>
        {!data ? <div className="flex h-32 items-center justify-center"><RefreshCw className="animate-spin text-neutral-400" size={20} /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
            <thead><tr><th className={th}>Dish</th><th className={th}>Category</th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>Cost to make</th><th className={`${th} text-right`}>Profit</th><th className={th}>Food cost</th></tr></thead>
            <tbody>{dishes.map(d => (
              <Fragment key={d.id}>
                <tr onClick={() => setExpanded(e => e === d.id ? null : d.id)} className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50/60 dark:border-white/[0.05] dark:hover:bg-white/[0.03]">
                  <td className="py-2.5 pr-3 font-semibold text-neutral-800 dark:text-white"><span className="inline-flex items-center gap-1.5"><ChevronDown size={13} className={`transition ${expanded === d.id ? '' : '-rotate-90'} text-neutral-400`} />{d.name}</span></td>
                  <td className="py-2.5 pr-3 text-neutral-500">{d.category}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{money(d.price)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{d.recipe_cost === null ? <span className="text-neutral-300">—</span> : money(d.recipe_cost)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-emerald-600">{d.margin === null ? <span className="text-neutral-300">—</span> : money(d.margin)}</td>
                  <td className="py-2.5 pr-3">
                    {d.recipe_cost !== null ? <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone(d.food_cost_pct).soft}`}>{d.food_cost_pct}%</span>
                      : !d.has_recipe ? <span className="text-[11.5px] text-neutral-400">no recipe</span>
                      : <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES.butter.soft}`}><AlertTriangle size={11} /> incomplete</span>}
                  </td>
                </tr>
                {expanded === d.id && (
                  <tr key={d.id + 'x'} className="bg-neutral-50/60 dark:bg-white/[0.02]"><td colSpan={6} className="px-8 py-3">
                    {d.ingredients.length === 0 ? <p className="text-[12px] text-neutral-400">This dish has no recipe yet — add ingredients in Inventory → Items → Recipes.</p> : (
                      <ul className="space-y-1">{d.ingredients.map(i => (
                        <li key={i.item_id} className="flex items-center gap-3 text-[12px]">
                          <span className="w-48 font-medium text-neutral-700 dark:text-neutral-200">{i.name}</span>
                          <span className="w-28 text-neutral-500">{fmtQ(i.quantity)} {i.unit}</span>
                          {i.cost !== null ? <span className="font-semibold tabular-nums">{money(i.cost)}</span> : <span className="text-amber-600">⚠ {PROBLEM[i.problem ?? ''] ?? 'cannot be costed'}</span>}
                        </li>))}</ul>)}
                  </td></tr>)}
              </Fragment>))}</tbody>
          </table>
          {dishes.length === 0 && <p className="py-8 text-center text-[13px] text-neutral-400">Nothing to show.</p>}</div>)}
      </section>
    </div>
  )
}
