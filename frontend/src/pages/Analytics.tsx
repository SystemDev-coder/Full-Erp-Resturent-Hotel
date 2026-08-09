import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { motion } from 'framer-motion'
import {
  TrendingUp, Users, Brain, Target, Calendar, Activity,
  ArrowUpRight, RefreshCw,
} from 'lucide-react'
import { getAnalyticsOverview, getAnalyticsTrends } from '@services/analyticsService'
import type { OverviewData, TrendsData } from '@services/analyticsService'
import { getApiErrorMessage } from '@services/api'

const DAYS_OPTIONS = [7, 14, 30, 90]

const statCard = (
  label: string,
  value: string | number,
  sub: string,
  icon: React.ReactNode,
  color: string,
  delay: number
) => (
  <motion.div
    key={label}
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`rounded-2xl border bg-white p-5 dark:bg-neutral-900 dark:border-neutral-800/60 border-neutral-200/60`}
  >
    <div className="flex items-start justify-between">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <ArrowUpRight size={14} className="text-neutral-400" />
    </div>
    <p className="mt-4 text-2xl font-black text-neutral-900 dark:text-white">{value}</p>
    <p className="mt-0.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</p>
    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>
  </motion.div>
)

const PIE_COLORS = ['#6366f1', '#22d3ee']

export default function Analytics() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = async (d = days) => {
    setLoading(true)
    setError(null)
    try {
      const [overviewRes, trendsRes] = await Promise.all([
        getAnalyticsOverview(),
        getAnalyticsTrends(d),
      ])
      setOverview(overviewRes.data)
      setTrends(trendsRes.data)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load analytics data.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleDaysChange = (d: number) => {
    setDays(d)
    fetchAll(d)
  }

  const pieData = overview
    ? [
        { name: 'AI', value: overview.ai_predictions },
        { name: 'Human', value: overview.human_predictions },
      ]
    : []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Platform-wide prediction and usage metrics
          </p>
        </div>
        <button
          onClick={() => fetchAll()}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stat cards */}
      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCard('Total Predictions', overview.total_predictions.toLocaleString(), 'All time', <Brain size={18} className="text-primary-600 dark:text-primary-400" />, 'bg-primary-50 dark:bg-primary-500/10', 0)}
          {statCard('Today', overview.today_predictions.toLocaleString(), 'Last 24 hours', <Activity size={18} className="text-emerald-600 dark:text-emerald-400" />, 'bg-emerald-50 dark:bg-emerald-500/10', 0.05)}
          {statCard('Total Users', overview.total_users.toLocaleString(), `${overview.active_users} active`, <Users size={18} className="text-violet-600 dark:text-violet-400" />, 'bg-violet-50 dark:bg-violet-500/10', 0.1)}
          {statCard('Avg Confidence', `${overview.avg_confidence}%`, 'Across all models', <Target size={18} className="text-amber-600 dark:text-amber-400" />, 'bg-amber-50 dark:bg-amber-500/10', 0.15)}
        </div>
      )}

      {loading && !overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily predictions area chart */}
        <div className="lg:col-span-2 rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-neutral-800/60 dark:bg-neutral-900">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Prediction Trend</p>
              <h3 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">Daily Predictions</h3>
            </div>
            <div className="flex gap-1.5 rounded-xl border border-neutral-200 p-1 dark:border-neutral-700">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => handleDaysChange(d)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    days === d
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="h-56 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trends?.daily_predictions ?? []}>
                <defs>
                  <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="humanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="ai" name="AI" stroke="#6366f1" fill="url(#aiGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="human" name="Human" stroke="#22d3ee" fill="url(#humanGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-neutral-800/60 dark:bg-neutral-900">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Distribution</p>
          <h3 className="mt-1 mb-5 text-lg font-bold text-neutral-900 dark:text-white">AI vs Human</h3>
          {loading ? (
            <div className="h-48 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} innerRadius={50} outerRadius={78} dataKey="value" paddingAngle={4}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {pieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-semibold text-neutral-600 dark:text-neutral-400">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                      {entry.name}
                    </span>
                    <span className="font-bold text-neutral-800 dark:text-neutral-200">
                      {overview ? (entry.name === 'AI' ? overview.ai_detection_rate : overview.human_detection_rate) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top models */}
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-neutral-800/60 dark:bg-neutral-900">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Top Models</p>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={overview?.top_models ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 10 }} width={120} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* User signups */}
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-neutral-800/60 dark:bg-neutral-900">
          <div className="mb-4 flex items-center gap-2">
            <Calendar size={15} className="text-neutral-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">User Signups</p>
          </div>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trends?.user_signups ?? []}>
                <defs>
                  <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="signups" name="Signups" stroke="#a855f7" fill="url(#signupGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Month summary */}
      {overview && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 rounded-2xl border border-neutral-200/60 bg-white px-6 py-4 dark:border-neutral-800/60 dark:bg-neutral-900"
        >
          <TrendingUp size={18} className="shrink-0 text-primary-500" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            <span className="font-bold text-neutral-900 dark:text-white">{overview.month_predictions.toLocaleString()}</span>{' '}
            predictions this month across{' '}
            <span className="font-bold text-neutral-900 dark:text-white">{overview.active_users}</span> active users.
            AI detection rate:{' '}
            <span className="font-bold text-primary-600 dark:text-primary-400">{overview.ai_detection_rate}%</span>
          </p>
        </motion.div>
      )}
    </div>
  )
}
