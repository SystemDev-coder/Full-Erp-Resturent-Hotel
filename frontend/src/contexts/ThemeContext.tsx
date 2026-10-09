import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'

export interface ThemeOrigin { x: number; y: number }

interface ThemeContextType {
  theme: Theme
  /** Pass the click position so the new theme ripples out from the button that was pressed. */
  toggleTheme: (origin?: ThemeOrigin) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const applyTheme = (t: Theme) => {
  const root = document.documentElement
  root.classList.toggle('dark', t === 'dark')
  root.style.colorScheme = t
  try { localStorage.setItem('snlp-theme', t) } catch { /* storage unavailable */ }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    let saved: Theme | null = null
    try { saved = localStorage.getItem('snlp-theme') as Theme | null } catch { /* ignore */ }
    const t: Theme = saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    applyTheme(t) // sync apply prevents dark-mode FOUC on first paint
    return t
  })
  const busy = useRef(false)

  useEffect(() => { applyTheme(theme) }, [theme])

  const toggleTheme = useCallback((origin?: ThemeOrigin) => {
    if (busy.current) return
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const vt = (document as any).startViewTransition?.bind(document)

    if (reduce) { setTheme(next); return }

    // Modern browsers: the whole page (sidebar, header, cards, charts) cross-fades through a circle
    // that grows from the pressed button — one smooth reveal instead of a hard flash.
    if (vt) {
      busy.current = true
      const x = origin?.x ?? window.innerWidth / 2
      const y = origin?.y ?? window.innerHeight / 2
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      const transition = vt(() => { flushSync(() => setTheme(next)); applyTheme(next) })
      transition.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 700, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
        )
      }).catch(() => { /* animation is cosmetic */ })
      transition.finished.finally(() => { busy.current = false })
      return
    }

    // Fallback: colours of every element ease between the two themes
    busy.current = true
    root.classList.add('theme-anim')
    setTheme(next)
    window.setTimeout(() => { root.classList.remove('theme-anim'); busy.current = false }, 650)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
