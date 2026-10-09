import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Landmark, PiggyBank, Printer, Receipt, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { useAuthContext } from '@/contexts/AuthContext'
import { DetailModal } from '@/components/ui/DetailModal'
import { BarRow, PanelLink, ReportEmpty, ReportKpi, ReportPanel } from '@/components/ui/ReportBits'
import { money } from '@utils/detailFormat'
import { TONES } from '@utils/tones'
import { printSections } from '@utils/printDetail'
import VatReturn from './VatReturn'
import WaiterSales from './WaiterSales'

// Finance tab: profit & loss, where money came from / went, cash position, and ageing.

interface Fin {
  period: { from: string; to: string }
  revenue: { hotel: number; restaurant: number; invoices_other: number; receipts: number; other_income: number; total: number }
  costs: { expenses: number; salaries: number; purchases: number; total: number; by_category: { name: string; total: number; count: number }[] }
  profit: number; margin_pct: number | null
  by_method: { method: string; total: number }[]
  accounts: { id: string; name: string; account_type: string; institution?: string; balance: number; money_in: number; money_out: number }[]
  cash_total: number
  receivables: { total: number; count: number; aging: { key: string; label: string; count: number; due: number }[] }
  payables:    { total: number; count: number; aging: { key: string; label: string; count: number; due: number }[] }
  daily: { date: string; earned: number; spent: number }[]
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayLabel = (iso: string, many: boolean) => { const d = new Date(iso + 'T00:00:00'); return many ? String(d.getDate()) : `${DAY[d.getDay()]} ${d.getDate()}` }
const AGE_COLORS = ['#8fd4b0', '#f2d479', '#f7b98a', '#f0a0b0']

const Tip = ({ active, payload, label }: any) => !active || !payload?.length ? null : (
  <div className="rounded-2xl border border-neutral-200/70 bg-white px-3.5 py-3 shadow-xl dark:border-white/[0.08] dark:bg-[#232b3e]">
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
    {payload.map((p: any) => (
      <div key={p.dataKey} className="flex items-center gap-2 text-[12px]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.fill }} />
        <span className="capitalize text-neutral-500 dark:text-neutral-300">{p.dataKey}</span>
        <span className="ml-auto font-semibold tabular-nums text-neutral-900 dark:text-white">{money(p.value)}</span>
      </div>
    ))}
  </div>
)

export default function FinanceReport({ from, to, refreshKey }: { from: string; to: string; refreshKey: number }) {
  const { user } = useAuthContext()
  const [d, setD] = useState<Fin | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ kind: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/accounting/reports/finance?from=${from}&to=${to}`)
      setD(r.data.data); setError('')
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load, refreshKey])

  const open = (kind: string, title: string) => setDetail({ kind, title })

  const printIt = async () => {
    if (!d) return
    const org = await api.get('/system/organization').then(r => r.data.data).catch(() => null)
    printSections(org, 'Finance Report', `${d.period.from} → ${d.period.to}`, user?.full_name ?? user?.email ?? 'User', [
      { heading: 'Profit & loss', rows: [
        ['Revenue received', money(d.revenue.total)], ['Costs paid', money(d.costs.total)],
        [d.profit >= 0 ? 'Profit' : 'Loss', money(d.profit) + (d.margin_pct != null ? ` (${d.margin_pct}% margin)` : '')] ] },
      { heading: 'Revenue', rows: [
        ['Hotel guest payments', money(d.revenue.hotel)], ['Restaurant sales', money(d.revenue.restaurant)],
        ['Other invoices', money(d.revenue.invoices_other)], ['General receipts', money(d.revenue.receipts)], ['Other income', money(d.revenue.other_income)] ] },
      { heading: 'Costs', rows: [
        ['Expenses', money(d.costs.expenses)], ['Salaries', money(d.costs.salaries)], ['Supplier payments', money(d.costs.purchases)],
        ...d.costs.by_category.slice(0, 8).map(c => [`   · ${c.name}`, money(c.total)] as [string, string]) ] },
      { heading: 'Cash, bank & mobile money', rows: [...d.accounts.map(a => [`${a.name} (${a.account_type.replace('_', ' ')})`, money(a.balance)] as [string, string]), ['Total', money(d.cash_total)]] },
      { heading: `Guests owe you — ${money(d.receivables.total)}`, rows: d.receivables.aging.map(b => [b.label, `${money(b.due)} (${b.count})`] as [string, string]) },
      { heading: `You owe suppliers — ${money(d.payables.total)}`, rows: d.payables.aging.map(b => [b.label, `${money(b.due)} (${b.count})`] as [string, string]) },
    ])
  }

  if (error) return <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>

  const rev = d?.revenue, cost = d?.costs
  const revMax = Math.max(1, ...(rev ? [rev.hotel, rev.restaurant, rev.invoices_other, rev.receipts, rev.other_income] : [1]))
  const costMax = Math.max(1, ...(cost ? [cost.expenses, cost.salaries, cost.purchases] : [1]))
  const catMax = Math.max(1, ...(cost?.by_category.map(c => c.total) ?? [1]))
  const many = (d?.daily.length ?? 0) > 10
  const profitTone = (d?.profit ?? 0) >= 0 ? 'sky' : 'butter'

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={printIt} disabled={!d}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40">
          <Printer size={14} /> Print Finance Report
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpi tone="mint" icon={TrendingUp} label="Revenue received" value={loading ? '…' : money(rev?.total ?? 0)} sub="Guest payments, receipts, other income" onClick={() => open('fin_revenue', 'Revenue received')} />
        <ReportKpi tone="rose" icon={TrendingDown} label="Costs paid" value={loading ? '…' : money(cost?.total ?? 0)} sub="Expenses, salaries, suppliers" onClick={() => open('fin_profit', 'Profit & loss')} />
        <ReportKpi tone={profitTone} icon={Scale} label={(d?.profit ?? 0) >= 0 ? 'Profit' : 'Loss'} value={loading ? '…' : money(d?.profit ?? 0)}
          sub={d?.margin_pct != null ? `${d.margin_pct}% of revenue` : 'No revenue in this period'} onClick={() => open('fin_profit', 'Profit & loss')} />
        <ReportKpi tone="lilac" icon={Wallet} label="Cash, bank & mobile" value={loading ? '…' : money(d?.cash_total ?? 0)} sub={`${d?.accounts.length ?? 0} accounts`} onClick={() => open('cash_accounts', 'Cash, bank & mobile money')} />
      </div>

      <ReportPanel title="Earned vs spent" subtitle="Money in from sales and income against money paid out, per day"
        action={<PanelLink onClick={() => open('fin_profit', 'Profit & loss')}>Profit & loss</PanelLink>}>
        <div className="mb-2 flex gap-4 text-[12px] text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONES.mint.bar }} />Earned</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONES.rose.bar }} />Spent</span>
        </div>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(d?.daily ?? []).map(x => ({ ...x, label: dayLabel(x.date, many) }))} margin={{ top: 6, right: 4, left: -14, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" className="text-neutral-200/80 dark:text-white/[0.06]" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} interval={many ? 'preserveStartEnd' : 0} />
              <YAxis tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(150,160,190,0.10)', radius: 8 }} />
              <Bar dataKey="earned" fill={TONES.mint.bar} radius={[6, 6, 0, 0]} />
              <Bar dataKey="spent"  fill={TONES.rose.bar} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportPanel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ReportPanel title="Where the money came from" subtitle="Revenue by source" action={<PanelLink onClick={() => open('fin_revenue', 'Revenue received')}>Details</PanelLink>}>
          {rev && rev.total === 0 ? <ReportEmpty icon={PiggyBank} text="No revenue was received in this period" /> : (
            <div className="space-y-0.5">
              <BarRow label="Hotel guest payments" value={rev?.hotel ?? 0} display={money(rev?.hotel ?? 0)} max={revMax} color={TONES.sky.bar} onClick={() => open('fin_revenue', 'Revenue received')} />
              <BarRow label="Restaurant sales" value={rev?.restaurant ?? 0} display={money(rev?.restaurant ?? 0)} max={revMax} color={TONES.peach.bar} onClick={() => open('fin_revenue', 'Revenue received')} />
              <BarRow label="Other invoices" value={rev?.invoices_other ?? 0} display={money(rev?.invoices_other ?? 0)} max={revMax} color={TONES.lilac.bar} onClick={() => open('fin_revenue', 'Revenue received')} />
              <BarRow label="General receipts" value={rev?.receipts ?? 0} display={money(rev?.receipts ?? 0)} max={revMax} color={TONES.mint.bar} onClick={() => open('fin_revenue', 'Revenue received')} />
              <BarRow label="Other income" value={rev?.other_income ?? 0} display={money(rev?.other_income ?? 0)} max={revMax} color={TONES.butter.bar} onClick={() => open('fin_revenue', 'Revenue received')} />
            </div>
          )}
          {(d?.by_method.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3 dark:border-white/[0.06]">
              {d!.by_method.map(m => (
                <span key={m.method} className={`rounded-full px-3 py-1 text-[11.5px] font-semibold capitalize ${TONES.lilac.soft}`}>{m.method.replace(/_/g, ' ')} · {money(m.total)}</span>
              ))}
            </div>
          )}
        </ReportPanel>

        <ReportPanel title="Where the money went" subtitle="Costs paid in the period" action={<PanelLink onClick={() => open('fin_expenses', 'Expenses paid')}>Expenses</PanelLink>}>
          {cost && cost.total === 0 ? <ReportEmpty icon={Receipt} text="No costs were paid in this period" /> : (
            <>
              <div className="space-y-0.5">
                <BarRow label="Expenses" value={cost?.expenses ?? 0} display={money(cost?.expenses ?? 0)} max={costMax} color={TONES.rose.bar} onClick={() => open('fin_expenses', 'Expenses paid')} />
                <BarRow label="Salaries" value={cost?.salaries ?? 0} display={money(cost?.salaries ?? 0)} max={costMax} color={TONES.butter.bar} onClick={() => open('fin_salaries', 'Salaries paid')} />
                <BarRow label="Supplier payments" value={cost?.purchases ?? 0} display={money(cost?.purchases ?? 0)} max={costMax} color={TONES.peach.bar} onClick={() => open('fin_purchases', 'Supplier payments')} />
              </div>
              {(cost?.by_category.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-white/[0.06]">
                  <p className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">Top expense categories</p>
                  {cost!.by_category.slice(0, 5).map(c => (
                    <BarRow key={c.name} label={c.name} sub={`${c.count}×`} value={c.total} display={money(c.total)} max={catMax} color={TONES.rose.bar} onClick={() => open('fin_expenses', 'Expenses paid')} />
                  ))}
                </div>
              )}
            </>
          )}
        </ReportPanel>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {([
          ['Guests owe you', d?.receivables, 'ar_aging', 'Guests owe you', 'Unpaid invoices by age'],
          ['You owe suppliers', d?.payables, 'ap_aging', 'You owe suppliers', 'Unpaid supplier bills by age'],
        ] as const).map(([title, data, kind, modalTitle, subtitle]) => {
          const max = Math.max(1, ...(data?.aging.map(b => b.due) ?? [1]))
          return (
            <ReportPanel key={kind} title={title} subtitle={`${subtitle} · as of today`} action={<PanelLink onClick={() => open(kind, modalTitle)}>Details</PanelLink>}>
              <p className="mb-2 px-2.5 text-[26px] font-bold tabular-nums text-neutral-900 dark:text-white">{money(data?.total ?? 0)}
                <span className="ml-2 text-[12px] font-medium text-neutral-400">{data?.count ?? 0} open</span></p>
              {(data?.count ?? 0) === 0 ? <ReportEmpty icon={Landmark} text="Nothing outstanding" /> : (
                <div className="space-y-0.5">
                  {data!.aging.map((b, i) => (
                    <BarRow key={b.key} label={b.label} sub={`${b.count}`} value={b.due} display={money(b.due)} max={max} color={AGE_COLORS[i]} onClick={() => open(kind, modalTitle)} />
                  ))}
                </div>
              )}
            </ReportPanel>
          )
        })}
      </div>

      <ReportPanel title="Cash, bank & mobile money" subtitle="Balance now, and movement in the period"
        action={<PanelLink onClick={() => open('cash_accounts', 'Cash, bank & mobile money')}>Details</PanelLink>}>
        {(d?.accounts.length ?? 0) === 0 ? <ReportEmpty icon={Wallet} text="No cash, bank or mobile-money accounts yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
                  <th className="pb-2.5 pr-3">Account</th><th className="pb-2.5 pr-3">Type</th>
                  <th className="pb-2.5 pr-3 text-right">In</th><th className="pb-2.5 pr-3 text-right">Out</th><th className="pb-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {d!.accounts.map(a => (
                  <tr key={a.id} onClick={() => open('cash_accounts', 'Cash, bank & mobile money')}
                    className="cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50/80 dark:border-white/[0.05] dark:hover:bg-white/[0.03]">
                    <td className="py-3 pr-3 font-semibold text-neutral-800 dark:text-neutral-100">{a.name}{a.institution && <span className="ml-1.5 font-normal text-neutral-400">{a.institution}</span>}</td>
                    <td className="py-3 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${TONES.sky.soft}`}>{a.account_type.replace('_', ' ')}</span></td>
                    <td className="py-3 pr-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money(a.money_in)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums text-rose-500 dark:text-rose-400">{money(a.money_out)}</td>
                    <td className="py-3 text-right font-bold tabular-nums text-neutral-900 dark:text-white">{money(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportPanel>

      <WaiterSales from={from} to={to} refreshKey={refreshKey} />

      <VatReturn from={from} to={to} refreshKey={refreshKey} open={open} />

      <DetailModal open={!!detail} onClose={() => setDetail(null)}
        url={detail ? `/accounting/reports/detail/${detail.kind}?from=${from}&to=${to}` : null} title={detail?.title ?? ''} />
    </div>
  )
}
