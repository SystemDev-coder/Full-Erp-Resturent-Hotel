import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ScrollText, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { listLogs } from '@services/adminService'
import type { ActivityLog } from '@services/adminService'
import { getApiErrorMessage } from '@services/api'

const CATEGORIES = ['', 'prediction', 'admin', 'auth']
const fmt = (d: string) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

const categoryBadge: Record<string, string> = {
  prediction: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400',
  admin: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  auth: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  default: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const statusBadge: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  error: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  default: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listLogs({
        page: p,
        limit: 50,
        category: category || undefined,
        user_email: search || undefined,
        action: action || undefined,
      })
      setLogs(res.data.logs)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load audit logs.'))
    } finally {
      setLoading(false)
    }
  }, [page, search, category, action])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">Audit Logs</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {total.toLocaleString()} events recorded
          </p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Filter by user email…"
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-4 text-sm text-neutral-900 placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1) }}
          className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:border-primary-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c || 'All categories'}</option>
          ))}
        </select>
        <input
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
          placeholder="Filter by action…"
          className="h-10 w-40 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 placeholder-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:placeholder-neutral-500"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/60 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-800/30">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Time</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">User</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Action</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Category</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-neutral-400">
                    <ScrollText size={32} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
                    No logs found
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.15) }}
                    className="group hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap font-mono">
                      {fmt(log.created_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate max-w-[160px]">
                        {log.user_name || log.user_email || '—'}
                      </p>
                      {log.user_name && (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[160px]">{log.user_email}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-bold capitalize ${categoryBadge[log.category] ?? categoryBadge.default}`}>
                        {log.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-bold capitalize ${statusBadge[log.status] ?? statusBadge.default}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-neutral-500 dark:text-neutral-400 max-w-[220px]">
                      <span className="truncate block font-mono">
                        {Object.entries(log.details ?? {}).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Page {page} of {pages} · {total} events
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
