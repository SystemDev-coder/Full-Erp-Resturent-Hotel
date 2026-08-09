import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { LANGUAGES } from '@/i18n/translations'

/**
 * Language switcher dropdown, wired to the global LanguageContext.
 * variant="navbar"  — compact text button used in the app header
 * variant="floating" — bordered square-ish button used on the login page
 */
export function LangPicker({ variant = 'navbar' }: { variant?: 'navbar' | 'floating' }) {
  const [open, setOpen] = useState(false)
  const { lang, setLang, t } = useLanguage()

  const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]

  const trigger = variant === 'navbar' ? (
    <button
      onClick={() => setOpen(v => !v)}
      className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06] transition-colors"
    >
      <Globe size={15} />
      <span>{current.flag} {current.code.toUpperCase()}</span>
      <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  ) : (
    <button
      onClick={() => setOpen(v => !v)}
      aria-label={t('common.language')}
      className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-500 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400"
    >
      <Globe size={15} />
      <span>{current.flag} {current.code.toUpperCase()}</span>
      <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )

  return (
    <div className="relative">
      {trigger}
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-11 z-30 w-44 rounded-xl border border-neutral-200/60 bg-white py-1 shadow-xl dark:border-white/[0.08] dark:bg-[#1c2333]"
            >
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {t('common.language')}
              </p>
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => { setLang(l.code); setOpen(false) }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium transition-colors ${
                    lang === l.code
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-base">{l.flag}</span>
                  {l.label}
                  {lang === l.code && <Check size={13} className="ml-auto text-indigo-500" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
