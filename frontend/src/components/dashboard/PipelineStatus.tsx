import { motion } from 'framer-motion'
import { CheckCircle2, Clock, Cpu, Database, Server } from 'lucide-react'
import type { Experiment } from '../../types/experiment'

interface PipelineStatusProps {
  connected: boolean
  modelCount: number
  experiments: Experiment[]
}

const steps = [
  { id: 'data', label: 'Dataset Splits', desc: 'Train / val / test CSVs loaded' },
  { id: 'train', label: 'Model Training', desc: 'Traditional ML + deep learning' },
  { id: 'eval', label: 'Evaluation', desc: 'Accuracy, F1, precision, recall' },
  { id: 'serve', label: 'Inference API', desc: 'FastAPI real-time endpoint' },
]

export const PipelineStatus = ({ connected, modelCount, experiments }: PipelineStatusProps) => {
  const trainingDone = modelCount > 0
  const evalDone = modelCount > 0
  const stepState = [true, trainingDone, evalDone, connected && modelCount > 0]
  const completedCount = stepState.filter(Boolean).length

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/70 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/10">
            <Server size={15} className="text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">MLOps Pipeline</p>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">Research Workflow</p>
          </div>
        </div>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {completedCount}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(completedCount / steps.length) * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-primary-500 to-emerald-500"
        />
      </div>

      {/* Steps */}
      <div className="px-5 py-4 space-y-0">
        {steps.map((step, idx) => {
          const done = stepState[idx]
          return (
            <div key={step.id} className="relative flex items-start gap-3.5 pb-5 last:pb-0">
              {idx < steps.length - 1 && (
                <div
                  className={`absolute left-[13px] top-7 h-[calc(100%-16px)] w-px transition-colors duration-500 ${
                    done ? 'bg-emerald-300 dark:bg-emerald-700/50' : 'bg-neutral-200 dark:bg-neutral-700'
                  }`}
                />
              )}
              <div className="relative z-10 mt-0.5 shrink-0">
                {done ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: idx * 0.1 }}
                  >
                    <CheckCircle2 size={26} className="text-emerald-500" strokeWidth={2} />
                  </motion.div>
                ) : (
                  <Clock size={26} className="text-neutral-300 dark:text-neutral-600" strokeWidth={1.5} />
                )}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-semibold leading-tight ${done ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-2 gap-3 border-t border-neutral-100 p-4 dark:border-neutral-800/60">
        <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800/30">
          <Cpu size={15} className="shrink-0 text-primary-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Models</p>
            <p className="font-mono text-lg font-black text-neutral-900 dark:text-white">{modelCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800/30">
          <Database size={15} className="shrink-0 text-violet-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Experiments</p>
            <p className="font-mono text-lg font-black text-neutral-900 dark:text-white">{experiments.length}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
