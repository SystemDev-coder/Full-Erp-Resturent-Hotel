import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, ArrowDownRight, ArrowUpRight, BedDouble, ChefHat, CircleDollarSign, Clock, Coffee,
  ConciergeBell, DoorOpen, FileText, Gauge, Hotel, KeyRound, LogIn, LogOut, MoonStar, PackageSearch,
  Printer, Receipt, RefreshCw, Soup, SprayCan, SunMedium, TrendingUp, UtensilsCrossed,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { roleHasModule } from '@/config/rolePermissions'
import { DetailModal } from '@/components/ui/DetailModal'
import { TONES, type ToneKey } from '@utils/tones'
import api, { getApiErrorMessage } from '@/services/api'
import { printSections } from '@utils/printDetail'

// ─── Data shape (GET /dashboard/summary) ──────────────────────────────────────

interface Summary {
  generated_at: string
  collected: { today: number; yesterday: number; delta: number | null; hotel: number; restaurant: number; other: number }
  room_revenue: { today: number; yesterday: number; delta: number | null }
  restaurant: {
    sales_today: number; sales_delta: number | null; orders_today: number; orders_delta: number | null
    live_orders: number; avg_ticket: number
  }
  rooms: {
    total: number; occupied: number; occupancy_pct: number; by_status: { status: string; count: number }[]
    arrivals: number; departures: number; in_house: number
  }
  housekeeping: { open: number; done: number; tasks: { id: string; task_type: string; status: string; room_number: string; assigned_to_name?: string }[] }
  outstanding: { due: number; count: number }
  low_stock: number
  series: { date: string; hotel: number; restaurant: number; other: number }[]
  top_items: { name: string; qty: number; revenue: number }[]
  recent_bookings: { id: string; booking_ref: string; status: string; check_in_date: string; check_out_date: string; total_amount: string; guest_name: string; room_number: string }[]
  recent_orders: { id: string; order_ref: string; status: string; total_amount: string; opened_at: string; table_number?: string; order_type: string }[]
}

// ─── Pastel design tokens (shared with the report tabs) ───────────────────────

const CHART = { hotel: '#9cc8f5', restaurant: '#f7b98a', other: '#c4b5f5' }
const ROOM_COLOR: Record<string, string> = {
  available: '#8fd4b0', occupied: '#8bb8f0', cleaning: '#f2d479', maintenance: '#f0a0b0', out_of_order: '#c3c9d4',
}
const STATUS_TONE: Record<string, ToneKey> = {
  confirmed: 'sky', pending: 'butter', checked_in: 'mint', checked_out: 'lilac', cancelled: 'rose', no_show: 'rose',
  open: 'sky', preparing: 'butter', ready: 'lilac', served: 'mint', billed: 'peach', paid: 'mint',
  in_progress: 'butter', completed: 'mint', inspected: 'mint', skipped: 'rose',
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const money = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const shortDay = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${DAYS[d.getDay()]} ${d.getDate()}` }
const shortDate = (iso: string) => { const d = new Date(iso.slice(0, 10) + 'T00:00:00'); return `${d.getDate()} ${MON[d.getMonth()]}` }
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good Morning',   Icon: SunMedium }
  if (h < 17) return { text: 'Good Afternoon', Icon: Coffee }
  return { text: 'Good Evening', Icon: MoonStar }
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${TONES[STATUS_TONE[status] ?? 'sky'].soft}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

function KpiCard({ tone, icon: Icon, label, value, sub, delta, onClick, loading }: {
  tone: ToneKey; icon: React.ElementType; label: string; value: string; sub?: string
  delta?: number | null; onClick: () => void; loading: boolean
}) {
  const t = TONES[tone]
  return (
    <button type="button" onClick={onClick}
      className={`group relative flex flex-col rounded-3xl border p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${t.card}`}>
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${t.chip}`}><Icon size={21} strokeWidth={2} /></span>
        <ArrowUpRight size={16} className={`opacity-0 transition group-hover:opacity-70 ${t.ink}`} />
      </div>
      <p className={`mt-5 text-[12.5px] font-medium opacity-80 ${t.ink}`}>{label}</p>
      {loading
        ? <span className="mt-1.5 h-8 w-28 animate-pulse rounded-lg bg-black/[0.06] dark:bg-white/[0.08]" />
        : <p className={`mt-0.5 text-[30px] font-bold leading-tight tracking-tight tabular-nums ${t.ink}`}>{value}</p>}
      <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-2">
        {delta != null && !loading && (
          <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            delta >= 0 ? 'bg-white/70 text-[#1d6b48] dark:bg-white/10 dark:text-[#8fe0b8]' : 'bg-white/70 text-[#a13350] dark:bg-white/10 dark:text-[#f3a1b3]'}`}>
            {delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(delta)}%
          </span>
        )}
        {sub && <span className={`text-[11.5px] opacity-70 ${t.ink}`}>{sub}</span>}
      </div>
    </button>
  )
}

function Glance({ tone, icon: Icon, label, value, onClick }: {
  tone: ToneKey; icon: React.ElementType; label: string; value: string | number; onClick: () => void
}) {
  const t = TONES[tone]
  return (
    <button type="button" onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:border-white/[0.06] dark:bg-[#1a2030]">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.chip}`}><Icon size={17} /></span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
        <span className="block text-[18px] font-bold leading-tight tabular-nums text-neutral-900 dark:text-white">{value}</span>
      </span>
    </button>
  )
}

function Panel({ title, subtitle, action, children, className = '' }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-neutral-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const LinkBtn = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-white/[0.06]">
    {children} <ArrowUpRight size={12} />
  </Link>
)
const TextBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-white/[0.06]">
    {children} <ArrowUpRight size={12} />
  </button>
)

const Empty = ({ icon: Icon, text }: { icon: React.ElementType; text: string }) => (
  <div className="flex flex-col items-center gap-2 py-9 text-neutral-400">
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.05]"><Icon size={20} /></span>
    <p className="text-[12.5px]">{text}</p>
  </div>
)

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((a: number, p: any) => a + Number(p.value || 0), 0)
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white px-3.5 py-3 shadow-xl dark:border-white/[0.08] dark:bg-[#232b3e]">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[12px]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.fill }} />
          <span className="capitalize text-neutral-500 dark:text-neutral-300">{p.dataKey}</span>
          <span className="ml-auto font-semibold tabular-nums text-neutral-800 dark:text-white">{money(p.value)}</span>
        </div>
      ))}
      <div className="mt-1.5 flex justify-between border-t border-neutral-100 pt-1.5 text-[12px] font-bold dark:border-white/[0.08]">
        <span className="text-neutral-500">Total</span><span className="tabular-nums text-neutral-900 dark:text-white">{money(total)}</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'hotel' | 'restaurant'
const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'overview',   label: 'Overview',   icon: Activity },
  { key: 'hotel',      label: 'Hotel',      icon: Hotel },
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
]

export default function Dashboard() {
  const { user } = useAuthContext()
  const branchType = user?.current_branch?.branch_type ?? 'both'
  const role = user?.current_branch?.role ?? user?.role
  // Same visibility rule as the sidebar: a housekeeper / waiter gets a hotel-only / restaurant-only view.
  const roleHasAnyOps   = !role || roleHasModule(role, 'hotel') || roleHasModule(role, 'restaurant')
  const canSeeHotel      = branchType !== 'restaurant' && (!roleHasAnyOps || !role || roleHasModule(role, 'hotel'))
  const canSeeRestaurant = branchType !== 'hotel'      && (!roleHasAnyOps || !role || roleHasModule(role, 'restaurant'))

  const [tab, setTab] = useState<TabKey>('overview')
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ kind: string; title: string } | null>(null)

  const visibleTabs = TABS.filter(t =>
    t.key === 'overview' ? canSeeHotel && canSeeRestaurant : t.key === 'hotel' ? canSeeHotel : canSeeRestaurant)

  useEffect(() => {
    if (!visibleTabs.some(t => t.key === tab)) setTab(visibleTabs[0]?.key ?? 'overview')
  }, [visibleTabs, tab])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await api.get('/dashboard/summary')
      setData(r.data.data); setError('')
    } catch (e) { if (!silent) setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), 60_000)   // quiet refresh — no flicker
    return () => clearInterval(timer)
  }, [load])

  const open = (kind: string, title: string) => setDetail({ kind, title })

  // One-page branded summary of today (company logo / banner on top)
  const [printing, setPrinting] = useState(false)
  const printSummary = async () => {
    if (!data || printing) return
    setPrinting(true)
    try {
      const org = await api.get('/system/organization').then(r => r.data.data).catch(() => null)
      const x = data
      const pct = (v: number | null) => (v == null ? '' : ` (${v >= 0 ? '+' : ''}${v}% vs yesterday)`)
      const sections: { heading: string; rows: [string, string][] }[] = []
      sections.push({ heading: 'Money collected today', rows: [
        ['Total' + pct(x.collected.delta), money(x.collected.today)],
        ['Restaurant', money(x.collected.restaurant)], ['Hotel', money(x.collected.hotel)], ['Other', money(x.collected.other)],
      ] })
      if (canSeeHotel) sections.push({ heading: 'Hotel', rows: [
        ['Room revenue tonight' + pct(x.room_revenue.delta), money(x.room_revenue.today)],
        ['Occupancy', `${x.rooms.occupancy_pct}% (${x.rooms.occupied} of ${x.rooms.total} rooms)`],
        ['In-house guests', String(x.rooms.in_house)], ['Arrivals today', String(x.rooms.arrivals)], ['Departures today', String(x.rooms.departures)],
        ['Housekeeping open / done', `${x.housekeeping.open} / ${x.housekeeping.done}`],
      ] })
      if (canSeeRestaurant) sections.push({ heading: 'Restaurant', rows: [
        ['Sales today' + pct(x.restaurant.sales_delta), money(x.restaurant.sales_today)],
        ['Orders today' + pct(x.restaurant.orders_delta), String(x.restaurant.orders_today)],
        ['Orders in progress', String(x.restaurant.live_orders)], ['Average ticket', money(x.restaurant.avg_ticket)],
      ] })
      if (canSeeRestaurant && x.top_items.length) sections.push({ heading: 'Best sellers today',
        rows: x.top_items.map(i => [i.name, `${i.qty} sold · ${money(i.revenue)}`] as [string, string]) })
      sections.push({ heading: 'Needs attention', rows: [
        ['Unpaid invoices', `${money(x.outstanding.due)} (${x.outstanding.count})`], ['Low stock items', String(x.low_stock)],
      ] })
      printSections(org, 'Daily Summary', `${dateLine} · ${user?.current_branch?.branch_name ?? ''}`.replace(/ · $/, ''),
        user?.full_name ?? user?.email ?? 'User', sections)
    } finally { setPrinting(false) }
  }

  const g = greeting()
  const now = new Date()
  const dateLine = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]}, ${now.getDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][now.getMonth()]} ${now.getFullYear()}`
  const first = (user?.full_name ?? 'there').split(' ')[0]

  const d = data
  const series = useMemo(() => (d?.series ?? []).map(s => ({
    ...s, label: shortDay(s.date),
    hotel: tab === 'restaurant' ? 0 : s.hotel,
    restaurant: tab === 'hotel' ? 0 : s.restaurant,
    other: tab === 'overview' ? s.other : 0,
  })), [d, tab])
  const rooms = (d?.rooms.by_status ?? []).map(r => ({
    name: r.status.replace(/_/g, ' '), key: r.status, value: r.count, color: ROOM_COLOR[r.status] ?? '#c3c9d4',
  }))
  const maxQty = Math.max(1, ...(d?.top_items ?? []).map(i => i.qty))

  // ── KPI sets per tab ───────────────────────────────────────────────────────
  const kCollected = <KpiCard key="c" tone="mint" icon={CircleDollarSign} label="Collected Today" loading={loading}
    value={money(d?.collected.today ?? 0)} delta={d?.collected.delta}
    sub={`Restaurant ${money(d?.collected.restaurant ?? 0)} · Hotel ${money(d?.collected.hotel ?? 0)}`}
    onClick={() => open('revenue', 'Collected today')} />
  const kRoomRev = <KpiCard key="r" tone="sky" icon={BedDouble} label="Room Revenue Tonight" loading={loading}
    value={money(d?.room_revenue.today ?? 0)} delta={d?.room_revenue.delta}
    sub={`${d?.rooms.in_house ?? 0} guests in-house`} onClick={() => open('room_revenue', 'Room revenue today')} />
  const kSales = <KpiCard key="s" tone="peach" icon={ChefHat} label="Restaurant Sales" loading={loading}
    value={money(d?.restaurant.sales_today ?? 0)} delta={d?.restaurant.sales_delta}
    sub={`${d?.restaurant.orders_today ?? 0} orders today`} onClick={() => open('sales', 'Restaurant orders today')} />
  const kOcc = <KpiCard key="o" tone="lilac" icon={Gauge} label="Occupancy" loading={loading}
    value={`${d?.rooms.occupancy_pct ?? 0}%`} sub={`${d?.rooms.occupied ?? 0} of ${d?.rooms.total ?? 0} rooms occupied`}
    onClick={() => open('occupancy', 'Rooms right now')} />
  const kArr = <KpiCard key="a" tone="butter" icon={LogIn} label="Arrivals Today" loading={loading}
    value={String(d?.rooms.arrivals ?? 0)} sub="Guests due to check in" onClick={() => open('arrivals', 'Arrivals today')} />
  const kDep = <KpiCard key="d" tone="rose" icon={LogOut} label="Departures Today" loading={loading}
    value={String(d?.rooms.departures ?? 0)} sub="Guests due to check out" onClick={() => open('departures', 'Departures today')} />
  const kOrders = <KpiCard key="n" tone="sky" icon={Receipt} label="Orders Today" loading={loading}
    value={String(d?.restaurant.orders_today ?? 0)} delta={d?.restaurant.orders_delta}
    sub="vs yesterday" onClick={() => open('sales', 'Restaurant orders today')} />
  const kLive = <KpiCard key="l" tone="butter" icon={Soup} label="Orders In Progress" loading={loading}
    value={String(d?.restaurant.live_orders ?? 0)} sub="Not billed yet" onClick={() => open('orders_open', 'Orders in progress')} />
  const kTicket = <KpiCard key="t" tone="lilac" icon={TrendingUp} label="Average Ticket" loading={loading}
    value={money(d?.restaurant.avg_ticket ?? 0)} sub="Per invoice today" onClick={() => open('sales', 'Restaurant orders today')} />

  const kpis = tab === 'hotel'      ? [kRoomRev, kOcc, kArr, kDep]
             : tab === 'restaurant' ? [kSales, kOrders, kLive, kTicket]
             :                        [kCollected, kRoomRev, kSales, kOcc]

  const glance = [
    ...(tab !== 'restaurant' ? [
      <Glance key="inh" tone="sky"    icon={KeyRound}      label="In-house guests"  value={d?.rooms.in_house ?? 0}        onClick={() => open('occupancy', 'Rooms right now')} />,
      <Glance key="hk"  tone="butter" icon={SprayCan}      label="Housekeeping open" value={d?.housekeeping.open ?? 0}    onClick={() => open('housekeeping', "Today's housekeeping")} />,
    ] : []),
    ...(tab === 'overview' ? [
      <Glance key="arr" tone="mint"   icon={LogIn}         label="Arrivals"          value={d?.rooms.arrivals ?? 0}       onClick={() => open('arrivals', 'Arrivals today')} />,
      <Glance key="dep" tone="rose"   icon={LogOut}        label="Departures"        value={d?.rooms.departures ?? 0}     onClick={() => open('departures', 'Departures today')} />,
    ] : []),
    ...(tab !== 'hotel' ? [
      <Glance key="liv" tone="peach"  icon={ConciergeBell} label="Orders in progress" value={d?.restaurant.live_orders ?? 0} onClick={() => open('orders_open', 'Orders in progress')} />,
    ] : []),
    <Glance key="out" tone="lilac" icon={FileText}      label="Unpaid invoices" value={money(d?.outstanding.due ?? 0)} onClick={() => open('outstanding', 'Unpaid invoices')} />,
    <Glance key="low" tone="rose"  icon={PackageSearch} label="Low stock items" value={d?.low_stock ?? 0}              onClick={() => open('stock', 'Low stock')} />,
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{dateLine}</p>
          <h1 className="mt-1.5 flex items-center gap-3 text-[28px] font-bold leading-tight tracking-tight text-neutral-900 dark:text-white">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fdf5d8] text-[#7d5f08] dark:bg-[#2b2819] dark:text-[#f2d479]"><g.Icon size={22} /></span>
            {g.text}, {first}
          </h1>
          <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
            {user?.current_branch?.branch_name ?? user?.organization_name ?? 'Your property'} · here is how today is going.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {visibleTabs.length > 1 && (
            <div className="flex rounded-2xl border border-neutral-200/70 bg-white p-1 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030]">
              {visibleTabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${
                    tab === t.key ? 'bg-[#e8e0fa] text-[#46338a] dark:bg-[#2c2749] dark:text-[#ddd3f8]' : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white'}`}>
                  <t.icon size={15} />{t.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={printSummary} disabled={!d || printing} title="Print today's summary"
            className="flex h-[42px] items-center gap-2 rounded-2xl border border-neutral-200/70 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-600 shadow-sm transition hover:text-indigo-600 disabled:opacity-40 dark:border-white/[0.06] dark:bg-[#1a2030] dark:text-neutral-300">
            <Printer size={14} /><span className="hidden sm:inline">Print</span>
          </button>
          <button onClick={() => load()} title={d ? `Updated ${timeOf(d.generated_at)}` : 'Refresh'}
            className="flex h-[42px] items-center gap-2 rounded-2xl border border-neutral-200/70 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-600 shadow-sm transition hover:text-indigo-600 dark:border-white/[0.06] dark:bg-[#1a2030] dark:text-neutral-300">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{d ? `Updated ${timeOf(d.generated_at)}` : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}

      {/* KPI cards — every one opens its details */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis}</div>

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">{glance}</div>

      {/* Revenue + rooms */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Money Collected" subtitle="Payments received over the last 7 days"
          action={<TextBtn onClick={() => open('revenue', 'Collected today')}>Today's payments</TextBtn>}>
          <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-neutral-500 dark:text-neutral-400">
            {tab !== 'restaurant' && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.hotel }} />Hotel</span>}
            {tab !== 'hotel' && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.restaurant }} />Restaurant</span>}
            {tab === 'overview' && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.other }} />Other</span>}
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 6, right: 4, left: -14, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" className="text-neutral-200/80 dark:text-white/[0.06]" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9aa3b2' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(150,160,190,0.10)', radius: 10 }} />
                <Bar dataKey="hotel"      stackId="a" fill={CHART.hotel} />
                <Bar dataKey="restaurant" stackId="a" fill={CHART.restaurant} />
                <Bar dataKey="other"      stackId="a" fill={CHART.other} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {tab !== 'restaurant' ? (
          <Panel title="Rooms" subtitle="Live status" action={<TextBtn onClick={() => open('occupancy', 'Rooms right now')}>All rooms</TextBtn>}>
            {rooms.length === 0 ? <Empty icon={DoorOpen} text="No rooms set up yet" /> : (
              <>
                <div className="relative h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={rooms} dataKey="value" innerRadius={54} outerRadius={78} paddingAngle={3} cornerRadius={6} stroke="none">
                        {rooms.map(r => <Cell key={r.key} fill={r.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[26px] font-bold leading-none tabular-nums text-neutral-900 dark:text-white">{d?.rooms.occupancy_pct ?? 0}%</span>
                    <span className="mt-1 text-[11px] text-neutral-400">occupied</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {rooms.map(r => (
                    <button key={r.key} onClick={() => open('occupancy', 'Rooms right now')}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-[12.5px] transition hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                      <span className="flex items-center gap-2 capitalize text-neutral-600 dark:text-neutral-300">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.name}
                      </span>
                      <span className="font-semibold tabular-nums text-neutral-900 dark:text-white">{r.value}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Panel>
        ) : (
          <Panel title="Best Sellers Today" subtitle="Most ordered dishes" action={<TextBtn onClick={() => open('sales', 'Restaurant orders today')}>Orders</TextBtn>}>
            {(d?.top_items.length ?? 0) === 0 ? <Empty icon={ChefHat} text="No dishes sold yet today" /> : (
              <div className="space-y-3.5">
                {d!.top_items.map((it, i) => (
                  <div key={it.name}>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-100">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10.5px] font-bold ${TONES.peach.soft}`}>{i + 1}</span>{it.name}
                      </span>
                      <span className="tabular-nums text-neutral-500">{it.qty} · {money(it.revenue)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${(it.qty / maxQty) * 100}%`, background: CHART.restaurant }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {tab !== 'restaurant' && (
          <Panel className={tab === 'hotel' ? 'xl:col-span-3' : 'xl:col-span-3'} title="Recent Bookings" subtitle="Newest reservations"
            action={<LinkBtn to="/hotel/bookings">View all</LinkBtn>}>
            {(d?.recent_bookings.length ?? 0) === 0 ? <Empty icon={BedDouble} text="No bookings yet" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
                      <th className="pb-2.5 pr-3">Guest</th><th className="pb-2.5 pr-3">Room</th><th className="pb-2.5 pr-3">Stay</th>
                      <th className="pb-2.5 pr-3">Status</th><th className="pb-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d!.recent_bookings.map(b => (
                      <tr key={b.id} className="border-t border-neutral-100 transition hover:bg-neutral-50/80 dark:border-white/[0.05] dark:hover:bg-white/[0.03]">
                        <td className="py-3 pr-3">
                          <a href={`/hotel/bookings/${b.id}/statement`} target="_blank" rel="noreferrer" title="Open guest statement"
                            className="font-semibold text-neutral-800 hover:text-indigo-600 dark:text-neutral-100">{b.guest_name}</a>
                          <p className="font-mono text-[10.5px] text-neutral-400">{b.booking_ref}</p>
                        </td>
                        <td className="py-3 pr-3"><span className={`rounded-lg px-2 py-1 text-[11.5px] font-bold ${TONES.sky.soft}`}>{b.room_number}</span></td>
                        <td className="whitespace-nowrap py-3 pr-3 text-neutral-500">{shortDate(b.check_in_date)} → {shortDate(b.check_out_date)}</td>
                        <td className="py-3 pr-3"><StatusPill status={b.status} /></td>
                        <td className="py-3 text-right font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{money(Number(b.total_amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {tab !== 'hotel' && (
          <Panel className={tab === 'restaurant' ? 'xl:col-span-5' : 'xl:col-span-2'} title="Latest Orders" subtitle="Newest restaurant orders"
            action={<LinkBtn to="/restaurant/operations">View all</LinkBtn>}>
            {(d?.recent_orders.length ?? 0) === 0 ? <Empty icon={UtensilsCrossed} text="No orders yet" /> : (
              <div className="space-y-2.5">
                {d!.recent_orders.map(o => (
                  <button key={o.id} onClick={() => open('sales', 'Restaurant orders today')}
                    className="flex w-full items-center gap-3 rounded-2xl border border-neutral-100 p-3 text-left transition hover:bg-neutral-50 dark:border-white/[0.05] dark:hover:bg-white/[0.04]">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES.peach.chip}`}><UtensilsCrossed size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{o.order_ref}{o.table_number ? ` · Table ${o.table_number}` : ''}</span>
                        <span className="text-[13px] font-bold tabular-nums text-neutral-900 dark:text-white">{money(Number(o.total_amount))}</span>
                      </span>
                      <span className="mt-1 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[11.5px] text-neutral-400"><Clock size={11} />{timeOf(o.opened_at)}</span>
                        <StatusPill status={o.status} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {tab === 'hotel' && (
          <Panel className="xl:col-span-2" title="Housekeeping" subtitle={`${d?.housekeeping.done ?? 0} done · ${d?.housekeeping.open ?? 0} open`}
            action={<TextBtn onClick={() => open('housekeeping', "Today's housekeeping")}>Details</TextBtn>}>
            {(d?.housekeeping.tasks.length ?? 0) === 0 ? <Empty icon={SprayCan} text="No cleaning scheduled today" /> : (
              <div className="space-y-2.5">
                {d!.housekeeping.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-neutral-100 px-3 py-2.5 dark:border-white/[0.05]">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12.5px] font-bold ${TONES.butter.chip}`}>{t.room_number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold capitalize text-neutral-800 dark:text-neutral-100">{t.task_type.replace(/_/g, ' ')}</span>
                      <span className="block text-[11.5px] text-neutral-400">{t.assigned_to_name ?? 'Unassigned'}</span>
                    </span>
                    <StatusPill status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      <DetailModal open={!!detail} onClose={() => setDetail(null)}
        url={detail ? `/dashboard/detail/${detail.kind}` : null} title={detail?.title ?? ''} />
    </div>
  )
}
