import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { ReportEmpty, ReportPanel } from '@/components/ui/ReportBits'
import { money } from '@utils/detailFormat'
import { TONES } from '@utils/tones'

// Reports → Finance → Sales by waiter: what each waiter / cashier collected in the period, by payment method.

interface Row { staff_id: string | null; name: string; role: string | null; collected: number; orders: number; cash: number; mobile: number; card: number; room: number }

export default function WaiterSales({ from, to, refreshKey }: { from: string; to: string; refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { const d = (await api.get(`/accounting/reports/waiters?from=${from}&to=${to}`)).data.data; setRows(d.rows); setTotal(d.total); setError('') }
    catch (e) { setError(getApiErrorMessage(e)) }
  }, [from, to])
  useEffect(() => { load() }, [load, refreshKey])
  const max = Math.max(1, ...(rows?.map(r => r.collected) ?? [1]))

  return (
    <ReportPanel title="Sales by waiter" subtitle="Restaurant money collected by each waiter / cashier — recorded automatically at the till">
      {error ? <p className="text-[13px] text-rose-600">{error}</p> : !rows ? <p className="py-6 text-center text-[13px] text-neutral-400">Loading…</p>
        : rows.length === 0 ? <ReportEmpty icon={Users} text="No restaurant payments were collected in this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
                <th className="pb-2.5 pr-3">Waiter</th><th className="pb-2.5 pr-3 text-right">Orders</th><th className="pb-2.5 pr-3 text-right">Cash</th><th className="pb-2.5 pr-3 text-right">Mobile</th>
                <th className="pb-2.5 pr-3 text-right">Card</th><th className="pb-2.5 pr-3 text-right">Room</th><th className="pb-2.5 text-right">Collected</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.staff_id ?? 'none'} className="border-t border-neutral-100 dark:border-white/[0.05]">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-neutral-800 dark:text-neutral-100">{r.name}</p>
                      <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${(r.collected / max) * 100}%`, background: TONES.mint.bar }} /></div>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{r.orders}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{money(r.cash)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{money(r.mobile)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{money(r.card)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{money(r.room)}</td>
                    <td className="py-3 text-right font-bold tabular-nums text-neutral-900 dark:text-white">{money(r.collected)}</td>
                  </tr>))}
                <tr className="border-t-2 border-neutral-200 font-bold dark:border-white/[0.1]"><td className="py-3">Total</td><td colSpan={5} /><td className="py-3 text-right tabular-nums">{money(total)}</td></tr>
              </tbody>
            </table>
          </div>)}
    </ReportPanel>
  )
}
