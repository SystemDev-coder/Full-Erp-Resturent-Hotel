import { useState, type ReactNode } from 'react'
import { ImageOff } from 'lucide-react'

interface Props {
  src?: string | null
  alt?: string
  className?: string
  onClick?: () => void
  fallback?: ReactNode
}

// Shared image thumbnail used across every DataTable and card that shows a
// photo (menu items, user avatars, guest documents). Always crops to fill
// (object-cover) and always falls back to a clear placeholder instead of a
// broken-image icon if the src is missing or fails to load.
export function ImageThumb({ src, alt = '', className = '', onClick, fallback }: Props) {
  const [broken, setBroken] = useState(false)
  const showImg = !!src && !broken

  return (
    <div
      onClick={onClick}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {showImg ? (
        <img
          src={src!}
          alt={alt}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        fallback ?? <ImageOff size={14} strokeWidth={1.5} className="text-neutral-300 dark:text-neutral-600" />
      )}
    </div>
  )
}
