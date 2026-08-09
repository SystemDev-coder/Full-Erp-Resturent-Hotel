import { type ReactNode } from 'react'

export interface TabDef {
  key: string
  label: string
  icon?: ReactNode
  count?: number
}

/**
 * Pill-style tab bar used by pages that group several tables under one menu
 * entry (Orders & Tables, Items, Purchase Orders).
 */
export function Tabs({ tabs, active, onChange }: {
  tabs: TabDef[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-neutral-200/60 bg-white p-1.5 shadow-sm dark:border-white/[0.06] dark:bg-[#1c2333] w-fit">
      {tabs.map(tab => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-all ${
              isActive
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/[0.05] dark:hover:text-neutral-200'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500 dark:bg-white/[0.08] dark:text-neutral-400'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
