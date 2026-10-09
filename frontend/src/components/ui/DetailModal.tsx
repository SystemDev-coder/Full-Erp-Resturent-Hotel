import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Download, Printer, RefreshCw, Search, X } from 'lucide-react'
import api, { getApiErrorMessage } from '@/services/api'
import { useAuthContext } from '@/contexts/AuthContext'
import type { OrgInfo } from '@utils/print'
import { printDetail } from '@utils/printDetail'
import { money, fmtDate, fmtDateTime, label, type ColType } from '@utils/detailFormat'

// "Click a card → see the rows behind the number". One modal renders every
// dashboard card and every report card from the same generic payload
// (see server/src/utils/detail.ts), so adding a card never needs new UI code.

interface Column  { key: string; label: string; type?: ColType; align?: 'left' | 'right' | 'center' }
interface Summary { label: string; value: string | number; type?: 'text' | 'money' | 'number' }
interface Payload {
  title: string; subtitle?: string; summary?: Summary[]
  columns: Column[]; rows: Record<string, unknown>[]; empty?: string
  link?: { to: string; label: string }
}

// Soft pastel chips — same family as the dashboard cards
const TONE = {
  mint:   'bg-[#dcf2e6] text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]',
  sky:    'bg-[#dcebfb] text-[#25588f] dark:bg-[#1e3350] dark:text-[#9cc8f5]',
  butter: 'bg-[#fcf0c8] text-[#7d5f08] dark:bg-[#3b3417] dark:text-[#f2d479]',
  peach:  'bg-[#fde3d0] text-[#9a4b1c] dark:bg-[#3d2a1d] dark:text-[#f7b98a]',
  lilac:  'bg-[#e8e0fa] text-[#5a43a6] dark:bg-[#2c2749] dark:text-[#c4b5f5]',
  rose:   'bg-[#fbdde3] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]',
  gray:   'bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300',
}
const STATUS_TONE: Record<string, keyof typeof TONE> = {
  paid: 'mint', completed: 'mint', inspected: 'mint', available: 'mint', served: 'mint', checked_in: 'mint', confirmed: 'mint', in: 'mint', Salary: 'mint',
  pending: 'butter', open: 'butter', preparing: 'butter', cleaning: 'butter', issued: 'butter', partially_paid: 'butter', in_progress: 'butter', Expense: 'butter',
  cancelled: 'rose', voided: 'rose', no_show: 'rose', out_of_order: 'rose', maintenance: 'rose', overdue: 'rose', out: 'rose',
  occupied: 'sky', billed: 'sky', hotel: 'sky', stayover_clean: 'sky',
  restaurant: 'peach', ready: 'lilac', checked_out: 'lilac', other: 'lilac', checkout_clean: 'peach',
}

function Cell({ col, value }: { col: Column; value: unknown }) {
  switch (col.type) {
    case 'money':    return <span className="font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{money(value)}</span>
    case 'number':   return <span className="tabular-nums">{Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 3 })}</span>
    case 'date':     return <span className="whitespace-nowrap text-neutral-500 dark:text-neutral-400">{fmtDate(value)}</span>
    case 'datetime': return <span className="whitespace-nowrap text-neutral-500 dark:text-neutral-400">{fmtDateTime(value)}</span>
    case 'status': {
      if (value == null || value === '') return <span className="text-neutral-300">—</span>
      const v = String(value)
      return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${TONE[STATUS_TONE[v] ?? 'gray']}`}>{label(v)}</span>
    }
    default: return <span className="text-neutral-700 dark:text-neutral-200">{value == null || value === '' ? '—' : String(value)}</span>
  }
}

const summaryValue = (s: Summary) =>
  s.type === 'money' ? money(s.value) : s.type === 'number' ? Number(s.value).toLocaleString('en-US') : String(s.value)

interface Props {
  open: boolean
  onClose: () => void
  /** API path that returns a Payload, e.g. `/dashboard/detail/revenue` */
  url: string | null
  /** Shown while the first request is in flight */
  title: string
}

export function DetailModal({ open, onClose, url, title }: Props) {
  const [data, setData]       = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [q, setQ]             = useState('')
  const { user } = useAuthContext()
  const [org, setOrg] = useState<OrgInfo | null>(null)

  useEffect(() => {
    if (!open || !url) return
    let alive = true
    setLoading(true); setError(''); setData(null); setQ('')
    api.get(url)
      .then(r => { if (alive) setData(r.data.data) })
      .catch(e => { if (alive) setError(getApiErrorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, url])

  // Company logo / banner for the printed copy — fetched once, the first time a card is opened
  useEffect(() => {
    if (!open || org) return
    api.get('/system/organization').then(r => setOrg(r.data.data)).catch(() => {})
  }, [open, org])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc) }
  }, [open, onClose])

  const rows = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return data.rows
    return data.rows.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(needle)))
  }, [data, q])

  const printIt = () => {
    if (!data) return
    // Print what is on screen (respects the filter box)
    printDetail(org, { ...data, rows }, user?.full_name ?? user?.email ?? 'User')
  }

  const exportCsv = () => {
    if (!data) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [data.columns.map(c => esc(c.label)).join(','),
      ...rows.map(r => data.columns.map(c => esc(r[c.key])).join(','))].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={data?.title ?? title}>
      <div className="absolute inset-0 bg-[#1b1f33]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#1a2030]">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5 dark:border-white/[0.06]">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-bold tracking-tight text-neutral-900 dark:text-white">{data?.title ?? title}</h2>
            {data?.subtitle && <p className="mt-0.5 text-[12.5px] text-neutral-500 dark:text-neutral-400">{data.subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/[0.06] dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Summary chips */}
        {data?.summary && data.summary.length > 0 && (
          <div className="flex flex-wrap gap-2.5 px-6 pt-4">
            {data.summary.map((s, i) => (
              <div key={s.label} className={`min-w-[120px] rounded-2xl px-4 py-2.5 ${
                [TONE.mint, TONE.sky, TONE.peach, TONE.lilac][i % 4]}`}>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
                <p className="text-[18px] font-bold leading-tight tabular-nums">{summaryValue(s)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar — Print is always available (an empty report is still a valid, dated document) */}
        {data && (
          <div className="flex items-center gap-2.5 px-6 pb-2 pt-4">
            {data.rows.length > 0 && (
              <>
                <div className="relative max-w-xs flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter rows…"
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-[13px] text-neutral-800 outline-none focus:border-indigo-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
                </div>
                <span className="text-[12px] text-neutral-400">{rows.length} of {data.rows.length}</span>
              </>
            )}
            <button onClick={printIt}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-[12px] font-semibold text-neutral-600 transition hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.05]">
              <Printer size={13} /> Print
            </button>
            {data.rows.length > 0 && (
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-[12px] font-semibold text-neutral-600 transition hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.05]">
                <Download size={13} /> CSV
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="min-h-[140px] flex-1 overflow-auto px-6 pb-5">
          {loading && (
            <div className="flex h-40 items-center justify-center"><RefreshCw size={20} className="animate-spin text-neutral-300" /></div>
          )}
          {error && <p className="mt-4 rounded-xl bg-[#fbdde3] px-4 py-3 text-[13px] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]">{error}</p>}
          {data && data.rows.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-white/[0.05]"><Search size={20} /></span>
              <p className="max-w-sm text-[13px] text-neutral-500 dark:text-neutral-400">{data.empty ?? 'Nothing to show for this card yet.'}</p>
            </div>
          )}
          {data && rows.length > 0 && (
            <table className="mt-1 w-full border-separate border-spacing-0 text-[12.5px]">
              <thead>
                <tr>
                  {data.columns.map(c => (
                    <th key={c.key} className={`sticky top-0 z-10 border-b border-neutral-100 bg-white py-2.5 pr-4 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-white/[0.06] dark:bg-[#1a2030] ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="transition-colors hover:bg-neutral-50/80 dark:hover:bg-white/[0.03]">
                    {data.columns.map(c => (
                      <td key={c.key} className={`border-b border-neutral-50 py-2.5 pr-4 dark:border-white/[0.04] ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                        <Cell col={c} value={r[c.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {data?.link && (
          <div className="flex justify-end border-t border-neutral-100 px-6 py-3.5 dark:border-white/[0.06]">
            <Link to={data.link.to} onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl bg-[#e8e0fa] px-4 py-2 text-[13px] font-semibold text-[#5a43a6] transition hover:bg-[#ddd2f6] dark:bg-[#2c2749] dark:text-[#c4b5f5] dark:hover:bg-[#363057]">
              {data.link.label} <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
