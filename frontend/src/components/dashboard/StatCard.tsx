import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  color: 'primary' | 'emerald' | 'violet' | 'amber' | 'cyan' | 'rose'
  delay?: number
  trend?: { label: string; positive?: boolean }
}

const colorMap: Record<StatCardProps['color'], {
  icon: string
  glow: string
  badge: string
  bar: string
}> = {
  primary: {
    icon: 'bg-primary-600 shadow-primary-500/30',
    glow: 'from-primary-500/8 via-transparent to-transparent',
    badge: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400',
    bar: 'bg-primary-500',
  },
  emerald: {
    icon: 'bg-emerald-600 shadow-emerald-500/30',
    glow: 'from-emerald-500/8 via-transparent to-transparent',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  },
  violet: {
    icon: 'bg-violet-600 shadow-violet-500/30',
    glow: 'from-violet-500/8 via-transparent to-transparent',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
    bar: 'bg-violet-500',
  },
  amber: {
    icon: 'bg-amber-500 shadow-amber-500/30',
    glow: 'from-amber-500/8 via-transparent to-transparent',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    bar: 'bg-amber-500',
  },
  cyan: {
    icon: 'bg-cyan-600 shadow-cyan-500/30',
    glow: 'from-cyan-500/8 via-transparent to-transparent',
    badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
    bar: 'bg-cyan-500',
  },
  rose: {
    icon: 'bg-rose-600 shadow-rose-500/30',
    glow: 'from-rose-500/8 via-transparent to-transparent',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
    bar: 'bg-rose-500',
  },
}

export const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  color,
  delay = 0,
  trend,
}: StatCardProps) => {
  const c = colorMap[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800/70 dark:bg-neutral-900"
    >
      {/* Subtle color glow top-left */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.glow}`} />

      <div className="relative flex items-start justify-between gap-4">
        {/* Icon */}
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg ${c.icon}`}>
          {icon}
        </div>

        {/* Trend badge */}
        {trend && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${c.badge}`}>
            {trend.positive !== undefined ? (
              trend.positive
                ? <TrendingUp size={11} />
                : <TrendingDown size={11} />
            ) : null}
            {trend.label}
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <p className="font-mono text-[2.25rem] font-black leading-none tracking-tight text-neutral-900 dark:text-white">
          {value}
        </p>
        <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {title}
        </p>
        {subtitle && (
          <p className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400 leading-tight">
            {subtitle}
          </p>
        )}
      </div>

      {/* Bottom accent bar */}
      <div className={`absolute bottom-0 left-0 h-[3px] w-0 rounded-r-full ${c.bar} transition-all duration-500 group-hover:w-full`} />
    </motion.div>
  )
}
