import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Package, UploadCloud, UtensilsCrossed, Users, X } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { TONES } from '@utils/tones'

// Systems → Import: bring guests, menu items and opening stock in from Excel / CSV.
// The file is read here in the browser, checked row by row on the server (nothing is saved until you confirm).

type Kind = 'guests' | 'menu' | 'stock'
interface RowResult { row: number; status: 'ok' | 'duplicate' | 'error'; message: string }
interface Outcome { committed: boolean; summary: { total: number; ok: number; duplicate: number; error: number }; results: RowResult[] }

interface KindDef {
  title: string; blurb: string; icon: JSX.Element; tone: typeof TONES.mint
  columns: string[]; required: string[]; sample: Record<string, string | number>[]
  aliases: Record<string, string[]>; note: string
}
const KINDS: Record<Kind, KindDef> = {
  guests: {
    title: 'Guests', blurb: 'Your existing guest list', icon: <Users size={20} />, tone: TONES.sky,
    columns: ['first_name', 'last_name', 'phone', 'email', 'nationality', 'id_type', 'id_number', 'gender', 'address', 'notes'],
    required: ['first_name', 'phone or email'],
    sample: [{ first_name: 'Amina', last_name: 'Hassan', phone: '0615123456', email: 'amina@example.com', nationality: 'Somali', id_type: 'national_id', id_number: 'N-12345', gender: 'F', address: 'Mogadishu', notes: 'Prefers a quiet room' }],
    aliases: { first_name: ['first name', 'firstname', 'given name', 'magaca koowaad'], last_name: ['last name', 'lastname', 'surname', 'family name'], phone: ['mobile', 'tel', 'telephone', 'phone number', 'taleefan'], email: ['e-mail', 'email address'], id_type: ['id type', 'document type'], id_number: ['id number', 'document number', 'passport'] },
    note: 'A guest whose phone or email already exists is skipped, so importing the same file twice is safe.',
  },
  menu: {
    title: 'Menu items', blurb: 'Dishes and drinks with prices', icon: <UtensilsCrossed size={20} />, tone: TONES.peach,
    columns: ['category', 'name', 'price', 'cost_price', 'item_type', 'description', 'prep_minutes', 'halal', 'vegetarian'],
    required: ['category', 'name', 'price'],
    sample: [{ category: 'Main dishes', name: 'Chicken biryani', price: 8.5, cost_price: 3.2, item_type: 'food', description: 'Rice with spiced chicken', prep_minutes: 20, halal: 'yes', vegetarian: 'no' },
             { category: 'Drinks', name: 'Fresh mango juice', price: 3, cost_price: 0.9, item_type: 'beverage', description: '', prep_minutes: 5, halal: 'yes', vegetarian: 'yes' }],
    aliases: { name: ['item', 'dish', 'item name', 'product'], category: ['group', 'section', 'type'], price: ['selling price', 'sale price', 'unit price'], cost_price: ['cost', 'cost price'], item_type: ['item type', 'kind'], prep_minutes: ['prep time', 'prep', 'minutes'] },
    note: 'New categories are created automatically. A dish with the same name in the same category is skipped.',
  },
  stock: {
    title: 'Opening stock', blurb: 'What is on the shelves today', icon: <Package size={20} />, tone: TONES.mint,
    columns: ['sku', 'name', 'category', 'unit', 'quantity', 'unit_cost', 'reorder_level'],
    required: ['sku', 'name', 'quantity'],
    sample: [{ sku: 'RICE-BASMATI', name: 'Basmati rice', category: 'dry goods', unit: 'kg', quantity: 50, unit_cost: 1.2, reorder_level: 10 },
             { sku: 'OIL-SUN', name: 'Sunflower oil', category: 'dry goods', unit: 'litre', quantity: 20, unit_cost: 3.5, reorder_level: 5 }],
    aliases: { sku: ['code', 'item code', 'product code'], name: ['item', 'item name', 'description'], unit: ['uom', 'unit of measure', 'units'], quantity: ['qty', 'opening stock', 'stock', 'on hand'], unit_cost: ['cost', 'unit price', 'price', 'cost price'], reorder_level: ['reorder', 'min stock', 'minimum'] },
    note: 'Units: kg, g, litre, ml, piece, box, bag, can, bottle, pack. Items that already have stock are left alone — correct those with Stock Control → Stock-take.',
  },
}
const BADGE = { ok: TONES.mint.soft, duplicate: TONES.butter.soft, error: TONES.rose.soft }
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function ImportPanel() {
  const [kind, setKind] = useState<Kind>('guests')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [unknown, setUnknown] = useState<string[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [done, setDone] = useState<Outcome | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const def = KINDS[kind]

  const reset = () => { setFileName(''); setRows([]); setUnknown([]); setOutcome(null); setDone(null); setError(''); if (input.current) input.current.value = '' }
  const pick = (k: Kind) => { setKind(k); reset() }

  const template = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(def.sample, { header: def.columns })
    ws['!cols'] = def.columns.map(c => ({ wch: Math.max(14, c.length + 2) }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, def.title)
    XLSX.writeFile(wb, `import-${kind}-template.xlsx`)
  }

  const onFile = async (f: File | undefined) => {
    reset(); if (!f) return
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
      if (raw.length === 0) throw new Error('That file has no rows under the header line.')
      // map the file's column titles onto ours (case-insensitive, with common alternative names)
      const lookup = new Map<string, string>()
      for (const c of def.columns) lookup.set(norm(c), c)
      for (const [c, list] of Object.entries(def.aliases)) list.forEach(a => lookup.set(norm(a), c))
      const unk = new Set<string>()
      const mapped = raw.map(r => {
        const o: Record<string, unknown> = {}
        for (const [h, v] of Object.entries(r)) { const t = lookup.get(norm(h)); if (t) o[t] = v; else if (String(v).trim() !== '') unk.add(h) }
        return o
      })
      setUnknown([...unk]); setRows(mapped); setFileName(f.name)
      const r = await api.post(`/system/import/${kind}`, { rows: mapped, dry_run: true })
      setOutcome(r.data.data)
    } catch (e) { setError(e instanceof Error && !('response' in e) ? e.message : getApiErrorMessage(e)); setRows([]) }
    finally { setBusy(false) }
  }

  const commit = async () => {
    setBusy(true); setError('')
    try { const r = await api.post(`/system/import/${kind}`, { rows }); setDone(r.data.data); setOutcome(null) }
    catch (e) { setError(getApiErrorMessage(e)) } finally { setBusy(false) }
  }

  const shown = (outcome ?? done)?.results.filter(r => !onlyProblems || r.status !== 'ok') ?? []

  return (
    <div className="space-y-5">
      {error && <p className="flex items-start gap-2 rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(KINDS) as Kind[]).map(k => {
          const d = KINDS[k], on = k === kind
          return (
            <button key={k} onClick={() => pick(k)} className={`flex items-start gap-3 rounded-3xl border p-5 text-left transition ${d.tone.card} ${on ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : 'opacity-80 hover:opacity-100'}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${d.tone.chip}`}>{d.icon}</span>
              <span><span className={`block text-[15px] font-bold ${d.tone.ink}`}>{d.title}</span><span className={`block text-[12.5px] opacity-80 ${d.tone.ink}`}>{d.blurb}</span></span>
            </button>)
        })}
      </div>

      <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Step 1</p>
            <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Get the template</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">Fill the sheet, one {kind === 'guests' ? 'guest' : kind === 'menu' ? 'dish' : 'item'} per row. Required: <b>{def.required.join(', ')}</b>.</p>
            <p className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-500 dark:bg-white/[0.04]">{def.columns.join(' · ')}</p>
            <p className="mt-2 text-[12px] text-neutral-400">{def.note}</p>
            <button onClick={template} className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13px] font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"><Download size={14} /> Download template (.xlsx)</button>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Step 2</p>
            <h3 className="text-[15px] font-bold text-neutral-900 dark:text-white">Choose your file</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">Excel (.xlsx, .xls) or CSV, up to 2,000 rows. Column names can differ a little (e.g. “Mobile”, “Qty”) — we match them.</p>
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-neutral-200 px-4 py-6 text-center hover:border-indigo-300 hover:bg-indigo-50/30 dark:border-white/[0.1] dark:hover:bg-indigo-500/5">
              <UploadCloud size={22} className="text-indigo-500" />
              <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{fileName || 'Click to pick a file'}</span>
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      </section>

      {busy && !outcome && !done && <p className="text-center text-[13px] text-neutral-400">Checking your file…</p>}

      {(outcome || done) && (() => {
        const o = (outcome ?? done)!
        return (
          <section className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
            {done ? (
              <div className={`mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 ${TONES.mint.soft}`}>
                <CheckCircle2 size={20} /><p className="text-[14px] font-bold">Imported {done.summary.ok} {def.title.toLowerCase()}. {done.summary.duplicate + done.summary.error > 0 ? `${done.summary.duplicate + done.summary.error} row(s) were skipped (see below).` : 'Nothing was skipped.'}</p>
                <button onClick={reset} className="ml-auto rounded-lg bg-white/60 px-3 py-1 text-[12px] font-semibold dark:bg-white/10">Import another file</button>
              </div>
            ) : (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Step 3 · Review</p>
                <div className="flex-1" />
                <button onClick={reset} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3.5 py-2 text-[12.5px] font-semibold text-neutral-600 dark:border-white/[0.08] dark:text-neutral-300"><X size={13} /> Start over</button>
                <button onClick={commit} disabled={busy || o.summary.ok === 0} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40"><FileSpreadsheet size={14} /> {busy ? 'Importing…' : `Import ${o.summary.ok} ${o.summary.ok === 1 ? 'row' : 'rows'}`}</button>
              </div>)}

            <div className="mb-4 grid grid-cols-3 gap-3">
              {([['ok', 'Ready to import', TONES.mint], ['duplicate', 'Already exist (skipped)', TONES.butter], ['error', 'Problems (skipped)', TONES.rose]] as const).map(([k, l, t]) => (
                <div key={k} className={`rounded-2xl border p-3.5 ${t.card}`}><p className={`text-[22px] font-extrabold ${t.ink}`}>{o.summary[k]}</p><p className={`text-[11.5px] opacity-80 ${t.ink}`}>{l}</p></div>))}
            </div>
            {unknown.length > 0 && <p className={`mb-3 rounded-xl px-3 py-2 text-[12px] ${TONES.butter.soft}`}>These columns were not recognised and are ignored: <b>{unknown.join(', ')}</b></p>}
            <label className="mb-2 flex items-center gap-2 text-[12.5px] text-neutral-600 dark:text-neutral-300"><input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Show only rows with a problem</label>
            <div className="max-h-[420px] overflow-auto rounded-2xl border border-neutral-100 dark:border-white/[0.06]">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-neutral-50 dark:bg-[#1f2638]"><tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400"><th className="px-3 py-2">Row</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Details</th></tr></thead>
                <tbody>{shown.slice(0, 500).map(r => (
                  <tr key={r.row} className="border-t border-neutral-100 dark:border-white/[0.05]">
                    <td className="px-3 py-2 tabular-nums text-neutral-400">{r.row}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BADGE[r.status]}`}>{r.status === 'ok' ? (done ? 'Imported' : 'OK') : r.status === 'duplicate' ? 'Skipped' : 'Problem'}</span></td>
                    <td className="px-3 py-2 text-neutral-700 dark:text-neutral-200">{r.message}</td>
                  </tr>))}</tbody>
              </table>
              {shown.length === 0 && <p className="py-6 text-center text-[13px] text-neutral-400">No rows to show.</p>}
              {shown.length > 500 && <p className="py-2 text-center text-[11.5px] text-neutral-400">Showing the first 500 of {shown.length} rows.</p>}
            </div>
          </section>)
      })()}
    </div>
  )
}
