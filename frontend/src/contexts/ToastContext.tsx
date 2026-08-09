import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const toastStyles: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950 dark:text-red-100',
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950 dark:text-sky-100',
}

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <AlertCircle size={18} />,
  info: <Info size={18} />,
}

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((current) => [...current, { id, message, type }].slice(-4))
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss]
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.98 }}
              className={`flex items-start gap-3 rounded-xl border p-4 shadow-lg shadow-slate-900/10 ${toastStyles[toast.type]}`}
            >
              <div className="mt-0.5 flex-shrink-0">{toastIcons[toast.type]}</div>
              <p className="min-w-0 flex-1 text-sm font-medium leading-5">{toast.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
