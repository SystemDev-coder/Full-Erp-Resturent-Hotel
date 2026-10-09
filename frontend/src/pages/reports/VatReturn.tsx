import { useCallback, useEffect, useState } from 'react'
import { BedDouble, FileText, Printer, Receipt, UtensilsCrossed } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { useAuthContext } from '@/contexts/AuthContext'
import { ReportEmpty, ReportKpi, ReportPanel } from '@/components/ui/ReportBits'
import { money } from '@utils/detailFormat'
import { TONES } from '@utils/tones'
import { printSections } from '@utils/printDetail'

// Reports → Finance → VAT return: the VAT you charged in the period (from the system's own invoices and stays),
// less the VAT you paid to suppliers (typed in here), = what is due to the tax office.

interface Vat {
  period: { from: string; to: string }
  company: { name: string; tax_id: string | null; vat_rate: number }
  output: { restaurant: Src; hotel: Src; other: Src; total: { base: number; vat: number } }
  by_rate: { rate: number; base: number; vat: number }[]
  in_house_pending: { vat: number; count: number }
}
interface Src { base: number; vat: number; count: number }

export default function VatReturn({ from, to, refreshKey, open }: { from: string; to: string; refreshKey: number; open: (kind: string, title: string) => void }) {
  const { user } = useAuthContext()
  const [d, setD] = useState<Vat | null>(null)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')       // VAT paid to suppliers — typed in, not stored

  const load = useCallback(async () => {
    try { setD((await api.get(`/accounting/reports/vat?from=${from}&to=${to}`)).data.data); setError('') }
    catch (e) { setError(getApiErrorMessage(e)) }
  }, [from, to])
  useEffect(() => { load() }, [load, refreshKey])

  const inputVat = Math.max(0, Number(input) || 0)
  const out = d?.output.total.vat ?? 0
  const net = Math.round((out - inputVat) * 100) / 100

  const printIt = async () => {
    if (!d) return
    const org = await api.get('/system/organization').then(r => r.data.data).catch(() => null)
    printSections(org, 'VAT Return', `${d.period.from} → ${d.period.to}${d.company.tax_id ? ` · Tax ID ${d.company.tax_id}` : ''}`, user?.full_name ?? user?.email ?? 'User', [
      { heading: 'VAT charged (output VAT)', rows: [
        [`Restaurant sales — ${d.output.restaurant.count} invoice(s), sales ${money(d.output.restaurant.base)}`, money(d.output.restaurant.vat)],
        [`Hotel stays checked out — ${d.output.hotel.count}, charges ${money(d.output.hotel.base)}`, money(d.output.hotel.vat)],
        ...(d.output.other.count ? [[`Other invoices — ${d.output.other.count}, amount ${money(d.output.other.base)}`, money(d.output.other.vat)] as [string, string]] : []),
        ['Total taxable sales (before VAT)', money(d.output.total.base)], ['Total VAT charged', money(d.output.total.vat)] ] },
      ...(d.by_rate.length > 1 ? [{ heading: 'By VAT rate', rows: d.by_rate.map(r => [`${r.rate}% on ${money(r.base)}`, money(r.vat)] as [string, string]) }] : []),
      { heading: 'VAT payable', rows: [
        ['VAT charged', money(out)], ['Less: VAT paid to suppliers (input VAT)', money(inputVat)],
        [net >= 0 ? 'VAT payable to the tax office' : 'VAT refundable / carried forward', money(Math.abs(net))] ] },
    ])
  }

  const cards: { key: string; kind: string; title: string; label: string; src?: Src; icon: typeof Receipt; tone: 'peach' | 'sky' | 'lilac'; sub: (s: Src) => string }[] = [
    { key: 'restaurant', kind: 'vat_restaurant', title: 'VAT charged — restaurant', label: 'Restaurant VAT', src: d?.output.restaurant, icon: UtensilsCrossed, tone: 'peach', sub: s => `${s.count} invoice${s.count === 1 ? '' : 's'} · sales ${money(s.base)}` },
    { key: 'hotel', kind: 'vat_hotel', title: 'VAT charged — hotel', label: 'Hotel VAT', src: d?.output.hotel, icon: BedDouble, tone: 'sky', sub: s => `${s.count} stay${s.count === 1 ? '' : 's'} checked out · ${money(s.base)}` },
    { key: 'other', kind: 'vat_other', title: 'VAT charged — other invoices', label: 'Other invoices VAT', src: d?.output.other, icon: FileText, tone: 'lilac', sub: s => `${s.count} invoice${s.count === 1 ? '' : 's'}` },
  ]

  return (
    <ReportPanel title="VAT return" subtitle="VAT you charged in the period, and what is left to pay"
      action={<button onClick={printIt} disabled={!d} className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 dark:bg-indigo-500/15 dark:text-indigo-300"><Printer size={13} /> Print VAT return</button>}>
      {error ? <p className="text-[13px] text-rose-600">{error}</p> : !d ? <p className="py-6 text-center text-[13px] text-neutral-400">Loading…</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {cards.map(c => (
              <ReportKpi key={c.key} tone={c.tone} icon={c.icon} label={c.label} value={money(c.src?.vat ?? 0)} sub={c.sub(c.src ?? { base: 0, vat: 0, count: 0 })} onClick={() => open(c.kind, c.title)} />
            ))}
          </div>

          {d.output.total.base === 0 && d.output.total.vat === 0
            ? <ReportEmpty icon={Receipt} text="No VAT was charged in this period" />
            : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-neutral-100 p-4 dark:border-white/[0.06]">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">By rate</p>
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-neutral-400"><th className="pb-1.5">Rate</th><th className="pb-1.5 text-right">Taxable sales</th><th className="pb-1.5 text-right">VAT</th></tr></thead>
                    <tbody>{d.by_rate.map(r => (
                      <tr key={r.rate} className="border-t border-neutral-100 dark:border-white/[0.05]">
                        <td className="py-2 font-semibold">{r.rate}%</td><td className="py-2 text-right tabular-nums">{money(r.base)}</td><td className="py-2 text-right font-semibold tabular-nums">{money(r.vat)}</td>
                      </tr>))}
                      <tr className="border-t-2 border-neutral-200 font-bold dark:border-white/[0.1]"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{money(d.output.total.base)}</td><td className="py-2 text-right tabular-nums">{money(d.output.total.vat)}</td></tr>
                    </tbody>
                  </table>
                  {d.in_house_pending.count > 0 && <p className={`mt-3 rounded-xl px-3 py-2 text-[11.5px] ${TONES.butter.soft}`}>{d.in_house_pending.count} guest{d.in_house_pending.count === 1 ? ' is' : 's are'} still in the hotel — their VAT ({money(d.in_house_pending.vat)}) falls due when they check out.</p>}
                </div>

                <div className={`rounded-2xl border p-4 ${net >= 0 ? TONES.sky.card : TONES.mint.card}`}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">Working it out</p>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between"><span>VAT charged</span><b className="tabular-nums">{money(out)}</b></div>
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="input-vat">Less: VAT you paid to suppliers</label>
                      <span className="flex items-center gap-1"><span className="opacity-60">$</span>
                        <input id="input-vat" type="number" min={0} step="0.01" inputMode="decimal" value={input} onChange={e => setInput(e.target.value)} placeholder="0.00"
                          className="w-28 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-right text-[13px] font-semibold outline-none focus:border-indigo-400 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white" /></span>
                    </div>
                    <div className="flex justify-between border-t border-current/20 pt-2 text-[15px]"><span className="font-bold">{net >= 0 ? 'VAT payable' : 'Refundable / carry forward'}</span><b className="tabular-nums">{money(Math.abs(net))}</b></div>
                  </div>
                  <p className="mt-3 text-[11px] opacity-70">Supplier VAT is not recorded bill-by-bill in the system, so type the total from your supplier invoices. It is only used on this page and in the printout.</p>
                </div>
              </div>)}
        </div>)}
    </ReportPanel>
  )
}
