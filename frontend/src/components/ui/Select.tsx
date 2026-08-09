import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

// Custom searchable dropdown rendered via portal so modal overflow never clips it.
export function Select({ value, onChange, options, placeholder, disabled, autoFocus }: Props) {
  const [open,   setOpen]   = useState(false)
  const [rect,   setRect]   = useState<DOMRect | null>(null)
  const [up,     setUp]     = useState(false)
  const [search, setSearch] = useState('')

  const btnRef    = useRef<HTMLButtonElement>(null)
  const dropRef   = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  // autoFocus the trigger button on mount
  useEffect(() => {
    if (autoFocus) btnRef.current?.focus()
  }, [autoFocus])

  // Auto-focus the search box whenever the dropdown opens
  useEffect(() => {
    if (open) {
      // small delay so the portal renders before we focus
      const t = setTimeout(() => searchRef.current?.focus(), 30)
      return () => clearTimeout(t)
    } else {
      setSearch('')
    }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setRect(r)
      // estimate dropdown height: search bar (44) + options (42 each, max 5 visible) + padding
      const optH   = Math.min(options.length, 5) * 42
      const needed = 44 + optH + 8
      setUp(window.innerHeight - r.bottom < needed + 8)
    }
    setOpen(o => !o)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  // Filter options by search text
  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const pick = (v: string) => { onChange(v); setOpen(false) }

  const dropStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    left:  rect.left,
    width: rect.width,
    zIndex: 9999,
    ...(up
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
  } : {}

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        tabIndex={0}
        className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-[13px] text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-indigo-400 ring-2 ring-indigo-100 dark:border-indigo-500 dark:ring-indigo-500/25'
            : 'border-neutral-200 dark:border-white/[0.08]'
        } bg-neutral-50 dark:bg-white/[0.04]`}
      >
        <span className={selected ? 'text-neutral-800 dark:text-white truncate' : 'text-neutral-400 dark:text-neutral-500'}>
          {selected ? selected.label : (placeholder ?? '—')}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 ml-2 text-neutral-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={dropStyle}
          className="rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-white/[0.10] dark:bg-[#1c2333] overflow-hidden"
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-white/[0.07] px-3 py-2">
            <Search size={13} className="shrink-0 text-neutral-400"/>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-[13px] text-neutral-800 placeholder-neutral-400 outline-none dark:text-white dark:placeholder-neutral-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                className="shrink-0 text-[13px] font-bold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-[210px] overflow-y-auto py-1 overscroll-contain">
            {/* Clear / placeholder option */}
            {placeholder !== undefined && !search && (
              <button
                type="button"
                onClick={() => pick('')}
                className={`w-full flex items-center px-3 py-2.5 text-[13px] text-left transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.05] ${
                  value === ''
                    ? 'text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-neutral-400 dark:text-neutral-500'
                }`}
              >
                {placeholder}
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-neutral-400 dark:text-neutral-500">
                No results for "{search}"
              </p>
            ) : (
              filtered.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => pick(opt.value)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] text-left transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.05] ${
                    value === opt.value
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {value === opt.value && <Check size={12} className="shrink-0 ml-2"/>}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
