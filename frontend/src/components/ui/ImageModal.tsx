import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  src: string | null
  alt?: string
  onClose: () => void
}

// Full-image viewer — click any thumbnail to see the original, uncropped.
// Uses object-contain (whole image visible) as opposed to the object-cover
// thumbnails use everywhere else (fill the box, crop to fit).
export default function ImageModal({ src, alt = '', onClose }: Props) {
  useEffect(() => {
    if (!src) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [src, onClose])

  if (!src) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      role="dialog" aria-modal="true" onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <button
        onClick={onClose}
        className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={e => e.stopPropagation()}
        className="relative max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
      />
    </div>,
    document.body
  )
}
