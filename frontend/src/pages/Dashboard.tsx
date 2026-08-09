import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, BedDouble, UtensilsCrossed,
  Banknote, Gauge, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle2, AlertCircle, Loader2, CalendarDays, Sparkles, SunMedium, MoonStar, Coffee,
  Hotel, ChefHat, Table2, Receipt, Hourglass, UserCircle2,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { roleHasModule } from '@/config/rolePermissions'
import api from '@/services/api'

function greetingInfo() {
  const now = new Date()
  const h = now.getHours()
  const day = now.getDay()
  const title = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const dayMessages = [
    'A peaceful Sunday to review, reset, and welcome every guest well.',
    'Fresh Monday energy - a strong start for smooth operations.',
    'Happy Tuesday - keep the service steady and the details sharp.',
    'Wonderful Wednesday - half the week is yours to win.',
    'Thoughtful Thursday - a great day to tighten every workflow.',
    'Beautiful Friday - may every booking, order, and guest moment flow smoothly.',
    'A calm Saturday shift - perfect for warm hospitality and clean execution.',
  ]
  const Icon = day === 5 ? Sparkles : h < 12 ? SunMedium : h < 17 ? Coffee : MoonStar
  return { title, message: dayMessages[day], Icon }
}
function firstName(fullName?: string) { return fullName?.split(' ')[0] ?? 'there' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashStats {
  today_revenue: number
  active_bookings: number
  order_count: number
  order_revenue: number
  total_rooms: number
  occupied_rooms: number
  occupancy_pct: number
}

interface OccupancyRow { status: string; count: string }
interface BookingRow   { id: string; reference_number: string; check_in_date: string; check_out_date: string; status: string; total_amount: string; guest_name?: string; room_number?: string }
interface OrderRow     { id: string; order_number: string; status: string; total_amount: string; created_at: string }
interface HKRow        { id: string; task_type: string; status: string; room_number: string; assigned_to_name?: string }

// ─── Color helpers ────────────────────────────────────────────────────────────

type StatColor = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'
const COLOR_MAP: Record<StatColor, { bg: string; icon: string; ring: string }> = {
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-500/10',  icon: 'text-indigo-600 dark:text-indigo-400',  ring: 'ring-indigo-100 dark:ring-indigo-500/20'  },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10',icon: 'text-emerald-600 dark:text-emerald-400',ring: 'ring-emerald-100 dark:ring-emerald-500/20' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',    icon: 'text-amber-600 dark:text-amber-400',    ring: 'ring-amber-100 dark:ring-amber-500/20'    },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-500/10',      icon: 'text-rose-600 dark:text-rose-400',      ring: 'ring-rose-100 dark:ring-rose-500/20'      },
  sky:     { bg: 'bg-sky-50 dark:bg-sky-500/10',        icon: 'text-sky-600 dark:text-sky-400',        ring: 'ring-sky-100 dark:ring-sky-500/20'        },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-500/10',  icon: 'text-violet-600 dark:text-violet-400',  ring: 'ring-violet-100 dark:ring-violet-500/20'  },
}

function StatCard({ label, value, sub, change, icon: Icon, color, loading }: {
  label: string; value: string; sub?: string; change: number; icon: React.ElementType; color: StatColor; loading?: boolean
}) {
  const c = COLOR_MAP[color]
  const up = change >= 0
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.bg} ring-1 ${c.ring}`}>
          <Icon size={20} className={c.icon} />
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
          up ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
             : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
        }`}>
          {up ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
          {Math.abs(change)}%
        </span>
      </div>
      {loading ? (
        <div className="mt-4 h-7 w-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-white/[0.06]" />
      ) : (
        <p className="mt-4 text-[26px] font-extrabold leading-none tracking-tight text-neutral-900 dark:text-white">{value}</p>
      )}
      <p className="mt-1.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">{sub}</p>}
    </div>
  )
}

const BOOKING_BADGE: Record<string, string> = {
  confirmed:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  checked_in:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  checked_out: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  cancelled:   'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  pending:     'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}
const ORDER_BADGE: Record<string, string> = {
  open:      'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  preparing: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  ready:     'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  served:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  billed:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  paid:      'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}
const HK_BADGE: Record<string, { cls: string; icon: React.ReactNode }> = {
  completed:   { cls: 'text-emerald-600 dark:text-emerald-400', icon: <CheckCircle2 size={13}/> },
  in_progress: { cls: 'text-amber-600 dark:text-amber-400',     icon: <Loader2 size={13} className="animate-spin"/> },
  pending:     { cls: 'text-neutral-400 dark:text-neutral-500', icon: <Clock size={13}/> },
  skipped:     { cls: 'text-rose-500 dark:text-rose-400',       icon: <AlertCircle size={13}/> },
}

const STATUS_COLOR_PIE: Record<string, string> = {
  available:   '#10b981',
  occupied:    '#6366f1',
  cleaning:    '#f59e0b',
  maintenance: '#ef4444',
  out_of_order:'#6b7280',
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white px-3 py-2.5 shadow-lg dark:border-white/[0.08] dark:bg-[#1e2a3a]">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }}/>
          <span className="capitalize text-neutral-600 dark:text-neutral-300">{p.name}:</span>
          <span className="font-bold text-neutral-800 dark:text-white">${p.value?.toLocaleString?.() ?? p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Card({ title, link, children }: { title: string; link?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-neutral-800 dark:text-white">{title}</h3>
        {link && <Link to={link} className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">View all →</Link>}
      </div>
      {children}
    </div>
  )
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ stats, occupancy, bookings, orders, hkTasks, loading }: {
  stats: DashStats | null; occupancy: OccupancyRow[]; bookings: BookingRow[]
  orders: OrderRow[]; hkTasks: HKRow[]; loading: boolean
}) {
  const pieData = occupancy.map(r => ({
    name: r.status.charAt(0).toUpperCase() + r.status.slice(1),
    value: Number(r.count),
    color: STATUS_COLOR_PIE[r.status] ?? '#94a3b8',
  }))

  const totalRev = (stats?.today_revenue ?? 0) + (stats?.order_revenue ?? 0)

  // Placeholder 7-day bars (backend doesn't have a revenue series yet — we use today's data)
  const revChartData = [
    { day: 'Mon', hotel: 0, restaurant: 0 },
    { day: 'Tue', hotel: 0, restaurant: 0 },
    { day: 'Wed', hotel: 0, restaurant: 0 },
    { day: 'Thu', hotel: 0, restaurant: 0 },
    { day: 'Fri', hotel: 0, restaurant: 0 },
    { day: 'Sat', hotel: 0, restaurant: 0 },
    { day: 'Today', hotel: stats?.today_revenue ?? 0, restaurant: stats?.order_revenue ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="Today's Revenue"   value={`$${totalRev.toLocaleString()}`}
          sub={`Hotel $${stats?.today_revenue ?? 0} · Restaurant $${stats?.order_revenue ?? 0}`}
          change={12.5} icon={Banknote} color="indigo" />
        <StatCard loading={loading} label="Active Bookings"   value={String(stats?.active_bookings ?? 0)}
          sub="Live hotel reservations" change={8.3} icon={BedDouble} color="sky" />
        <StatCard loading={loading} label="Restaurant Orders" value={String(stats?.order_count ?? 0)}
          sub={`$${stats?.order_revenue ?? 0} revenue today`} change={-2.1} icon={Receipt} color="amber" />
        <StatCard loading={loading} label="Occupancy Rate"    value={`${stats?.occupancy_pct ?? 0}%`}
          sub={`${stats?.occupied_rooms ?? 0} / ${stats?.total_rooms ?? 0} rooms`}
          change={3.4} icon={Gauge} color="emerald" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="col-span-1 xl:col-span-2 rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-neutral-800 dark:text-white">Revenue Overview</h3>
              <p className="mt-0.5 text-[12px] text-neutral-400">This week · Hotel + Restaurant</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200/60 bg-neutral-50 px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <TrendingUp size={13} className="text-emerald-500"/>
              <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">Live</span>
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-100 dark:text-white/[0.05]" vertical={false}/>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}/>
                <Area type="monotone" dataKey="hotel"      name="Hotel"      stroke="#6366f1" strokeWidth={2.5} fill="url(#hg)" dot={false} activeDot={{ r: 4 }}/>
                <Area type="monotone" dataKey="restaurant" name="Restaurant" stroke="#f59e0b" strokeWidth={2.5} fill="url(#rg)" dot={false} activeDot={{ r: 4 }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <h3 className="mb-4 text-[14px] font-bold text-neutral-800 dark:text-white">Room Status</h3>
          {pieData.length > 0 ? (
            <>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent"/>)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} rooms`, n]} contentStyle={{ borderRadius: 10, fontSize: 12 }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2">
                {pieData.map(r => (
                  <div key={r.name} className="flex items-center justify-between text-[12.5px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }}/>
                      <span className="text-neutral-600 dark:text-neutral-300">{r.name}</span>
                    </div>
                    <span className="font-bold text-neutral-800 dark:text-white">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-neutral-400 text-sm">Loading…</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Recent Bookings */}
        <div className="col-span-1 xl:col-span-3 rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-neutral-800 dark:text-white">Recent Bookings</h3>
            <Link to="/hotel/bookings" className="text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">View all →</Link>
          </div>
          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_,i)=><div key={i} className="h-8 animate-pulse rounded-lg bg-neutral-100 dark:bg-white/[0.05]"/>)}</div>
          ) : bookings.length === 0 ? (
            <p className="text-center text-[13px] text-neutral-400 py-6">No bookings yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                    {['Ref','Guest','Room','Check-in','Status'].map(h=>(
                      <th key={h} className="pb-3 pr-3 text-left font-semibold text-neutral-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.03]">
                  {bookings.slice(0,5).map(b=>(
                    <tr key={b.id} className="hover:bg-neutral-50/60 dark:hover:bg-white/[0.02]">
                      <td className="py-3 pr-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{b.reference_number}</td>
                      <td className="py-3 pr-3 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{b.guest_name ?? '—'}</td>
                      <td className="py-3 pr-3 text-neutral-500 whitespace-nowrap">{b.room_number ?? '—'}</td>
                      <td className="py-3 pr-3 text-neutral-500 whitespace-nowrap">{b.check_in_date?.slice(0,10)}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${BOOKING_BADGE[b.status]??''}`}>
                          {b.status.replace('_',' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="col-span-1 xl:col-span-2 rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-neutral-800 dark:text-white">Latest Orders</h3>
            <Link to="/restaurant/orders" className="text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">View all →</Link>
          </div>
          {orders.length === 0 && !loading ? (
            <p className="text-center text-[13px] text-neutral-400 py-6">No orders today</p>
          ) : (
            <div className="space-y-3">
              {orders.slice(0,5).map(o=>(
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 p-3 hover:bg-amber-50/30 dark:border-white/[0.05] dark:hover:bg-amber-500/[0.04] transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15">
                    <UtensilsCrossed size={14} className="text-amber-600 dark:text-amber-400"/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12.5px] font-bold text-neutral-800 dark:text-neutral-200">{o.order_number}</p>
                      <p className="text-[12.5px] font-bold text-neutral-800 dark:text-white">${Number(o.total_amount).toFixed(2)}</p>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <p className="text-[11.5px] text-neutral-400">{new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${ORDER_BADGE[o.status]??''}`}>{o.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Housekeeping */}
      <Card title="Today's Housekeeping" link="/hotel/housekeeping">
        {hkTasks.length === 0 && !loading ? (
          <p className="text-center text-[13px] text-neutral-400 py-4">No tasks scheduled today</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {hkTasks.slice(0,6).map(t => {
              const s = HK_BADGE[t.status] ?? { cls: '', icon: null }
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 px-3.5 py-2.5 dark:border-white/[0.05]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15 text-[12px] font-black text-sky-700 dark:text-sky-400">
                    {t.room_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-200 capitalize">{t.task_type.replace(/_/g,' ')}</p>
                    <p className="text-[11px] text-neutral-400">{t.assigned_to_name ?? 'Unassigned'}</p>
                  </div>
                  <div className={`flex items-center gap-1 text-[12px] font-medium ${s.cls}`}>
                    {s.icon}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Tab: Hotel ───────────────────────────────────────────────────────────────

function HotelTab({ stats, occupancy, bookings, hkTasks, loading }: {
  stats: DashStats | null; occupancy: OccupancyRow[]; bookings: BookingRow[]; hkTasks: HKRow[]; loading: boolean
}) {
  const pieData = occupancy.map(r => ({
    name: r.status.charAt(0).toUpperCase() + r.status.slice(1),
    value: Number(r.count),
    color: STATUS_COLOR_PIE[r.status] ?? '#94a3b8',
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="Hotel Revenue Today" value={`$${stats?.today_revenue ?? 0}`}
          sub="Room charges + extras" change={12.5} icon={Banknote} color="indigo"/>
        <StatCard loading={loading} label="Active Bookings"     value={String(stats?.active_bookings ?? 0)}
          sub="Confirmed + checked in" change={8.3} icon={BedDouble} color="sky"/>
        <StatCard loading={loading} label="Occupancy Rate"      value={`${stats?.occupancy_pct ?? 0}%`}
          sub={`${stats?.occupied_rooms ?? 0} of ${stats?.total_rooms ?? 0} rooms`} change={3.4} icon={Gauge} color="emerald"/>
        <StatCard loading={loading} label="Avg Stay Duration"   value="2.4 nts"
          sub="Per guest" change={-1.2} icon={Hourglass} color="amber"/>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="col-span-1 xl:col-span-2 rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <h3 className="mb-1 text-[14px] font-bold text-neutral-800 dark:text-white">Room Availability</h3>
          <p className="mb-5 text-[12px] text-neutral-400">Current status breakdown</p>
          {pieData.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pieData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-100 dark:text-white/[0.05]" vertical={false}/>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                  <Tooltip/>
                  <Bar dataKey="value" name="Rooms" radius={[6,6,0,0]}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-neutral-400">Loading room data…</div>
          )}
        </div>

        <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
          <h3 className="mb-4 text-[14px] font-bold text-neutral-800 dark:text-white">Room Status</h3>
          {pieData.length > 0 ? (
            <>
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={66} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent"/>)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} rooms`, n]} contentStyle={{ borderRadius: 10, fontSize: 12 }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-1.5">
                {pieData.map(r => (
                  <div key={r.name} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.color }}/>
                      <span className="text-neutral-600 dark:text-neutral-300">{r.name}</span>
                    </div>
                    <span className="font-bold text-neutral-800 dark:text-white">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Recent Bookings" link="/hotel/bookings">
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-8 animate-pulse rounded-lg bg-neutral-100 dark:bg-white/[0.05]"/>)}</div>
          ) : bookings.length === 0 ? (
            <p className="text-center py-6 text-[13px] text-neutral-400">No bookings yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                    {['Ref','Guest','Room','Check-in','Status'].map(h=>(
                      <th key={h} className="pb-3 pr-3 text-left font-semibold text-neutral-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.03]">
                  {bookings.slice(0,6).map(b=>(
                    <tr key={b.id} className="hover:bg-neutral-50/60 dark:hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{b.reference_number}</td>
                      <td className="py-2.5 pr-3 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{b.guest_name ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-neutral-500 whitespace-nowrap">{b.room_number ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-neutral-500 whitespace-nowrap">{b.check_in_date?.slice(0,10)}</td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${BOOKING_BADGE[b.status]??''}`}>
                          {b.status.replace('_',' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Housekeeping Tasks" link="/hotel/housekeeping">
          <div className="space-y-2.5">
            {hkTasks.slice(0,6).map(t => {
              const s = HK_BADGE[t.status] ?? { cls: '', icon: null }
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 px-3.5 py-2.5 dark:border-white/[0.05]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/15 text-[12px] font-black text-sky-700 dark:text-sky-400">
                    {t.room_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-200 capitalize">{t.task_type.replace(/_/g,' ')}</p>
                    <p className="text-[11px] text-neutral-400">{t.assigned_to_name ?? 'Unassigned'}</p>
                  </div>
                  <div className={`flex items-center gap-1 text-[12px] font-medium capitalize ${s.cls}`}>
                    {s.icon}
                    <span className="hidden sm:inline">{t.status.replace('_',' ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── Tab: Restaurant ──────────────────────────────────────────────────────────

function RestaurantTab({ stats, orders, loading }: {
  stats: DashStats | null; orders: OrderRow[]; loading: boolean
}) {
  const openOrders    = orders.filter(o => ['open','preparing','ready'].includes(o.status)).length
  const servedOrders  = orders.filter(o => o.status === 'served').length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="Restaurant Revenue" value={`$${stats?.order_revenue ?? 0}`}
          sub="Today's food & beverage" change={-2.1} icon={Banknote} color="amber"/>
        <StatCard loading={loading} label="Orders Today"       value={String(stats?.order_count ?? 0)}
          sub={`${openOrders} active · ${servedOrders} served`} change={5.2} icon={Receipt} color="indigo"/>
        <StatCard loading={loading} label="Active Tables"      value={String(openOrders)}
          sub="Tables with open orders" change={0} icon={Table2} color="sky"/>
        <StatCard loading={loading} label="Top Item Today"     value="—"
          sub="Check menu analytics" change={14.3} icon={ChefHat} color="emerald"/>
      </div>

      <Card title="Active Orders" link="/restaurant/orders">
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_,i)=><div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-100 dark:bg-white/[0.05]"/>)}</div>
        ) : orders.length === 0 ? (
          <p className="text-center py-6 text-[13px] text-neutral-400">No orders today</p>
        ) : (
          <div className="space-y-3">
            {orders.slice(0,8).map(o=>(
              <div key={o.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 p-3 hover:bg-amber-50/30 dark:border-white/[0.05] dark:hover:bg-amber-500/[0.04] transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15">
                  <UtensilsCrossed size={14} className="text-amber-600 dark:text-amber-400"/>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[12.5px] font-bold text-neutral-800 dark:text-neutral-200">{o.order_number}</p>
                    <p className="text-[12.5px] font-bold text-neutral-800 dark:text-white">${Number(o.total_amount).toFixed(2)}</p>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <p className="text-[11.5px] text-neutral-400">{new Date(o.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${ORDER_BADGE[o.status]??''}`}>{o.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'hotel' | 'restaurant'

const TABS: { key: TabKey; label: string; icon: React.ReactNode; activeColor: string }[] = [
  { key: 'overview',   label: 'Overview',   icon: <TrendingUp size={15}/>,      activeColor: 'text-indigo-600 dark:text-indigo-400'  },
  { key: 'hotel',      label: 'Hotel',      icon: <Hotel size={15}/>,           activeColor: 'text-sky-600 dark:text-sky-400'        },
  { key: 'restaurant', label: 'Restaurant', icon: <UtensilsCrossed size={15}/>, activeColor: 'text-amber-600 dark:text-amber-400'    },
]

export default function Dashboard() {
  const [tab, setTab] = useState<TabKey>('overview')
  const { user } = useAuthContext()
  const branchType = user?.current_branch?.branch_type ?? 'both'
  const role = user?.current_branch?.role ?? user?.role
  // Same rule the sidebar already uses (components/Layout.tsx) — a
  // housekeeper or waiter gets their own hotel-only / restaurant-only
  // dashboard instead of the combined "both" overview, even on a branch
  // that runs both. Roles with no ops access at all (accountant,
  // inventory_manager, report_viewer…) fall back to seeing both rather than
  // an empty dashboard, since there's no dedicated Finance/Inventory tab here.
  const roleHasAnyOps = !role || roleHasModule(role, 'hotel') || roleHasModule(role, 'restaurant')
  const canSeeHotel      = branchType !== 'restaurant' && (!roleHasAnyOps || !role || roleHasModule(role, 'hotel'))
  const canSeeRestaurant = branchType !== 'hotel'      && (!roleHasAnyOps || !role || roleHasModule(role, 'restaurant'))

  const [stats,    setStats]    = useState<DashStats | null>(null)
  const [occupancy,setOccupancy]= useState<OccupancyRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [orders,   setOrders]   = useState<OrderRow[]>([])
  const [hkTasks,  setHKTasks]  = useState<HKRow[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!canSeeHotel && tab !== 'restaurant') setTab('restaurant')
    if (!canSeeRestaurant && tab !== 'hotel') setTab('hotel')
  }, [canSeeHotel, canSeeRestaurant, tab])

  useEffect(() => {
    let alive = true
    const today = new Date().toISOString().slice(0,10)
    setLoading(true)
    Promise.all([
      api.get('/dashboard/stats'),
      canSeeHotel ? api.get('/dashboard/occupancy') : Promise.resolve({ data: { data: [] } }),
      canSeeHotel ? api.get('/hotel/bookings') : Promise.resolve({ data: { data: [] } }),
      canSeeRestaurant ? api.get('/restaurant/orders') : Promise.resolve({ data: { data: [] } }),
      canSeeHotel ? api.get(`/hotel/housekeeping?date=${today}`) : Promise.resolve({ data: { data: [] } }),
    ]).then(([s, o, b, ord, hk]) => {
      if (!alive) return
      setStats(s.data.data)
      setOccupancy(o.data.data)
      setBookings(b.data.data)
      setOrders(ord.data.data)
      setHKTasks(hk.data.data)
    }).catch(console.error)
     .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [canSeeHotel, canSeeRestaurant])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const greeting = greetingInfo()
  const visibleTabs = TABS.filter(t =>
    t.key === 'overview' ? canSeeHotel && canSeeRestaurant :
    t.key === 'hotel' ? canSeeHotel : canSeeRestaurant
  )

  const initials = user?.full_name
    ?.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase() ?? '?'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-neutral-900 dark:text-white">
            {greeting.title}, {firstName(user?.full_name)} 👋
          </h1>
          <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">{today} · {greeting.message}</p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-white px-3 py-2 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
            <CalendarDays size={14} className="text-indigo-500"/>
            <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">Today's Overview</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-neutral-200/60 bg-white px-3 py-2 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">
            {user?.organization_logo ? (
              <img src={user.organization_logo} alt="" className="h-6 w-6 rounded-lg object-cover ring-1 ring-neutral-200 dark:ring-white/10"/>
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-black text-white">
                {initials}
              </div>
            )}
            <div className="leading-none">
              <p className="text-[12px] font-bold text-neutral-800 dark:text-neutral-100">{user?.full_name ?? 'User'}</p>
              <p className="mt-0.5 text-[10px] capitalize text-neutral-400">{user?.current_branch?.role?.replace(/_/g,' ') ?? 'Admin'}</p>
            </div>
            <UserCircle2 size={14} className="text-neutral-300 dark:text-neutral-600"/>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-xl border border-neutral-200/60 bg-white p-1 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333] w-fit">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all ${
              tab === t.key
                ? 'bg-neutral-100 dark:bg-white/[0.08] ' + t.activeColor
                : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <span className={tab === t.key ? t.activeColor : 'text-neutral-400'}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'   && canSeeHotel && canSeeRestaurant && <OverviewTab    stats={stats} occupancy={occupancy} bookings={bookings} orders={orders} hkTasks={hkTasks} loading={loading}/>}
      {tab === 'hotel'      && canSeeHotel && <HotelTab       stats={stats} occupancy={occupancy} bookings={bookings} hkTasks={hkTasks} loading={loading}/>}
      {tab === 'restaurant' && canSeeRestaurant && <RestaurantTab  stats={stats} orders={orders} loading={loading}/>}
    </div>
  )
}
