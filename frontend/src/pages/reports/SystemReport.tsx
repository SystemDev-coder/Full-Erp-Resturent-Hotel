import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, FileText, KeyRound, Lock, Printer, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { useAuthContext } from '@/contexts/AuthContext'
import { DetailModal } from '@/components/ui/DetailModal'
import { BarRow, PanelLink, ReportEmpty, ReportKpi, ReportPanel } from '@/components/ui/ReportBits'
import { fmtDateTime } from '@utils/detailFormat'
import { TONES } from '@utils/tones'
import { printSections } from '@utils/printDetail'
import { ROLE_LABELS } from '@/types/auth'

// System tab: accounts, sign-ins, failed attempts / lockouts, what people did, what was printed.

interface Sys {
  period: { from: string; to: string }
  users: { total: number; active: number; inactive: number; locked: number; never_signed_in: number }
  roles: { role: string; count: number }[]
  logins: { success: number; failed: number; distinct_users: number }
  failed_reasons: { reason: string; count: number }[]
  top_actions: { action: string; count: number }[]
  top_users: { name: string; email: string; count: number }[]
  prints: { action: string; count: number }[]
  usage: { bookings: number; orders: number; invoices: number; transactions: number; guests: number }
  security_events: { action: string; created_at: string; user_name?: string; ip?: string; detail?: string }[]
  modules: { key: string; enabled: boolean }[]
  series: { date: string; success: number; failed: number }[]
}

const REASON: Record<string, string> = {
  wrong_password: 'Wrong password', user_not_found: 'Unknown email', inactive: 'Account inactive',
  manually_locked: 'Locked by admin', auto_locked: 'Auto-locked', wrong_pos_pin: 'Wrong POS PIN', pos_pin_locked: 'POS PIN locked',
}
const nice = (s: string) => s.toLowerCase().replace(/_/g, ' ')
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayLabel = (iso: string, many: boolean) => { const d = new Date(iso + 'T00:00:00'); return many ? String(d.getDate()) : `${DAY[d.getDay()]} ${d.getDate()}` }

const Tip = ({ active, payload, label }: any) => !active || !payload?.length ? null : (
  <div className="rounded-2xl border border-neutral-200/70 bg-white px-3.5 py-3 shadow-xl dark:border-white/[0.08] dark:bg-[#232b3e]">
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
    {payload.map((p: any) => (
      <div key={p.dataKey} className="flex items-center gap-2 text-[12px]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.fill }} />
        <span className="capitalize text-neutral-500 dark:text-neutral-300">{p.dataKey === 'success' ? 'sign-ins' : 'failed'}</span>
        <span className="ml-auto font-semibold tabular-nums text-neutral-900 dark:text-white">{p.value}</span>
      </div>
    ))}
  </div>
)

export default function SystemReport({ from, to, refreshKey }: { from: string; to: string; refreshKey: number }) {
  const { user } = useAuthContext()
  const [d, setD] = useState<Sys | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ kind: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/system/reports/summary?from=${from}&to=${to}`)
      setD(r.data.data); setError('')
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load, refreshKey])

  const open = (kind: string, title: string) => setDetail({ kind, title })

  const printIt = async () => {
    if (!d) return
    const org = await api.get('/system/organization').then(r => r.data.data).catch(() => null)
    printSections(org, 'System Report', `${d.period.from} → ${d.period.to}`, user?.full_name ?? user?.email ?? 'User', [
      { heading: 'Accounts', rows: [['Total', String(d.users.total)], ['Active', String(d.users.active)], ['Inactive', String(d.users.inactive)],
        ['Locked now', String(d.users.locked)], ['Never signed in', String(d.users.never_signed_in)]] },
      { heading: 'Roles', rows: d.roles.map(r => [ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role, String(r.count)] as [string, string]) },
      { heading: 'Sign-ins', rows: [['Successful', String(d.logins.success)], ['People who signed in', String(d.logins.distinct_users)], ['Failed attempts', String(d.logins.failed)],
        ...d.failed_reasons.map(f => [`   · ${REASON[f.reason] ?? nice(f.reason)}`, String(f.count)] as [string, string])] },
      { heading: 'Activity recorded', rows: d.top_actions.map(a => [nice(a.action), String(a.count)] as [string, string]) },
      { heading: 'Work recorded in the period', rows: [['Bookings', String(d.usage.bookings)], ['Restaurant orders', String(d.usage.orders)], ['Invoices', String(d.usage.invoices)],
        ['Ledger transactions', String(d.usage.transactions)], ['New guests', String(d.usage.guests)]] },
      { heading: 'Printed documents', rows: d.prints.length ? d.prints.map(p => [nice(p.action), String(p.count)] as [string, string]) : [['Nothing printed', '0']] },
      { heading: 'Modules', rows: d.modules.map(m => [m.key, m.enabled ? 'On' : 'OFF'] as [string, string]) },
    ])
  }

  if (error) return <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>

  const many = (d?.series.length ?? 0) > 10
  const roleMax = Math.max(1, ...(d?.roles.map(r => r.count) ?? [1]))
  const actMax = Math.max(1, ...(d?.top_actions.map(a => a.count) ?? [1]))
  const reasonMax = Math.max(1, ...(d?.failed_reasons.map(r => r.count) ?? [1]))
  const usageRows = d ? [['Bookings', d.usage.bookings, TONES.sky.bar], ['Restaurant orders', d.usage.orders, TONES.peach.bar], ['Invoices', d.usage.invoices, TONES.lilac.bar],
    ['Ledger transactions', d.usage.transactions, TONES.mint.bar], ['New guests', d.usage.guests, TONES.butter.bar]] as [string, number, string][] : []
  const usageMax = Math.max(1, ...usageRows.map(r => r[1]))

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={printIt} disabled={!d}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40">
          <Printer size={14} /> Print System Report
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportKpi tone="sky" icon={Users} label="User accounts" value={loading ? '…' : `${d?.users.active ?? 0}/${d?.users.total ?? 0}`}
          sub={`${d?.users.never_signed_in ?? 0} never signed in`} onClick={() => open('sys_users', 'User accounts')} />
        <ReportKpi tone="mint" icon={KeyRound} label="Sign-ins" value={loading ? '…' : String(d?.logins.success ?? 0)}
          sub={`${d?.logins.distinct_users ?? 0} different people`} onClick={() => open('sys_logins', 'Successful sign-ins')} />
        <ReportKpi tone={(d?.logins.failed ?? 0) > 0 ? 'rose' : 'mint'} icon={ShieldAlert} label="Failed attempts" value={loading ? '…' : String(d?.logins.failed ?? 0)}
          sub={(d?.logins.failed ?? 0) > 0 ? 'Wrong passwords, locked or unknown accounts' : 'No failed sign-ins'} onClick={() => open('sys_failed', 'Failed sign-ins')} />
        <ReportKpi tone={(d?.users.locked ?? 0) > 0 ? 'butter' : 'lilac'} icon={Lock} label="Locked accounts" value={loading ? '…' : String(d?.users.locked ?? 0)}
          sub="Cannot sign in right now" onClick={() => open('sys_locked', 'Locked accounts')} />
      </div>

      <ReportPanel title="Sign-in activity" subtitle="Successful and failed sign-ins per day"
        action={<PanelLink onClick={() => open('sys_security', 'Security events')}>Security events</PanelLink>}>
        <div className="mb-2 flex gap-4 text-[12px] text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONES.mint.bar }} />Sign-ins</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONES.rose.bar }} />Failed</span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(d?.series ?? []).map(x => ({ ...x, label: dayLabel(x.date, many) }))} margin={{ top: 6, right: 4, left: -20, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" className="text-neutral-200/80 dark:text-white/[0.06]" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} interval={many ? 'preserveStartEnd' : 0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(150,160,190,0.10)', radius: 8 }} />
              <Bar dataKey="success" fill={TONES.mint.bar} radius={[6, 6, 0, 0]} />
              <Bar dataKey="failed"  fill={TONES.rose.bar} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportPanel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ReportPanel title="Roles" subtitle="People per role" action={<PanelLink onClick={() => open('sys_roles', 'Roles & assignments')}>Details</PanelLink>}>
          {(d?.roles.length ?? 0) === 0 ? <ReportEmpty icon={Users} text="No role assignments" /> : d!.roles.map(r => (
            <BarRow key={r.role} label={ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role} value={r.count} display={String(r.count)} max={roleMax} color={TONES.sky.bar} onClick={() => open('sys_roles', 'Roles & assignments')} />
          ))}
        </ReportPanel>

        <ReportPanel title="Why sign-ins failed" subtitle="Failed attempts by reason" action={<PanelLink onClick={() => open('sys_failed', 'Failed sign-ins')}>Details</PanelLink>}>
          {(d?.failed_reasons.length ?? 0) === 0 ? <ReportEmpty icon={ShieldCheck} text="No failed attempts in this period" /> : d!.failed_reasons.map(r => (
            <BarRow key={r.reason} label={REASON[r.reason] ?? nice(r.reason)} value={r.count} display={String(r.count)} max={reasonMax} color={TONES.rose.bar} onClick={() => open('sys_failed', 'Failed sign-ins')} />
          ))}
        </ReportPanel>

        <ReportPanel title="Work recorded" subtitle="What the system captured in the period">
          {usageRows.map(([label, value, color]) => <BarRow key={label} label={label} value={value} display={String(value)} max={usageMax} color={color} />)}
        </ReportPanel>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ReportPanel title="Most common actions" subtitle="Audit log, sign-ins excluded" action={<PanelLink onClick={() => open('sys_activity', 'System activity')}>All activity</PanelLink>}>
          {(d?.top_actions.length ?? 0) === 0 ? <ReportEmpty icon={Activity} text="No activity recorded" /> : d!.top_actions.map(a => (
            <BarRow key={a.action} label={nice(a.action)} value={a.count} display={String(a.count)} max={actMax} color={TONES.lilac.bar} onClick={() => open('sys_activity', 'System activity')} />
          ))}
        </ReportPanel>

        <ReportPanel title="Most active people" subtitle="Actions recorded per user" action={<PanelLink onClick={() => open('sys_activity', 'System activity')}>Details</PanelLink>}>
          {(d?.top_users.length ?? 0) === 0 ? <ReportEmpty icon={Users} text="No user activity" /> : d!.top_users.map((u, i) => (
            <div key={u.email} className="flex items-center gap-3 px-2.5 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold ${TONES.mint.chip}`}>{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{u.name}</span>
                <span className="block truncate text-[11px] text-neutral-400">{u.email}</span></span>
              <span className="text-[13px] font-bold tabular-nums text-neutral-900 dark:text-white">{u.count}</span>
            </div>
          ))}
        </ReportPanel>

        <ReportPanel title="Printed documents" subtitle="Who printed receipts and reports" action={<PanelLink onClick={() => open('sys_prints', 'Printed documents')}>Details</PanelLink>}>
          {(d?.prints.length ?? 0) === 0 ? <ReportEmpty icon={FileText} text="Nothing was printed" /> : d!.prints.map(p => (
            <BarRow key={p.action} label={nice(p.action)} value={p.count} display={String(p.count)} max={Math.max(1, ...d!.prints.map(x => x.count))} color={TONES.peach.bar} onClick={() => open('sys_prints', 'Printed documents')} />
          ))}
          {(d?.modules.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3 dark:border-white/[0.06]">
              {d!.modules.map(m => (
                <span key={m.key} className={`rounded-full px-3 py-1 text-[11.5px] font-semibold capitalize ${m.enabled ? TONES.mint.soft : TONES.rose.soft}`}>{m.key} · {m.enabled ? 'on' : 'off'}</span>
              ))}
            </div>
          )}
        </ReportPanel>
      </div>

      <ReportPanel title="Recent security events" subtitle="Failed sign-ins, lockouts, password resets and permission changes"
        action={<PanelLink onClick={() => open('sys_security', 'Security events')}>All events</PanelLink>}>
        {(d?.security_events.length ?? 0) === 0 ? <ReportEmpty icon={ShieldCheck} text="No security events in this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
                  <th className="pb-2.5 pr-3">When</th><th className="pb-2.5 pr-3">Event</th><th className="pb-2.5 pr-3">User</th><th className="pb-2.5">Detail</th>
                </tr>
              </thead>
              <tbody>
                {d!.security_events.map((e, i) => (
                  <tr key={i} className="border-t border-neutral-100 dark:border-white/[0.05]">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-neutral-500">{fmtDateTime(e.created_at)}</td>
                    <td className="py-2.5 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${/FAILED|LOCKED|DELETED|DEACTIVATED/.test(e.action) ? TONES.rose.soft : TONES.sky.soft}`}>{nice(e.action)}</span></td>
                    <td className="py-2.5 pr-3 text-neutral-700 dark:text-neutral-200">{e.user_name ?? '—'}</td>
                    <td className="py-2.5 text-neutral-400">{REASON[e.detail ?? ''] ?? e.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportPanel>

      <DetailModal open={!!detail} onClose={() => setDetail(null)}
        url={detail ? `/system/reports/detail/${detail.kind}?from=${from}&to=${to}` : null} title={detail?.title ?? ''} />
    </div>
  )
}
