import { RefreshCw, ChevronDown } from 'lucide-react'

interface Props {
  hasMore: boolean
  loading?: boolean
  loadingMore: boolean
  onLoadMore: () => void
  count: number
}

// Standalone "Load More" affordance for list/grid pages that don't render
// through <DataTable/> (which has this built into its own footer). Pair with
// the useLoadMore hook — same visual language either way.
export function LoadMoreBar({ hasMore, loading, loadingMore, onLoadMore, count }: Props) {
  if (loading) return null
  if (!hasMore) {
    return count > 0 ? <p className="py-4 text-center text-[11.5px] text-neutral-400">All records loaded</p> : null
  }
  return (
    <div className="flex items-center justify-center py-4">
      <button
        onClick={onLoadMore}
        disabled={loadingMore}
        className="flex items-center gap-2 rounded-xl border border-neutral-200/60 bg-neutral-50 px-5 py-2 text-[12.5px] font-semibold text-neutral-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
      >
        {loadingMore ? <RefreshCw size={14} className="animate-spin"/> : <ChevronDown size={14}/>}
        {loadingMore ? 'Loading…' : 'Load More'}
      </button>
    </div>
  )
}
