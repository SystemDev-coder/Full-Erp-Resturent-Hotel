import { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, ChevronsLeft, ChevronsRight, Pencil, Trash2, Eye, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DTColumn<T = any> {
  key: string
  label: string
  sortable?: boolean
  render?: (row: T, i: number) => React.ReactNode
  exportValue?: (row: T) => string | number
  className?: string
  headerClassName?: string
}

// Configurable per-page-table action set — pass to `rowActions` and DataTable
// renders a consistent, right-aligned Actions column. Each `show*` flag can be
// a boolean or a per-row predicate (e.g. showEdit: row => row.status !== 'cancelled').
export interface RowActionsConfig<T = any> {
  onView?: (row: T) => void
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  onActivate?: (row: T) => void
  onUnlock?: (row: T) => void
  showView?: boolean | ((row: T) => boolean)
  showEdit?: boolean | ((row: T) => boolean)
  showDelete?: boolean | ((row: T) => boolean)
  showActivate?: boolean | ((row: T) => boolean)
  showUnlock?: boolean | ((row: T) => boolean)
}

function resolveShow<T>(flag: boolean | ((row: T) => boolean) | undefined, row: T): boolean {
  if (flag === undefined) return false
  return typeof flag === 'function' ? flag(row) : flag
}

const ACT_BTN = "flex h-7 w-7 items-center justify-center rounded-lg transition-colors"

function RowActionsCell<T>({ row, config }: { row: T; config: RowActionsConfig<T> }) {
  const showView     = resolveShow(config.showView, row)
  const showEdit     = resolveShow(config.showEdit, row)
  const showDelete   = resolveShow(config.showDelete, row)
  const showActivate = resolveShow(config.showActivate, row)
  const showUnlock   = resolveShow(config.showUnlock, row)

  return (
    <div className="flex items-center justify-end gap-1.5">
      {showActivate && (
        <button title="Activate" onClick={() => config.onActivate?.(row)}
          className={`${ACT_BTN} bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400`}>
          <ShieldCheck size={14}/>
        </button>
      )}
      {showUnlock && (
        <button title="Unlock" onClick={() => config.onUnlock?.(row)}
          className={`${ACT_BTN} bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400`}>
          <KeyRound size={14}/>
        </button>
      )}
      {showView && (
        <button title="View" onClick={() => config.onView?.(row)}
          className={`${ACT_BTN} bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/[0.1]`}>
          <Eye size={14}/>
        </button>
      )}
      {showEdit && (
        <button title="Edit" onClick={() => config.onEdit?.(row)}
          className={`${ACT_BTN} bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400`}>
          <Pencil size={14}/>
        </button>
      )}
      {showDelete && (
        <button title="Delete" onClick={() => config.onDelete?.(row)}
          className={`${ACT_BTN} bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400`}>
          <Trash2 size={14}/>
        </button>
      )}
    </div>
  )
}

interface DataTableProps<T = any> {
  columns: DTColumn<T>[]
  data: T[]
  title?: string
  filename?: string
  searchPlaceholder?: string
  rowKey?: (row: T, i: number) => string
  actions?: React.ReactNode
  rowActions?: RowActionsConfig<T>
  defaultPageSize?: number
  loading?: boolean
  // Backend "Load More" — fetches the next batch (see useLoadMore) and appends
  // it to `data` without a full page reload. Omit entirely for tables that
  // don't opt into it; the button only renders when onLoadMore is provided.
  onLoadMore?: () => void
  hasMore?: boolean
  loadingMore?: boolean
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportToExcel<T>(columns: DTColumn<T>[], data: T[], filename: string) {
  const exportCols = columns.filter(c => c.key !== '_actions')
  const rows = data.map(row =>
    Object.fromEntries(exportCols.map(c => [
      c.label,
      c.exportValue ? c.exportValue(row) : (row as any)[c.key] ?? '',
    ]))
  )
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function exportToPDF<T>(columns: DTColumn<T>[], data: T[], filename: string, title: string) {
  const exportCols = columns.filter(c => c.key !== '_actions')
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22)

  autoTable(doc, {
    startY: 28,
    head: [exportCols.map(c => c.label)],
    body: data.map(row =>
      exportCols.map(c =>
        c.exportValue ? String(c.exportValue(row)) : String((row as any)[c.key] ?? '')
      )
    ),
    styles:         { fontSize: 8, cellPadding: 3 },
    headStyles:     { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 255] },
    tableLineColor: [220, 220, 230],
    tableLineWidth: 0.1,
  })

  doc.save(`${filename}.pdf`)
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export function DataTable<T = any>({
  columns,
  data,
  title = 'Data',
  filename,
  searchPlaceholder = 'Search…',
  rowKey,
  actions,
  rowActions,
  defaultPageSize = 10,
  loading = false,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: DataTableProps<T>) {
  const [search,   setSearch]   = useState('')
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [page,     setPage]     = useState(1)
  const [sortKey,  setSortKey]  = useState<string | null>(null)
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc')
  const [exportOpen, setExportOpen] = useState(false)

  const exportFile = filename ?? title.toLowerCase().replace(/\s+/g, '_')

  // Auto-append a consistent Actions column when the page opts into `rowActions`
  const cols: DTColumn<T>[] = useMemo(() => {
    if (!rowActions) return columns
    return [...columns, {
      key: '_actions', label: 'Actions', sortable: false,
      headerClassName: 'text-right', className: 'text-right',
      render: (row: T) => <RowActionsCell row={row} config={rowActions}/>,
    }]
  }, [columns, rowActions])

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(row =>
      cols.some(col => {
        if (col.key === '_actions') return false
        const val = col.exportValue
          ? String(col.exportValue(row))
          : String((row as any)[col.key] ?? '')
        return val.toLowerCase().includes(q)
      })
    )
  }, [data, search, cols])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const col = cols.find(c => c.key === sortKey)
      const av = col?.exportValue ? String(col.exportValue(a)) : String((a as any)[sortKey] ?? '')
      const bv = col?.exportValue ? String(col.exportValue(b)) : String((b as any)[sortKey] ?? '')
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir, cols])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const from       = (safePage - 1) * pageSize
  const paged      = pageSize === 0 ? sorted : sorted.slice(from, from + pageSize)

  const visiblePages = useMemo(() => {
    const pages: number[] = []
    const delta = 2
    for (let i = Math.max(1, safePage - delta); i <= Math.min(totalPages, safePage + delta); i++) {
      pages.push(i)
    }
    return pages
  }, [safePage, totalPages])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handlePageSize(v: number) { setPageSize(v); setPage(1) }

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333]">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 dark:border-white/[0.05]">

        {/* Left: page size + search */}
        <div className="flex items-center gap-3">
          {/* Show entries */}
          <div className="flex items-center gap-2 text-[12.5px] text-neutral-500 dark:text-neutral-400">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={e => handlePageSize(Number(e.target.value))}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[12px] font-semibold text-neutral-700 outline-none focus:border-indigo-400 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-neutral-200"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              <option value={0}>All</option>
            </select>
            <span>entries</span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/>
            <input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-52 rounded-lg border border-neutral-200/60 bg-neutral-50 pl-8 pr-3 text-[12.5px] outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-neutral-500"
            />
          </div>
        </div>

        {/* Right: extra actions + export */}
        <div className="flex items-center gap-2">
          {actions}

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(v => !v)}
              className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-3.5 py-2 text-[12.5px] font-semibold text-neutral-600 transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
            >
              <Download size={14}/>
              Export
              <ChevronDown size={12} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`}/>
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)}/>
                <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-neutral-200/60 bg-white py-1 shadow-xl dark:border-white/[0.08] dark:bg-[#1a2235]">
                  <button
                    onClick={() => { exportToExcel(cols, sorted, exportFile); setExportOpen(false) }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-neutral-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                  >
                    <FileSpreadsheet size={15} className="text-emerald-500"/>
                    Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => { exportToPDF(cols, sorted, exportFile, title); setExportOpen(false) }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-neutral-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                  >
                    <FileText size={15} className="text-rose-500"/>
                    PDF (.pdf)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
              {cols.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-5 py-3 text-left font-semibold text-neutral-400 dark:text-neutral-500 whitespace-nowrap select-none ${col.sortable !== false ? 'cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300' : ''} ${col.headerClassName ?? ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.sortable !== false && (
                      <span className="flex flex-col opacity-50">
                        <ChevronUp   size={10} className={sortKey === col.key && sortDir === 'asc'  ? 'opacity-100 text-indigo-500' : ''}/>
                        <ChevronDown size={10} className={sortKey === col.key && sortDir === 'desc' ? 'opacity-100 text-indigo-500' : ''} style={{ marginTop: -3 }}/>
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.03]">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {cols.map(col => (
                    <td key={col.key} className="px-5 py-3">
                      <div className="h-4 rounded-lg bg-neutral-100 dark:bg-white/[0.06]"/>
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-5 py-12 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
                  No records found{search ? ` for "${search}"` : ''}
                </td>
              </tr>
            ) : paged.map((row, i) => (
              <tr key={rowKey ? rowKey(row, i) : i}
                className="hover:bg-neutral-50/60 dark:hover:bg-white/[0.02] transition-colors">
                {cols.map(col => (
                  <td key={col.key} className={`px-5 py-3 ${col.className ?? ''}`}>
                    {col.render
                      ? col.render(row, from + i)
                      : String((row as any)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer: info + pagination ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3.5 dark:border-white/[0.05]">
        <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
          {sorted.length === 0
            ? 'No entries'
            : pageSize === 0
              ? `Showing all ${sorted.length} entries`
              : `Showing ${from + 1}–${Math.min(from + pageSize, sorted.length)} of ${sorted.length} entries`
          }
          {search && ` (filtered from ${data.length} total)`}
        </p>

        {totalPages > 1 && pageSize !== 0 && (
          <div className="flex items-center gap-1">
            <PagBtn onClick={() => setPage(1)} disabled={safePage === 1}><ChevronsLeft size={13}/></PagBtn>
            <PagBtn onClick={() => setPage(p => Math.max(1, p-1))} disabled={safePage === 1}><ChevronLeft size={13}/></PagBtn>

            {visiblePages[0] > 1 && (
              <><PagBtn onClick={() => setPage(1)}>1</PagBtn>{visiblePages[0] > 2 && <span className="px-1 text-neutral-400">…</span>}</>
            )}
            {visiblePages.map(p => (
              <PagBtn key={p} active={p === safePage} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            {visiblePages[visiblePages.length-1] < totalPages && (
              <>{visiblePages[visiblePages.length-1] < totalPages-1 && <span className="px-1 text-neutral-400">…</span>}<PagBtn onClick={() => setPage(totalPages)}>{totalPages}</PagBtn></>
            )}

            <PagBtn onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={safePage === totalPages}><ChevronRight size={13}/></PagBtn>
            <PagBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages}><ChevronsRight size={13}/></PagBtn>
          </div>
        )}
      </div>

      {/* ── Load More: fetches the next batch from the server ── */}
      {onLoadMore && (
        <div className="flex items-center justify-center border-t border-neutral-100 px-5 py-4 dark:border-white/[0.05]">
          {hasMore ? (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-5 py-2 text-[12.5px] font-semibold text-neutral-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
            >
              {loadingMore ? <RefreshCw size={14} className="animate-spin"/> : <ChevronDown size={14}/>}
              {loadingMore ? 'Loading…' : 'Load More'}
            </button>
          ) : !loading && data.length > 0 ? (
            <p className="text-[11.5px] text-neutral-400">All records loaded</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function PagBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-[12px] font-semibold transition-all ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : disabled
            ? 'cursor-not-allowed text-neutral-300 dark:text-neutral-600'
            : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]'
      }`}
    >
      {children}
    </button>
  )
}