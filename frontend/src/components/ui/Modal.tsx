import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
}

export default function Modal({ open, onClose, title, children, size = 'md', footer }: Props) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc) }
  }, [open, onClose])

  if (!open) return null

  const maxW = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className={`relative w-full ${maxW} rounded-2xl bg-white shadow-2xl dark:bg-[#1c2333] flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-white/[0.06] shrink-0">
          <h2 className="text-[15px] font-extrabold text-neutral-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors">
            <X size={16}/>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-4 dark:border-white/[0.06] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export const INPUT = "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] text-neutral-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-neutral-500 dark:focus:border-indigo-500 dark:[color-scheme:dark] transition-colors"

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1.5">{children}</label>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04] transition-colors">
      Cancel
    </button>
  )
}