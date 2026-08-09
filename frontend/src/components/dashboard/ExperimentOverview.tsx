import { motion } from 'framer-motion'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Experiment } from '../../types/experiment'

interface ExperimentOverviewProps {
  experiments: Experiment[]
}

const statusConfig: Record<string, { dot: string; label: string; badge: string }> = {
  completed: { dot: 'bg-emerald-400', label: 'Completed', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  running:   { dot: 'bg-blue-400 animate-pulse', label: 'Running', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  failed:    { dot: 'bg-red-400', label: 'Failed', badge: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  pending:   { dot: 'bg-neutral-300', label: 'Pending', badge: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
}

const expColors = [
  { bar: 'from-primary-500 to-indigo-500', glow: 'from-primary-500/8' },
  { bar: 'from-violet-500 to-purple-500', glow: 'from-violet-500/8' },
]

export const ExperimentOverview = ({ experiments }: ExperimentOverviewProps) => (
  <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/70 dark:bg-neutral-900">
    <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5 dark:border-neutral-800/60">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-500/10">
          <FlaskConical size={15} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Ablation Studies</p>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Experiments</h3>
        </div>
      </div>
      <Link
        to="/experiments"
        className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
      >
        View all <ArrowRight size={13} />
      </Link>
    </div>

    <div className="grid gap-4 p-5 sm:grid-cols-2">
      {experiments.length === 0 ? (
        <p className="col-span-2 py-6 text-center text-sm text-neutral-400">No experiments found.</p>
      ) : (
        experiments.slice(0, 2).map((exp, idx) => {
          const status = statusConfig[exp.status] ?? statusConfig.pending
          const colors = expColors[idx % expColors.length]
          return (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={`group relative overflow-hidden rounded-2xl border border-neutral-100 bg-gradient-to-br ${colors.glow} to-transparent p-5 transition-all hover:border-neutral-200 hover:shadow-md dark:border-neutral-800/60 dark:hover:border-neutral-700`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <p className="font-bold text-sm text-neutral-900 dark:text-white leading-snug">{exp.name}</p>
                <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Accuracy', value: `${exp.accuracy.toFixed(1)}%` },
                  { label: 'F1 Score', value: exp.f1.toFixed(3) },
                  { label: 'Models', value: String(exp.models) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-neutral-50 px-3 py-2.5 dark:bg-neutral-800/40">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{label}</p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-neutral-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              {/* Accuracy progress bar */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Accuracy</span>
                  <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400">{exp.accuracy.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(exp.accuracy, 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: idx * 0.1 }}
                    className={`h-full rounded-full bg-gradient-to-r ${colors.bar}`}
                  />
                </div>
              </div>
            </motion.div>
          )
        })
      )}
    </div>
  </div>
)
