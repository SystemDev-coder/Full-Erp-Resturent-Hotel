import { motion } from 'framer-motion'
import { ArrowRight, Brain, FlaskConical, Sparkles, Zap, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'

interface DashboardHeroProps {
  modelCount: number
  bestAccuracy: number
  connected: boolean
}

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export const DashboardHero = ({ modelCount, bestAccuracy, connected }: DashboardHeroProps) => {
  const { user } = useAuth()
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Researcher'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl p-8 md:p-10 shadow-2xl"
      style={{ background: 'linear-gradient(135deg, #071521 0%, #0A2240 50%, #071B35 100%)' }}
    >
      {/* Layered gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sky-500/20 blur-[80px]" />
        <div className="absolute -bottom-20 right-1/4 h-64 w-64 rounded-full bg-cyan-400/15 blur-[80px]" />
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-blue-600/12 blur-[60px]" />
        <div className="absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-sky-400/8 blur-[50px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        {/* Left — text */}
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3.5 py-1.5 backdrop-blur-sm"
          >
            <Sparkles size={13} className="text-sky-300" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200">
              Somali NLP Research Platform
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-3xl font-extrabold tracking-tight text-white md:text-4xl lg:text-[2.75rem] lg:leading-[1.08]"
          >
            {getGreeting()}, {firstName}
            <span className="mt-1 block bg-gradient-to-r from-sky-300 via-blue-300 to-cyan-300 bg-clip-text text-transparent">
              Classification Platform
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mt-4 max-w-lg text-[15px] leading-relaxed text-sky-200/60"
          >
            Monitor experiment benchmarks, compare ML models, and run real-time Somali
            text inference — all in one research hub.
          </motion.p>

          {/* Status pills */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-6 flex flex-wrap gap-2.5"
          >
            <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 ${
              connected
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
                : 'bg-red-500/10 text-red-300 ring-red-500/25'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              {connected ? 'API Online' : 'API Offline'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-bold text-sky-200 ring-1 ring-white/10">
              <Zap size={11} className="text-sky-400" />
              {modelCount} models loaded
            </span>
            {bestAccuracy > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3.5 py-1.5 text-xs font-bold text-sky-200 ring-1 ring-sky-400/20">
                <Activity size={11} />
                Peak {bestAccuracy.toFixed(2)}% accuracy
              </span>
            )}
          </motion.div>
        </div>

        {/* Right — action cards */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col gap-3 lg:shrink-0 lg:w-[220px]"
        >
          <Link
            to="/predict"
            className="group flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-lg transition-all hover:bg-sky-50 hover:shadow-xl hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 transition group-hover:bg-sky-600 group-hover:text-white">
                <Brain size={17} />
              </div>
              <span className="text-sm font-bold text-neutral-900">Run Prediction</span>
            </div>
            <ArrowRight size={15} className="text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
          </Link>

          <Link
            to="/models"
            className="group flex items-center justify-between rounded-2xl bg-white/8 px-5 py-4 ring-1 ring-white/10 transition-all hover:bg-white/12 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                <Zap size={17} />
              </div>
              <span className="text-sm font-bold text-sky-100">Models</span>
            </div>
            <ArrowRight size={15} className="text-sky-500/50 transition group-hover:translate-x-0.5 group-hover:text-sky-300" />
          </Link>

          <Link
            to="/experiments"
            className="group flex items-center justify-between rounded-2xl bg-white/8 px-5 py-4 ring-1 ring-white/10 transition-all hover:bg-white/12 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                <FlaskConical size={17} />
              </div>
              <span className="text-sm font-bold text-sky-100">Experiments</span>
            </div>
            <ArrowRight size={15} className="text-sky-500/50 transition group-hover:translate-x-0.5 group-hover:text-sky-300" />
          </Link>
        </motion.div>
      </div>
    </motion.div>
  )
}
