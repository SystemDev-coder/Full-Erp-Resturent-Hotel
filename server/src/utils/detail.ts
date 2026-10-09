// Shape returned by every "click a card → see what is behind the number" endpoint
// (dashboard cards and report cards). One generic payload lets the frontend render
// ALL of them with a single modal component — no per-card UI code.

export type ColType = 'text' | 'money' | 'date' | 'datetime' | 'status' | 'number'

export interface DetailColumn {
  key: string
  label: string
  type?: ColType
  align?: 'left' | 'right' | 'center'
}

export interface DetailSummary {
  label: string
  value: string | number
  type?: 'text' | 'money' | 'number'
}

export interface DetailPayload {
  title: string
  subtitle?: string
  summary?: DetailSummary[]
  columns: DetailColumn[]
  rows: Record<string, unknown>[]
  // shown instead of a bare "nothing" when the card has no rows
  empty?: string
  // where the full, editable view of this data lives
  link?: { to: string; label: string }
}

export const col = (key: string, label: string, type: ColType = 'text', align?: DetailColumn['align']): DetailColumn =>
  ({ key, label, type, align: align ?? (type === 'money' || type === 'number' ? 'right' : 'left') })

// Card rows are capped so a click can never pull an unbounded result set
export const DETAIL_LIMIT = 200
