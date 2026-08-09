import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

// ─── DatePicker (date only) ───────────────────────────────────────────────────

interface DatePickerProps {
  value: string            // YYYY-MM-DD
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

function todayISO() {
  const t = new Date()
  const p = (n: number) => String(n).padStart(2,'0')
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`
}

function fmtDate(v: string) {
  if (!v) return ''
  const [y,m,d] = v.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}

export function DatePicker({ value, onChange, placeholder = 'Select date', disabled }: DatePickerProps) {
  const [open,  setOpen]  = useState(false)
  const [rect,  setRect]  = useState<DOMRect | null>(null)
  const [viewY, setViewY] = useState(() => (value ? +value.slice(0,4) : new Date().getFullYear()))
  const [viewM, setViewM] = useState(() => (value ? +value.slice(5,7)-1 : new Date().getMonth()))
  const btnRef  = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) { setViewY(+value.slice(0,4)); setViewM(+value.slice(5,7)-1) }
  }, [value])

  const toggle = () => {
    if (disabled) return
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || dropRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const prevM = () => viewM === 0  ? (setViewM(11), setViewY(y => y-1)) : setViewM(m => m-1)
  const nextM = () => viewM === 11 ? (setViewM(0),  setViewY(y => y+1)) : setViewM(m => m+1)

  const pick = (day: number) => {
    const p = (n: number) => String(n).padStart(2,'0')
    onChange(`${viewY}-${p(viewM+1)}-${p(day)}`)
    setOpen(false)
  }

  const today = todayISO()
  const selD = value ? +value.slice(8,10) : -1
  const selM = value ? +value.slice(5,7)-1 : -1
  const selY = value ? +value.slice(0,4)  : -1

  const firstDow  = new Date(viewY, viewM, 1).getDay()
  const daysInMon = new Date(viewY, viewM+1, 0).getDate()
  const cells: (number|null)[] = [...Array(firstDow).fill(null), ...Array.from({length:daysInMon},(_,i)=>i+1)]
  while (cells.length % 7) cells.push(null)

  const style: React.CSSProperties = rect
    ? { position:'fixed', left:rect.left, top:rect.bottom+4, width:Math.max(rect.width, 268), zIndex:9999 }
    : {}

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} disabled={disabled}
        className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-[13px] text-left outline-none transition-colors disabled:opacity-50 bg-neutral-50 dark:bg-white/[0.04] ${
          open ? 'border-indigo-400 ring-2 ring-indigo-100 dark:border-indigo-500 dark:ring-indigo-500/25'
               : 'border-neutral-200 dark:border-white/[0.08]'}`}>
        <span className={value ? 'text-neutral-800 dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}>
          {value ? fmtDate(value) : placeholder}
        </span>
        <Calendar size={14} className="shrink-0 ml-2 text-neutral-400"/>
      </button>

      {open && rect && createPortal(
        <div ref={dropRef} style={style}
          className="rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-white/[0.10] dark:bg-[#1c2333] p-3">
          {/* Nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevM}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors">
              <ChevronLeft size={14}/>
            </button>
            <span className="text-[13px] font-bold text-neutral-800 dark:text-white">{MONTHS[viewM]} {viewY}</span>
            <button type="button" onClick={nextM}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors">
              <ChevronRight size={14}/>
            </button>
          </div>
          {/* Headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => <div key={d} className="text-center text-[10px] font-bold text-neutral-400 dark:text-neutral-500 py-0.5">{d}</div>)}
          </div>
          {/* Grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i}/>
              const p  = (n: number) => String(n).padStart(2,'0')
              const ds = `${viewY}-${p(viewM+1)}-${p(day)}`
              const isSel   = day === selD && viewM === selM && viewY === selY
              const isToday = ds === today
              return (
                <button key={i} type="button" onClick={() => pick(day)}
                  className={`h-8 w-full rounded-lg text-[12px] font-semibold transition-colors ${
                    isSel   ? 'bg-indigo-600 text-white'
                    : isToday ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/[0.06]'
                  }`}>{day}</button>
              )
            })}
          </div>
          {/* Today shortcut */}
          <div className="mt-2.5 border-t border-neutral-100 dark:border-white/[0.06] pt-2">
            <button type="button" onClick={() => { onChange(today); setOpen(false) }}
              className="w-full rounded-lg py-1.5 text-[12px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
