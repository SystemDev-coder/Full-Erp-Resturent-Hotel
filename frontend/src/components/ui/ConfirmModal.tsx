import { AlertTriangle, RefreshCw } from 'lucide-react'
import Modal, { CancelBtn } from './Modal'

interface Props {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

// Shared confirmation dialog for destructive/irreversible actions (delete, undo, etc.)
export default function ConfirmModal({
  open, title, message, confirmLabel = 'Delete', danger = true, loading = false, onConfirm, onClose,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <>
        <CancelBtn onClick={onClose}/>
        <button onClick={onConfirm} disabled={loading}
          className={`flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-40 ${
            danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}>
          {loading ? <RefreshCw size={13} className="animate-spin"/> : null} {confirmLabel}
        </button>
      </>
    }>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          danger ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                 : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
        }`}>
          <AlertTriangle size={18}/>
        </div>
        <div className="pt-1.5 text-[13.5px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          {message}
        </div>
      </div>
    </Modal>
  )
}
