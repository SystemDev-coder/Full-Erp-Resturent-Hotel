import { Request } from 'express'

export interface Pagination { limit: number; offset: number }

// Reads ?limit=&offset= from the query string with safe defaults/bounds.
// Used by list endpoints to support the frontend's "Load More" button —
// and later a full server-side-paginated table with no controller changes.
export function getPagination(req: Request, defaultLimit = 50): Pagination {
  const limit  = Math.min(200, Math.max(1, Number(req.query.limit) || defaultLimit))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  return { limit, offset }
}

// Pass rows fetched with `LIMIT limit + 1` — this trims the lookahead row
// and tells the caller whether more pages exist, without a separate COUNT(*).
export function sliceHasMore<T>(rows: T[], limit: number): { rows: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore }
}
