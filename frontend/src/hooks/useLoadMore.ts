import { useState, useCallback, useEffect } from 'react'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/api'

interface UseLoadMoreOptions {
  pageSize?: number
}

// Reusable incremental-loading list state, shared by every DataTable page.
//
// Fetches `pageSize` rows at a time via ?limit=&offset= (appended to `url`,
// which may already carry its own query string/filters — e.g.
// `/hotel/housekeeping?date=${date}`). Call `loadMore()` from a "Load More"
// button to append the next page; call `reload()` after a create/edit/delete
// to refresh from the top. `hasMore` comes straight from the backend
// (`{ success, data, hasMore }`) — endpoints that don't return `hasMore` yet
// just report `false`, so the Load More button stays hidden until that
// endpoint is upgraded. Swapping this hook's internals for real server-side
// pagination later needs no changes in the pages that use it.
export function useLoadMore<T = any>(url: string, options: UseLoadMoreOptions = {}) {
  const { pageSize = 50 } = options
  const [items,       setItems]       = useState<T[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore,     setHasMore]     = useState(false)
  const [error,       setError]       = useState('')

  const fetchPage = useCallback(async (offset: number) => {
    const res = await api.get(url, { params: { limit: pageSize, offset } })
    const data: T[] = res.data.data ?? []
    const more: boolean = res.data.hasMore ?? false
    return { data, more }
  }, [url, pageSize])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, more } = await fetchPage(0)
      setItems(data)
      setHasMore(more)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoading(false) }
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    setLoadingMore(true); setError('')
    try {
      const { data, more } = await fetchPage(items.length)
      setItems(prev => [...prev, ...data])
      setHasMore(more)
    } catch (e) { setError(getApiErrorMessage(e)) }
    finally { setLoadingMore(false) }
  }, [fetchPage, items.length])

  useEffect(() => { reload() }, [reload])

  return { items, setItems, loading, loadingMore, hasMore, error, setError, reload, loadMore }
}
