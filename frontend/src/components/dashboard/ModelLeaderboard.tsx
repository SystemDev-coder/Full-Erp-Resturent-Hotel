import { motion } from 'framer-motion'
import { ArrowRight, Crown, Medal, Award, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getCategoryGroup } from '../../utils/modelGroup'

export interface LeaderboardModel {
  id: string
  name: string
  type: string
  accuracy: number
  f1: number
  precision: number
  recall: number
  experimentName?: string
  path?: string
  rank: number
}

interface ModelLeaderboardProps {
  models: LeaderboardModel[]
  loading?: boolean
}

const TOP3 = [
  { icon: Crown,  iconColor: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-500/10', ring: 'ring-amber-300/40 dark:ring-amber-500/20', bar: 'from-amber-400 to-amber-500', badge: 'bg-amber-500' },
  { icon: Medal,  iconColor: 'text-slate-500',  bg: 'bg-slate-50 dark:bg-slate-500/10',  ring: 'ring-slate-300/40 dark:ring-slate-500/20',  bar: 'from-slate-400 to-slate-500',  badge: 'bg-slate-400' },
  { icon: Award,  iconColor: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', ring: 'ring-orange-300/40 dark:ring-orange-500/20', bar: 'from-orange-400 to-orange-500', badge: 'bg-orange-500' },
]

const shortName = (name: string) =>
  name.replace(/_TFIDF$/i, '').replace(/_/g, ' ').slice(0, 22)

export const ModelLeaderboard = ({ models, loading }: ModelLeaderboardProps) => (
  <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/70 dark:bg-neutral-900">
    {/* Header */}
    <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5 dark:border-neutral-800/60">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
          <Trophy size={15} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Rankings</p>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Model Leaderboard</h3>
        </div>
      </div>
      <Link
        to="/predict"
        className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
      >
        Run inference <ArrowRight size={13} />
      </Link>
    </div>

    {/* Table */}
    <div className="divide-y divide-neutral-50 dark:divide-neutral-800/40">
      {loading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-4 px-6 py-4">
            <div className="h-9 w-9 rounded-xl bg-neutral-100 dark:bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-44 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="h-6 w-16 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          </div>
        ))
      ) : models.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-neutral-400">
          No models loaded yet.
        </div>
      ) : (
        models.map((model, idx) => {
          const top = TOP3[idx]
          const RankIcon = top?.icon
          const isTop3 = idx < 3

          return (
            <motion.div
              key={model.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="group flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/20"
            >
              {/* Rank icon */}
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105 ${
                  isTop3
                    ? `${top.bg} ${top.ring}`
                    : 'bg-neutral-50 ring-neutral-200/50 dark:bg-neutral-800/30 dark:ring-neutral-700/40'
                }`}
              >
                {isTop3 ? (
                  <RankIcon size={16} className={top.iconColor} />
                ) : (
                  <span className="font-mono text-xs font-black text-neutral-400 dark:text-neutral-500">
                    #{model.rank}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-bold text-neutral-900 dark:text-white leading-tight">
                    {shortName(model.name)}
                  </p>
                  {idx === 0 && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                      Best
                    </span>
                  )}
                  <span className="rounded-lg bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {getCategoryGroup(model.type, model.path)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                  F1 {model.f1.toFixed(3)} · P {model.precision.toFixed(3)} · R {model.recall.toFixed(3)}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(model.accuracy, 100)}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 + idx * 0.05 }}
                    className={`h-full rounded-full bg-gradient-to-r ${
                      isTop3 ? top.bar : 'from-primary-400 to-primary-600'
                    }`}
                  />
                </div>
              </div>

              {/* Accuracy */}
              <div className="shrink-0 text-right">
                <p className={`font-mono text-lg font-black leading-none ${isTop3 ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>
                  {model.accuracy.toFixed(1)}
                  <span className="text-xs font-bold text-neutral-400">%</span>
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">acc</p>
              </div>
            </motion.div>
          )
        })
      )}
    </div>
  </div>
)
