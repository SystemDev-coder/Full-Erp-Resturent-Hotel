import type { ElementType, ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { TONES, type ToneKey } from '@utils/tones'

// Small building blocks shared by the Finance and System report tabs. Everything that
// shows a number is a button — clicking it opens the rows behind that number.

export function ReportKpi({ tone, icon: Icon, label, value, sub, onClick }: {
  tone: ToneKey; icon: ElementType; label: string; value: string; sub?: string; onClick: () => void
}) {
  const t = TONES[tone]
  return (
    <button type="button" onClick={onClick}
      className={`group relative flex flex-col rounded-3xl border p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${t.card}`}>
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${t.chip}`}><Icon size={21} strokeWidth={2} /></span>
        <ArrowUpRight size={16} className={`opacity-0 transition group-hover:opacity-70 ${t.ink}`} />
      </div>
      <p className={`mt-5 text-[12.5px] font-medium opacity-80 ${t.ink}`}>{label}</p>
      <p className={`mt-0.5 truncate text-[28px] font-bold leading-tight tracking-tight tabular-nums ${t.ink}`}>{value}</p>
      {sub && <p className={`mt-1 text-[11.5px] opacity-70 ${t.ink}`}>{sub}</p>}
    </button>
  )
}

export function ReportPanel({ title, subtitle, action, children, className = '' }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#1a2030] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-neutral-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-neutral-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export const PanelLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-white/[0.06]">
    {children} <ArrowUpRight size={12} />
  </button>
)

// A labelled horizontal bar — the value is also its own click target
export function BarRow({ label, value, display, max, color, onClick, sub }: {
  label: string; value: number; display: string; max: number; color: string; onClick?: () => void; sub?: string
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className="min-w-0 truncate font-medium text-neutral-700 dark:text-neutral-200">{label}{sub && <span className="ml-1.5 font-normal text-neutral-400">{sub}</span>}</span>
        <span className="shrink-0 font-semibold tabular-nums text-neutral-900 dark:text-white">{display}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0}%`, background: color }} />
      </div>
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} className="block w-full rounded-xl px-2.5 py-2 text-left transition hover:bg-neutral-50 dark:hover:bg-white/[0.04]">{inner}</button>
    : <div className="px-2.5 py-2">{inner}</div>
}

export const ReportEmpty = ({ icon: Icon, text }: { icon: ElementType; text: string }) => (
  <div className="flex flex-col items-center gap-2 py-9 text-neutral-400">
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.05]"><Icon size={20} /></span>
    <p className="text-[12.5px]">{text}</p>
  </div>
)
