// Formatting shared by the click-through modal (screen) and its printed version.

export type ColType = 'text' | 'money' | 'date' | 'datetime' | 'status' | 'number'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n: number) => String(n).padStart(2, '0')

// Negative amounts read "-$100.00" (not "$-100.00")
export const money = (v: unknown) => {
  const n = Number(v ?? 0)
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const fmtDate = (v: unknown) => {
  if (!v) return '—'
  const s = String(v)
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s)
  return Number.isNaN(d.getTime()) ? s : `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
}

export const fmtDateTime = (v: unknown) => {
  if (!v) return '—'
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? String(v) : `${d.getDate()} ${MON[d.getMonth()]}, ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export const label = (s: string) => s.replace(/_/g, ' ')

// Plain-text rendering of a cell (used by the printed document)
export function cellText(type: ColType | undefined, value: unknown): string {
  if (value == null || value === '') return '—'
  switch (type) {
    case 'money':    return money(value)
    case 'number':   return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })
    case 'date':     return fmtDate(value)
    case 'datetime': return fmtDateTime(value)
    case 'status':   return label(String(value))
    default:         return String(value)
  }
}
