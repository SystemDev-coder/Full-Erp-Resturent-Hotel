import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, TrendingUp, Activity, Cpu, RefreshCw, PlayCircle,
  AlertCircle, CheckCircle2, Star, LayoutGrid, X,
} from 'lucide-react'
import api, { getApiErrorMessage } from '../services/api'
import { getCategoryGroup } from '../utils/modelGroup'
import { getTrainingStatus, reloadModels, startTraditionalTraining } from '../services/trainService'

interface ModelData {
  id: string; name: string; type: string
  accuracy: number; f1: number; status: string
  experiment?: string; experimentName?: string; path?: string
}

/* ── Category palette ─────────────────────────────────────────────────── */
const CAT: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  'Traditional Model': { label: 'Traditional ML', color: '#0EA5E9', bg: 'rgba(14,165,233,0.08)',  ring: '#0EA5E9' },
  'Traditional':       { label: 'Traditional ML', color: '#0EA5E9', bg: 'rgba(14,165,233,0.08)',  ring: '#0EA5E9' },
  'Deep Learning':     { label: 'Deep Learning',  color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  ring: '#F59E0B' },
  'Transformer':       { label: 'Transformers',   color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)',  ring: '#8B5CF6' },
}
const cat = (type: string, path?: string) => {
  const g = getCategoryGroup(type, path)
  return CAT[g] ?? { label: g, color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', ring: '#94A3B8' }
}

/* ── Icon ─────────────────────────────────────────────────────────────── */
const Icon = ({ type }: { type: string }) => {
  if (type.includes('keras') || type.includes('deep_learning')) return <Cpu size={14} />
  if (type.toLowerCase().includes('transformer') || type.includes('safetensors')) return <Zap size={14} />
  if (type.includes('forest') || type.toLowerCase().includes('ensemble')) return <Activity size={14} />
  return <TrendingUp size={14} />
}

/* ── Mini ring ────────────────────────────────────────────────────────── */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 22; const circ = 2 * Math.PI * r
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="4"
        className="text-neutral-100 dark:text-neutral-800" />
      <motion.circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round" strokeDasharray={circ} transform="rotate(-90 28 28)"
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />
      <text x="28" y="32" textAnchor="middle" fontSize="10" fontWeight="800"
        fill={color} fontFamily="Inter,system-ui,sans-serif">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

/* ── Stat ─────────────────────────────────────────────────────────────── */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-[#0D2137]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-600">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-neutral-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-600">{sub}</p>}
    </div>
  )
}

/* ── Confusion matrix modal ──────────────────────────────────────────── */
function ConfusionMatrix({ model, onClose }: { model: ModelData; onClose: () => void }) {
  const [url, setUrl]       = useState<string | null>(null)
  const [loading, setLoad]  = useState(true)
  const [err, setErr]       = useState(false)
  const blobRef             = useRef<string | null>(null)

  useEffect(() => {
    if (!model.experiment) { setLoad(false); setErr(true); return }
    api.get<ArrayBuffer>(
      `/experiments/evaluation/confusion-matrix/${model.experiment}/${model.name}`,
      { responseType: 'arraybuffer' }
    ).then(r => {
      const blob = new Blob([r.data], { type: 'image/png' })
      const u    = URL.createObjectURL(blob)
      blobRef.current = u
      setUrl(u)
    }).catch(() => setErr(true))
      .finally(() => setLoad(false))
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }
  }, [model])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="relative max-w-2xl w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#0D1B2A]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <p className="text-sm font-extrabold text-neutral-900 dark:text-white">Confusion Matrix</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">{model.name}</p>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/8">
            <X size={14} />
          </button>
        </div>
        <div className="flex min-h-[260px] items-center justify-center p-6">
          {loading ? (
            <RefreshCw size={20} className="animate-spin text-neutral-300 dark:text-neutral-700" />
          ) : err || !url ? (
            <div className="flex flex-col items-center gap-2 text-sm text-neutral-400">
              <AlertCircle size={20} />
              <p>Confusion matrix not available for this model</p>
            </div>
          ) : (
            <img src={url} alt={`Confusion matrix — ${model.name}`}
              className="max-h-[480px] w-full rounded-xl object-contain" />
          )}
        </div>
      </motion.div>
    </div>
  )
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */
const TABS = ['All', 'Traditional ML', 'Deep Learning', 'Transformers']

/* ── Main ─────────────────────────────────────────────────────────────── */
const Models = () => {
  const [models, setModels]           = useState<ModelData[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [training, setTraining]       = useState(false)
  const [trainingMsg, setTrainingMsg] = useState<string | null>(null)
  const [tab, setTab]                 = useState('All')
  const [cmatrix, setCmatrix]         = useState<ModelData | null>(null)

  const fetchModels = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get<ModelData[]>('/models')
      const raw = Array.isArray(res.data) ? res.data : []
      const map = new Map<string, ModelData>()
      raw.forEach(m => { const ex = map.get(m.id); if (!ex || m.accuracy > ex.accuracy) map.set(m.id, m) })
      setModels(Array.from(map.values()))
    } catch (e) {
      setError(getApiErrorMessage(e, 'Unable to load models.'))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels])

  useEffect(() => {
    if (!training) return
    const id = window.setInterval(async () => {
      try {
        const s = await getTrainingStatus()
        if (s.status === 'running') { setTrainingMsg(s.message || 'Training…'); return }
        setTraining(false)
        if (s.status === 'completed') { await reloadModels(); await fetchModels(); setTrainingMsg(s.message || 'Complete.') }
        else if (s.status === 'failed') setTrainingMsg(s.message || 'Training failed.')
      } catch {}
    }, 3000)
    return () => window.clearInterval(id)
  }, [training, fetchModels])

  const handleTrain = async () => {
    setTrainingMsg(null); setError(null)
    try { setTraining(true); const s = await startTraditionalTraining(true); setTrainingMsg(s.message || 'Training started…') }
    catch (e) { setTraining(false); setTrainingMsg(getApiErrorMessage(e, 'Unable to start training.')) }
  }

  const handleReload = async () => {
    setError(null)
    try { await reloadModels(); await fetchModels(); setTrainingMsg('Models reloaded.') }
    catch (e) { setError(getApiErrorMessage(e, 'Unable to reload models.')) }
  }

  const bestId  = models.length ? models.reduce((b, m) => m.accuracy > b.accuracy ? m : b).id : null
  const active  = models.filter(m => m.status === 'active')
  const avgAcc  = models.length ? (models.reduce((s, m) => s + m.accuracy, 0) / models.length).toFixed(1) : '—'
  const bestAcc = models.length ? models.reduce((b, m) => m.accuracy > b.accuracy ? m : b).accuracy.toFixed(1) : '—'

  const filtered = tab === 'All' ? models : models.filter(m => cat(m.type, m.path).label === tab)

  if (loading) return (
    <div className="space-y-6">
      <div className="h-9 w-32 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-neutral-100 dark:bg-neutral-800/50 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-neutral-100 dark:bg-neutral-800/50 animate-pulse" />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">Models</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-500">
            Classifiers for AI vs Human Somali text detection
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleTrain} disabled={training}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-600 disabled:opacity-60"
          >
            <PlayCircle size={14} />
            {training ? 'Training…' : 'Train Models'}
          </button>
          <button
            onClick={handleReload} disabled={training}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.07]"
          >
            <RefreshCw size={13} className={training ? 'animate-spin' : ''} />
            Reload
          </button>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total"       value={String(models.length)} sub={`${filtered.length} in view`} />
        <Stat label="Active"      value={String(active.length)} sub="Ready for inference" />
        <Stat label="Avg Accuracy" value={`${avgAcc}%`}        sub="Across all models" />
        <Stat label="Best"        value={`${bestAcc}%`}        sub="Top performer" />
      </div>

      {/* ── Alerts ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {trainingMsg && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-sky-300">
            <CheckCircle2 size={15} className="shrink-0 text-sky-500" />
            {trainingMsg}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle size={15} className="shrink-0 text-red-500" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confusion matrix modal */}
      <AnimatePresence>
        {cmatrix && <ConfusionMatrix model={cmatrix} onClose={() => setCmatrix(null)} />}
      </AnimatePresence>

      {models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 py-16 text-center">
          <Cpu size={32} className="mx-auto mb-3 text-neutral-300 dark:text-neutral-700" />
          <p className="font-bold text-neutral-600 dark:text-neutral-400">No trained models found</p>
          <p className="mt-1 text-sm text-neutral-400">Click <strong>Train Models</strong> to begin.</p>
        </div>
      ) : (
        <>
          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <div className="flex gap-1.5 flex-wrap">
            {TABS.map(t => {
              const count = t === 'All' ? models.length : models.filter(m => cat(m.type, m.path).label === t).length
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                    tab === t
                      ? 'bg-sky-500 text-white'
                      : 'border border-neutral-200 bg-white text-neutral-500 hover:text-neutral-800 dark:border-white/[0.07] dark:bg-white/[0.03] dark:text-neutral-500 dark:hover:text-neutral-300'
                  }`}
                >
                  {t}
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    tab === t ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Grid ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((model, idx) => {
              const c  = cat(model.type, model.path)
              const isActive = model.status === 'active'
              const isBest   = model.id === bestId
              return (
                <motion.div
                  key={model.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  className="flex flex-col rounded-2xl border border-neutral-200/80 bg-white dark:border-white/[0.06] dark:bg-[#0D2137]"
                >
                  {/* Card top */}
                  <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                    {/* Icon */}
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: c.bg, color: c.color }}
                    >
                      <Icon type={model.type} />
                    </div>

                    {/* Name + badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-sm font-extrabold text-neutral-900 dark:text-white" title={model.name}>
                          {model.name}
                        </h3>
                        {isBest && <Star size={11} fill={c.color} style={{ color: c.color }} className="shrink-0" />}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: c.bg, color: c.color }}
                        >
                          {c.label}
                        </span>
                        <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-400'
                            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {/* Ring */}
                    <Ring pct={model.accuracy} color={c.ring} />
                  </div>

                  {/* Divider */}
                  <div className="mx-5 h-px bg-neutral-100 dark:bg-white/[0.05]" />

                  {/* Metrics */}
                  <div className="px-5 py-4 space-y-3">
                    {/* Accuracy bar */}
                    <div>
                      <div className="mb-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wide">
                        <span className="text-neutral-400 dark:text-neutral-600">Accuracy</span>
                        <span className="text-neutral-800 dark:text-neutral-200">{model.accuracy}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: c.ring }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(model.accuracy, 100)}%` }}
                          transition={{ duration: 0.9, ease: 'easeOut', delay: idx * 0.04 + 0.15 }}
                        />
                      </div>
                    </div>

                    {/* F1 bar */}
                    <div>
                      <div className="mb-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wide">
                        <span className="text-neutral-400 dark:text-neutral-600">F1 Score</span>
                        <span className="text-neutral-800 dark:text-neutral-200">{model.f1}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <motion.div
                          className="h-full rounded-full bg-cyan-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(model.f1 * 100, 100)}%` }}
                          transition={{ duration: 0.9, ease: 'easeOut', delay: idx * 0.04 + 0.25 }}
                        />
                      </div>
                    </div>

                    {/* Experiment label + confusion matrix button */}
                    <div className="flex items-center justify-between">
                      {model.experimentName && (
                        <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-600" title={model.experimentName}>
                          {model.experimentName}
                        </p>
                      )}
                      {c.label === 'Traditional ML' && model.experiment && (
                        <button
                          onClick={() => setCmatrix(model)}
                          className="ml-auto flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] font-bold text-neutral-500 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 dark:border-white/[0.08] dark:text-neutral-500 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/8 dark:hover:text-sky-400"
                        >
                          <LayoutGrid size={11} />
                          Confusion Matrix
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* ── Comparison table ──────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white dark:border-white/[0.06] dark:bg-[#0D2137]">
            <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/[0.05]">
              <Activity size={14} className="text-sky-500" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Model Comparison</h3>
              <span className="ml-auto rounded-lg bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                {models.length} models
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 dark:border-white/[0.05]">
                    {['Model', 'Category', 'Accuracy', 'F1', 'Status', 'Experiment'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 dark:divide-white/[0.03]">
                  {models.map(model => {
                    const c = cat(model.type, model.path)
                    return (
                      <tr key={model.id} className={`transition-colors hover:bg-neutral-50/60 dark:hover:bg-white/[0.02] ${
                        model.id === bestId ? 'bg-sky-50/30 dark:bg-sky-500/[0.04]' : ''
                      }`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900 dark:text-white">{model.name}</span>
                            {model.id === bestId && <Star size={11} fill={c.color} style={{ color: c.color }} />}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-md px-2 py-0.5 text-[11px] font-bold"
                            style={{ background: c.bg, color: c.color }}>
                            {c.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-neutral-900 dark:text-white">{model.accuracy}%</td>
                        <td className="px-5 py-3.5 font-bold text-neutral-900 dark:text-white">{model.f1}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            model.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400'
                              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${model.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                            {model.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-neutral-400 dark:text-neutral-600">
                          {model.experimentName ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Models
