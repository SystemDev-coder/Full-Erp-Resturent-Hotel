import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { LANGUAGES, LANG_STORAGE_KEY, translate, type Lang } from '@/i18n/translations'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Translate a dictionary key into the active language (falls back to English). */
  t: (key: string) => string
  /** Layout direction of the active language — 'rtl' for Arabic. */
  dir: 'ltr' | 'rtl'
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

function initialLang(): Lang {
  const stored = localStorage.getItem(LANG_STORAGE_KEY)
  if (stored && LANGUAGES.some(l => l.code === stored)) return stored as Lang
  return 'en'
}

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const dir = LANGUAGES.find(l => l.code === lang)?.dir ?? 'ltr'

  // Reflect language + direction on <html> so the whole document flips for Arabic
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir  = dir
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(LANG_STORAGE_KEY, next)
    setLangState(next)
  }, [])

  const t = useCallback((key: string) => translate(key, lang), [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
