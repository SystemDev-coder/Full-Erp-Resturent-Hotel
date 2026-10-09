import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, TrendingUp, TrendingDown, Scale, FileText,
  BedDouble, UtensilsCrossed, Boxes, Wallet, Landmark, PieChart,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Printer, ArrowUpRight, LayoutDashboard, ShieldCheck,
} from 'lucide-react'
import { DataTable, type DTColumn } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { DetailModal } from '@/components/ui/DetailModal'
import { money } from '@utils/detailFormat'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'
import { useAuth } from '@hooks/useAuth'
import { Tabs } from '@/components/ui/Tabs'
import FinanceReport from './reports/FinanceReport'
import SystemReport from './reports/SystemReport'
import { printHtml, esc, companyHeader, printStamp, type OrgInfo } from '@utils/print'

// ─── Types (shape of /accounting/reports/summary) ─────────────────────────────

interface TypeRow { transaction_type: string; direction: string; total: string; count: string }
interface DailyRow { date: string; money_in: string; money_out: string }
interface AccountRow { id: string; account_type: string; name: string; balance: string }

interface Summary {
  period: { from: string; to: string }
  money: { total_in: number; total_out: number; net: number; by_type: TypeRow[]; daily: DailyRow[] }
  hotel: {
    bookings: { total: string; checked_in: string; checked_out: string; cancelled: string; booking_value: string }
    rooms: { total_rooms: string; occupied: string; available: string }
  }
  restaurant: { total_orders: string; order_revenue: string; cancelled: string }
  receivables: { count: string; invoiced: string; collected: string; outstanding: string }
  payables: { count: string; billed: string; paid: string; payable: string }
  inventory: { stock_value: string; item_count: string; low_stock: number }
  expenses_paid: number
  salaries_paid: number
  accounts: AccountRow[]
  assets: { count: string; purchase_cost: string; current_value: string }
}

function iso(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}

const PRESETS = [
  { key: '7d',    label: 'Last 7 days',   days: 6 },
  { key: '30d',   label: 'Last 30 days',  days: 29 },
  { key: '90d',   label: 'Last 90 days',  days: 89 },
]

const fmt = (n: number | string) => money(n)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Reports() {
  const { user } = useAuth()
  // Report tabs: General for everyone; Finance for money roles; System (security & usage) for administrators.
  const role = user?.current_branch?.role ?? user?.role
  const canFinance = !!role && ['org_admin', 'branch_manager', 'accountant', 'hotel_cashier', 'report_viewer'].includes(role)
  const canSystem  = !!role && ['org_admin', 'branch_manager'].includes(role)
  const [tab, setTab] = useState<'general' | 'finance' | 'system'>('general')
  const [refreshKey, setRefreshKey] = useState(0)
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86_400_000)))
  const [to,   setTo]   = useState(() => iso(new Date()))

  const [data,    setData]    = useState<Summary | null>(null)
  const [org,     setOrg]     = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  // Which card's details are open (the rows behind a KPI number)
  const [detail, setDetail] = useState<{ kind: string; title: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, oRes] = await Promise.all([
        api.get(`/accounting/reports/summary?from=${from}&to=${to}`),
        api.get('/system/organization').catch(() => null),
      ])
      setData(r.data.data)
      if (oRes) setOrg(oRes.data.data)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, [load])

  // ── Print the whole report (A4) ─────────────────────────────────────────────
  const printReport = () => {
    if (!data) return
    const printedBy = user?.full_name ?? user?.email ?? 'User'
    const money = (n: number | string) => (Number(n) < 0 ? '-$' : '$') + Math.abs(Number(n)).toFixed(2)
    const row2 = (label: string, value: string, bold = false) =>
      `<tr${bold ? ' class="bold"' : ''}><td>${esc(label)}</td><td class="right">${value}</td></tr>`

    const accountRows = data.accounts.map(a =>
      `<tr><td>${esc(a.name)}</td><td>${esc(a.account_type.replace(/_/g,' '))}</td><td class="right">${money(a.balance)}</td></tr>`
    ).join('')

    const typeRows = data.money.by_type.map(t =>
      `<tr><td>${esc(t.transaction_type.replace(/_/g,' '))}</td><td>${t.direction === 'in' ? 'IN' : 'OUT'}</td><td class="right">${t.direction === 'in' ? '+' : '−'}${money(t.total)}</td></tr>`
    ).join('')

    printHtml(`
      ${companyHeader(org, 'a4')}
      <hr/>
      <div class="center bold lg">MANAGEMENT REPORT</div>
      <div class="center sm">${esc(data.period.from)} → ${esc(data.period.to)}</div>
      <hr/>
      <div class="bold md mb">MONEY</div>
      <table class="md">
        ${row2('Money in',  money(data.money.total_in))}
        ${row2('Money out', money(data.money.total_out))}
        ${row2(data.money.net >= 0 ? 'NET PROFIT' : 'NET LOSS', money(Math.abs(data.money.net)), true)}
      </table>
      <hr/>
      <div class="bold md mb">HOTEL</div>
      <table class="md">
        ${row2('Bookings', String(data.hotel.bookings.total))}
        ${row2('Checked in / out', `${data.hotel.bookings.checked_in} / ${data.hotel.bookings.checked_out}`)}
        ${row2('Booking value', money(data.hotel.bookings.booking_value))}
        ${row2('Occupancy today', `${data.hotel.rooms.occupied}/${data.hotel.rooms.total_rooms} rooms`)}
      </table>
      <hr/>
      <div class="bold md mb">RESTAURANT</div>
      <table class="md">
        ${row2('Orders', String(data.restaurant.total_orders))}
        ${row2('Revenue', money(data.restaurant.order_revenue))}
      </table>
      <hr/>
      <div class="bold md mb">RECEIVABLES / PAYABLES</div>
      <table class="md">
        ${row2('Guest invoiced', money(data.receivables.invoiced))}
        ${row2('Collected', money(data.receivables.collected))}
        ${row2('Outstanding', money(data.receivables.outstanding), true)}
        ${row2('Supplier billed', money(data.payables.billed))}
        ${row2('Payable', money(data.payables.payable), true)}
      </table>
      <hr/>
      <div class="bold md mb">INVENTORY / PAYROLL / ASSETS</div>
      <table class="md">
        ${row2('Stock value', money(data.inventory.stock_value))}
        ${row2('Low stock items', String(data.inventory.low_stock))}
        ${row2('Salaries paid', money(data.salaries_paid))}
        ${row2('Expenses paid', money(data.expenses_paid))}
        ${row2('Assets value', money(data.assets.current_value))}
      </table>
      <hr/>
      <div class="bold md mb">ACCOUNT BALANCES</div>
      <table class="md">
        <tr><th>Account</th><th>Type</th><th class="right">Balance</th></tr>
        ${accountRows}
      </table>
      <hr/>
      <div class="bold md mb">MONEY BY TYPE</div>
      <table class="md">
        <tr><th>Type</th><th>Dir</th><th class="right">Total</th></tr>
        ${typeRows}
      </table>
      <hr/>
      <div class="center xs mt">Printed by ${esc(printedBy)} · ${printStamp()}</div>
    `, 190, { a4: true }) // A4 document

    api.post('/system/audit/print', {
      action: 'PRINT_REPORT',
      details: { period: `${data.period.from} → ${data.period.to}`, net: data.money.net, printed_by: printedBy },
    }).catch(() => {})
  }

  const preset = (days: number) => {
    setTo(iso(new Date()))
    setFrom(iso(new Date(Date.now() - days * 86_400_000)))
  }

  const occupancy = data
    ? Math.round((Number(data.hotel.rooms.occupied) / Math.max(1, Number(data.hotel.rooms.total_rooms))) * 100)
    : 0

  // Chart scaling
  const daily = data?.money.daily ?? []
  const maxDaily = Math.max(1, ...daily.map(d => Math.max(Number(d.money_in), Number(d.money_out))))

  const ACC_COLS: DTColumn<AccountRow>[] = [
    { key:'name', label:'Account', render:a=><span className="font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{a.name}</span> },
    { key:'account_type', label:'Type', render:a=><span className="capitalize text-neutral-500 dark:text-neutral-400">{a.account_type.replace(/_/g,' ')}</span> },
    { key:'balance', label:'Balance', render:a=>(
      <span className={`font-extrabold ${Number(a.balance) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-800 dark:text-white'}`}>
        {fmt(a.balance)}
      </span>
    ), exportValue:a=>a.balance },
  ]

  const TYPE_COLS: DTColumn<TypeRow>[] = [
    { key:'transaction_type', label:'Transaction Type', render:t=>(
      <span className="font-semibold capitalize text-neutral-700 dark:text-neutral-300">{t.transaction_type.replace(/_/g,' ')}</span>
    )},
    { key:'direction', label:'Direction', render:t=>(
      <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        t.direction === 'in' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                             : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
      }`}>
        {t.direction === 'in' ? <ArrowDownToLine size={11}/> : <ArrowUpFromLine size={11}/>}
        {t.direction === 'in' ? 'Money In' : 'Money Out'}
      </span>
    )},
    { key:'count', label:'Transactions', render:t=><span className="font-bold text-neutral-700 dark:text-neutral-300">{t.count}</span>, exportValue:t=>t.count },
    { key:'total', label:'Total', render:t=>(
      <span className={`font-extrabold ${t.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {t.direction === 'in' ? '+' : '−'}{fmt(t.total)}
      </span>
    ), exportValue:t=>t.total },
  ]

  // ── Small building blocks ───────────────────────────────────────────────────

  const KPI = ({ icon, label, value, sub, color, kind }: {
    icon: React.ReactNode; label: string; value: string; sub?: string; color: string; kind: string
  }) => (
    <button type="button" onClick={() => setDetail({ kind, title: label })}
      className="group w-full rounded-3xl border border-neutral-200/70 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-white/[0.06] dark:bg-[#1a2030]">
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${color}`}>{icon}</span>
        <ArrowUpRight size={16} className="text-neutral-300 opacity-0 transition group-hover:opacity-100 dark:text-neutral-500" />
      </div>
      <p className="mt-4 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 truncate text-[26px] font-bold leading-tight tracking-tight tabular-nums text-neutral-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-neutral-400">{sub}</p>}
    </button>
  )

  const Stat = ({ label, value, accent, kind }: { label: string; value: string; accent?: string; kind?: string }) => (
    <div className={`flex items-center justify-between py-1.5 ${kind ? 'cursor-pointer rounded-lg px-1.5 -mx-1.5 hover:bg-neutral-50 dark:hover:bg-white/[0.04]' : ''}`}
      onClick={kind ? () => setDetail({ kind, title: label }) : undefined}>
      <span className="text-[12.5px] text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`text-[13px] font-extrabold tabular-nums ${accent ?? 'text-neutral-800 dark:text-white'}`}>{value}</span>
    </div>
  )

  const Section = ({ icon, title, color, children, kind }: {
    icon: React.ReactNode; title: string; color: string; children: React.ReactNode; kind: string
  }) => (
    <div className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm transition duration-200 hover:shadow-md dark:border-white/[0.06] dark:bg-[#1a2030]">
      <button type="button" onClick={() => setDetail({ kind, title })}
        className="group mb-3 flex w-full items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded-xl">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>{icon}</span>
        <h3 className="flex-1 text-[14.5px] font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h3>
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-indigo-600 opacity-70 transition group-hover:opacity-100 dark:text-indigo-300">
          Details <ArrowUpRight size={12} />
        </span>
      </button>
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">{children}</div>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header + period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-neutral-900 dark:text-white">Reports</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            {from} → {to}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => preset(p.days)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[12px] font-semibold text-neutral-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 transition-colors">
              {p.label}
            </button>
          ))}
          <div className="w-36"><DatePicker value={from} onChange={setFrom}/></div>
          <span className="text-neutral-400">→</span>
          <div className="w-36"><DatePicker value={to} onChange={setTo}/></div>
          <button onClick={() => { load(); setRefreshKey(k => k + 1) }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={printReport} disabled={!data} style={{ display: tab === 'general' ? undefined : 'none' }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            <Printer size={14}/> Print Report
          </button>
        </div>
      </div>

      <Tabs active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: 'general', label: 'General', icon: <LayoutDashboard size={14}/> },
        ...(canFinance ? [{ key: 'finance', label: 'Finance', icon: <Wallet size={14}/> }] : []),
        ...(canSystem  ? [{ key: 'system',  label: 'System',  icon: <ShieldCheck size={14}/> }] : []),
      ]}/>

      {tab === 'finance' && canFinance && <FinanceReport from={from} to={to} refreshKey={refreshKey}/>}
      {tab === 'system'  && canSystem  && <SystemReport  from={from} to={to} refreshKey={refreshKey}/>}

      {tab === 'general' && error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {tab === 'general' && data && (
        <>
          {/* ── KPI row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KPI kind="money_in" icon={<TrendingUp size={20}/>} label="Money In" value={fmt(data.money.total_in)}
              color="bg-[#c9ecd9] text-[#1d6b48] dark:bg-[#25433a] dark:text-[#8fe0b8]"/>
            <KPI kind="money_out" icon={<TrendingDown size={20}/>} label="Money Out" value={fmt(data.money.total_out)}
              color="bg-[#f7c9d3] text-[#a13350] dark:bg-[#4d2f38] dark:text-[#f3a1b3]"/>
            <KPI kind="net" icon={<Scale size={20}/>} label="Net" value={fmt(data.money.net)}
              sub={data.money.net >= 0 ? 'Profit for period' : 'Loss for period'}
              color={data.money.net >= 0
                ? 'bg-[#c8e0fa] text-[#25588f] dark:bg-[#243d5c] dark:text-[#9cc8f5]'
                : 'bg-[#f7e5a6] text-[#7d5f08] dark:bg-[#4a421c] dark:text-[#f2d479]'}/>
            <KPI kind="outstanding" icon={<FileText size={20}/>} label="Outstanding" value={fmt(data.receivables.outstanding)}
              sub="Unpaid guest invoices"
              color="bg-[#d9cff5] text-[#5a43a6] dark:bg-[#352f5c] dark:text-[#c4b5f5]"/>
          </div>

          {/* ── Daily cash-flow chart ───────────────────────────────────── */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[14px] font-extrabold text-neutral-900 dark:text-white">Daily Cash Flow</h3>
              <div className="flex items-center gap-4 text-[11px] font-semibold text-neutral-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500"/> In</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400"/> Out</span>
              </div>
            </div>
            {daily.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-neutral-400">No transactions in this period</p>
            ) : (
              <div className="flex h-44 items-end gap-[3px] overflow-x-auto pb-1">
                {daily.map(d => (
                  <div key={d.date} className="group flex min-w-[18px] flex-1 flex-col items-center gap-0.5"
                    title={`${d.date}\nIn: ${fmt(d.money_in)}\nOut: ${fmt(d.money_out)}`}>
                    <div className="flex w-full flex-1 items-end justify-center gap-[2px]">
                      <div className="w-1/2 rounded-t bg-emerald-500/85 transition-all group-hover:bg-emerald-500"
                        style={{ height: `${(Number(d.money_in) / maxDaily) * 100}%` }}/>
                      <div className="w-1/2 rounded-t bg-rose-400/85 transition-all group-hover:bg-rose-400"
                        style={{ height: `${(Number(d.money_out) / maxDaily) * 100}%` }}/>
                    </div>
                    <span className="text-[8.5px] font-semibold text-neutral-400">{d.date.slice(8,10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Module sections ─────────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Section kind="hotel" icon={<BedDouble size={17}/>} title="Hotel"
              color="bg-[#c8e0fa] text-[#25588f] dark:bg-[#243d5c] dark:text-[#9cc8f5]">
              <Stat label="Bookings" value={data.hotel.bookings.total}/>
              <Stat label="Checked in / out" value={`${data.hotel.bookings.checked_in} / ${data.hotel.bookings.checked_out}`}/>
              <Stat label="Cancelled" value={data.hotel.bookings.cancelled} accent="text-rose-600 dark:text-rose-400"/>
              <Stat label="Booking value" value={fmt(data.hotel.bookings.booking_value)} accent="text-emerald-600 dark:text-emerald-400"/>
              <Stat label="Occupancy today" value={`${occupancy}% (${data.hotel.rooms.occupied}/${data.hotel.rooms.total_rooms})`}/>
            </Section>

            <Section kind="restaurant" icon={<UtensilsCrossed size={17}/>} title="Restaurant"
              color="bg-[#fad5b8] text-[#9a4b1c] dark:bg-[#4a3526] dark:text-[#f7b98a]">
              <Stat label="Orders" value={data.restaurant.total_orders}/>
              <Stat label="Cancelled" value={data.restaurant.cancelled} accent="text-rose-600 dark:text-rose-400"/>
              <Stat label="Order revenue" value={fmt(data.restaurant.order_revenue)} accent="text-emerald-600 dark:text-emerald-400"/>
            </Section>

            <Section kind="inventory" icon={<Boxes size={17}/>} title="Inventory"
              color="bg-[#c9ecd9] text-[#1d6b48] dark:bg-[#25433a] dark:text-[#8fe0b8]">
              <Stat label="Items tracked" value={data.inventory.item_count}/>
              <Stat label="Stock value" value={fmt(data.inventory.stock_value)}/>
              <Stat label="Low stock items" value={String(data.inventory.low_stock)}
                accent={data.inventory.low_stock > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}/>
            </Section>

            <Section kind="receivables" icon={<FileText size={17}/>} title="Receivables (Guests)"
              color="bg-[#d9cff5] text-[#5a43a6] dark:bg-[#352f5c] dark:text-[#c4b5f5]">
              <Stat label="Invoices" value={data.receivables.count}/>
              <Stat label="Invoiced" value={fmt(data.receivables.invoiced)}/>
              <Stat label="Collected" value={fmt(data.receivables.collected)} accent="text-emerald-600 dark:text-emerald-400"/>
              <Stat label="Outstanding" value={fmt(data.receivables.outstanding)} accent="text-amber-600 dark:text-amber-400"/>
            </Section>

            <Section kind="payables" icon={<Landmark size={17}/>} title="Payables (Suppliers)"
              color="bg-[#f7c9d3] text-[#a13350] dark:bg-[#4d2f38] dark:text-[#f3a1b3]">
              <Stat label="Bills" value={data.payables.count}/>
              <Stat label="Billed" value={fmt(data.payables.billed)}/>
              <Stat label="Paid" value={fmt(data.payables.paid)} accent="text-emerald-600 dark:text-emerald-400"/>
              <Stat label="Payable" value={fmt(data.payables.payable)} accent="text-amber-600 dark:text-amber-400"/>
            </Section>

            <Section kind="payroll" icon={<Wallet size={17}/>} title="Payroll, Expenses & Assets"
              color="bg-[#f7e5a6] text-[#7d5f08] dark:bg-[#4a421c] dark:text-[#f2d479]">
              <Stat label="Salaries paid" value={fmt(data.salaries_paid)} accent="text-rose-600 dark:text-rose-400"/>
              <Stat label="Expenses paid" value={fmt(data.expenses_paid)} accent="text-rose-600 dark:text-rose-400"/>
              <Stat kind="assets" label="Assets" value={`${data.assets.count} (${fmt(data.assets.current_value)})`}/>
            </Section>
          </div>

          {data.inventory.low_stock > 0 && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/25 dark:bg-rose-500/10">
              <AlertTriangle size={15} className="shrink-0 text-rose-600 dark:text-rose-400"/>
              <p className="text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">
                {data.inventory.low_stock} item(s) are at or below their reorder level — check Inventory → Items.
              </p>
            </div>
          )}

          {/* ── Breakdown tables ────────────────────────────────────────── */}
          <div className="grid gap-5 xl:grid-cols-2">
            <DataTable columns={TYPE_COLS} data={data.money.by_type} title="Money by Transaction Type"
              filename="money_by_type" rowKey={(t)=>`${t.transaction_type}-${t.direction}`}
              searchPlaceholder="Search type…" loading={loading}/>
            <DataTable columns={ACC_COLS} data={data.accounts} title="Account Balances"
              filename="account_balances" rowKey={a=>a.id}
              searchPlaceholder="Search account…" loading={loading}/>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <PieChart size={15} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400"/>
            <p className="text-[12.5px] text-indigo-700 dark:text-indigo-300">
              All figures are scoped to the <b>current branch</b> and the selected date range.
              Use the export button on any table to download CSV for Excel.
            </p>
          </div>
        </>
      )}

      <DetailModal open={!!detail} onClose={() => setDetail(null)}
        url={detail ? `/accounting/reports/detail/${detail.kind}?from=${from}&to=${to}` : null} title={detail?.title ?? ''} />
    </div>
  )
}
