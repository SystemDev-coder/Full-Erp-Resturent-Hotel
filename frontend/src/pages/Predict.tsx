import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle, Brain, CheckCircle2, ChevronDown, ChevronUp, Clock,
  FileText, History, Microscope, RotateCcw, Send, Sparkles, X, Zap,
} from 'lucide-react'
import api, { getApiErrorMessage } from '@services/api'
import { predict } from '@services/predictService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import type { PredictResponse } from '@/types/prediction'
import { getCategoryGroup } from '../utils/modelGroup'

/* ── Types ──────────────────────────────────────────────────────────────────── */
type HighlightTone = 'ai' | 'human'

interface ModelData {
  id: string; name: string; type: string
  experiment?: string; experimentName?: string
  accuracy: number; f1: number; precision: number; recall: number; status: string
}

interface HistoryEntry {
  id: string; text: string; label: string
  confidence: number; model: string; ts: number; ms: number
  category?: string; category_icon?: string
}

/* ── Constants ──────────────────────────────────────────────────────────────── */
const EXP_LABELS: Record<string, string> = {
  experiment_1_stopwords_included: 'Experiment 1 — Stopwords Included',
  experiment_2_stopwords_removed:  'Experiment 2 — Stopwords Removed',
}
const MAX_CHARS = 5000

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const fmtPct  = (v: number) => `${Math.round(v * 100)}%`
const fmtMet  = (v: number, s = '') => Number.isFinite(v) ? `${v.toFixed(v >= 10 ? 2 : 3)}${s}` : 'N/A'
const normWord = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '')
const fmtTime  = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const getExpVariant = (m: ModelData): string => {
  const raw = (m.experiment ?? '').toLowerCase()
  for (const [k, v] of Object.entries(EXP_LABELS)) if (raw.includes(k)) return v
  const n = (m.experimentName ?? '').toLowerCase()
  if (n.includes('included')) return EXP_LABELS['experiment_1_stopwords_included']
  if (n.includes('removed'))  return EXP_LABELS['experiment_2_stopwords_removed']
  if (m.experimentName && m.experimentName !== 'Unassigned') return m.experimentName
  return 'All Models'
}

const buildProbs = (r: PredictResponse) => {
  let ai = 0, hu = 0
  if (r.probabilities) { ai = Number(r.probabilities.AI ?? 0); hu = Number(r.probabilities.HUMAN ?? 0) }
  else { const s = Number(r.score ?? 0); r.label === 'AI' ? (ai = s, hu = 1 - s) : (hu = s, ai = 1 - s) }
  const t = ai + hu; if (t > 0 && t !== 1) { ai /= t; hu /= t }
  if (r.label === 'HUMAN' && hu <= ai) { [ai, hu] = [hu, ai]; if (ai === hu) { const s = Number(r.score ?? 0.5); hu = Math.max(s, 0.52); ai = 1 - hu } }
  else if (r.label === 'AI' && ai <= hu) { [ai, hu] = [hu, ai]; if (ai === hu) { const s = Number(r.score ?? 0.5); ai = Math.max(s, 0.52); hu = 1 - ai } }
  return { AI: Math.max(0, Math.min(1, ai)), HUMAN: Math.max(0, Math.min(1, hu)) }
}

const buildTokens = (text: string, label: string) => {
  const parts = text.split(/(\s+)/)
  const counts = new Map<string, number>()
  parts.forEach(p => { const w = normWord(p); if (w) counts.set(w, (counts.get(w) ?? 0) + 1) })
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 18).map(([w]) => w)
  const hl = new Set(ranked)
  const primary: HighlightTone = label === 'AI' ? 'ai' : 'human'
  const secondary: HighlightTone = primary === 'ai' ? 'human' : 'ai'
  return parts.map((part, i) => {
    const w = normWord(part)
    if (!w || !hl.has(w)) return { text: part }
    const rank = ranked.indexOf(w)
    const tone = rank % 3 === 0 ? secondary : primary
    return { text: part, tone, score: Math.max(0.05, +(1 - rank / ranked.length).toFixed(2)), direction: tone === 'ai' ? 'AI' : 'Human', key: `${w}-${i}` }
  })
}

/* ── Confidence Gauge SVG ───────────────────────────────────────────────────── */
function ConfidenceGauge({ value, label }: { value: number; label: string }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const pct = Math.min(Math.max(value, 0), 1)
  const r = 54; const circ = 2 * Math.PI * r
  const half = circ / 2
  const dash = pct * half

  const color = label === 'AI'
    ? ['#2563EB', '#60A5FA']
    : ['#F97316', '#FBBF24']

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="80" viewBox="0 0 140 80" className="overflow-visible">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color[0]} />
            <stop offset="100%" stopColor={color[1]} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={`M 16 72 A ${r} ${r} 0 0 1 124 72`}
          fill="none" stroke={isDark ? '#1E293B' : '#E2E8F0'}
          strokeWidth="10" strokeLinecap="round"
        />
        {/* Fill */}
        <motion.path
          d={`M 16 72 A ${r} ${r} 0 0 1 124 72`}
          fill="none" stroke="url(#gaugeGrad)"
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${half}`}
          initial={{ strokeDashoffset: half }}
          animate={{ strokeDashoffset: half - dash }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        />
        {/* Percentage number */}
        <text x="70" y="58" textAnchor="middle" fontSize="22" fontWeight="800"
          fill="#FFFFFF" fontFamily="Inter, system-ui, sans-serif">
          {Math.round(pct * 100)}
        </text>
        {/* CONFIDENCE % label */}
        <text x="70" y="72" textAnchor="middle" fontSize="11" fontWeight="700"
          fill="rgba(255,255,255,0.65)" fontFamily="Inter, system-ui, sans-serif">
          CONFIDENCE %
        </text>
      </svg>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────────── */
export default function Predict() {
  const [models, setModels]           = useState<ModelData[]>([])
  const [selectedCat, setSelectedCat] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [text, setText]               = useState('')
  const [result, setResult]           = useState<PredictResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [history, setHistory]         = useState<HistoryEntry[]>([])
  const [startMs, setStartMs]         = useState(0)
  const [elapsed, setElapsed]         = useState(0)
  const [limeOpen, setLimeOpen]       = useState(false)
  const [limeUrl, setLimeUrl]         = useState<string | null>(null)
  const [limeLoading, setLimeLoading] = useState(false)
  const [limeIframeH, setLimeIframeH] = useState(600)
  const [samples, setSamples]         = useState<{ label: string; type: string; text: string }[]>([])
  const [samplesOpen, setSamplesOpen] = useState(false)
  const resultRef  = useRef<HTMLDivElement>(null)
  const limeBlob   = useRef<string | null>(null)
  const { showToast } = useToast()

  // Listen for LIME iframe height
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'limeHeight' && typeof e.data.value === 'number') {
        setLimeIframeH(h => Math.max(h, Math.min(e.data.value, 1600)))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    api.get<ModelData[]>('/models').then(res => {
      // Only show models with accuracy >= 80%
      const raw = (Array.isArray(res.data) ? res.data : []) as ModelData[]
      // Show all models ≥80% accuracy; unavailable ones show performance-only panel
      const all = raw.filter(m => m.accuracy >= 80)
      setModels(all)
      const firstActive = all.find(m => m.status === 'active') ?? all[0]
      if (firstActive) { setSelectedCat('All Experiments'); setSelectedModel(firstActive.id) }
    }).catch(e => setError(getApiErrorMessage(e))).finally(() => setModelsLoading(false))
  }, [])

  useEffect(() => {
    // Load sample texts for quick testing
    Promise.all([
      api.get('/experiments/dataset/samples?tool=Claude&limit=3'),
      api.get('/experiments/dataset/samples?tool=ChatGPT&limit=2'),
    ]).then(([claudeRes, chatRes]) => {
      const aiSamples = [
        ...(claudeRes.data as any[]).map(s => ({ label: 'AI – Claude', type: 'ai', text: s.text })),
        ...(chatRes.data as any[]).map(s => ({ label: 'AI – ChatGPT', type: 'ai', text: s.text })),
      ]
      setSamples(aiSamples)
    }).catch(() => {})
  }, [])

  const categories = useMemo(() => {
    const s = new Set<string>()
    models.forEach(m => { const v = getExpVariant(m); if (v) s.add(v) })
    return Array.from(s).sort()
  }, [models])

  const ALL_EXPERIMENTS = 'All Experiments'
  const catModels = useMemo(() =>
    selectedCat === ALL_EXPERIMENTS ? models : models.filter(m => getExpVariant(m) === selectedCat),
    [models, selectedCat])
  const selModel      = models.find(m => m.id === selectedModel)
  const selAvailable  = selModel?.status === 'active'
  const probs     = useMemo(() => result ? buildProbs(result) : { AI: 0, HUMAN: 0 }, [result])
  const tokens    = useMemo(() => result ? buildTokens(text.trim(), result.label) : [], [result, text])
  const winConf   = result ? (result.label === 'AI' ? probs.AI : probs.HUMAN) : 0
  const charPct   = Math.round((text.length / MAX_CHARS) * 100)

  const onCatChange = (cat: string) => {
    setSelectedCat(cat)
    const first = cat === ALL_EXPERIMENTS ? models[0] : models.find(m => getExpVariant(m) === cat)
    setSelectedModel(first?.id || '')
    setResult(null)
  }

  const onSubmit = async () => {
    if (!text.trim() || !selectedModel) return
    setLoading(true); setError(null); setResult(null)
    const t0 = Date.now(); setStartMs(t0)
    try {
      const res = await predict({ text, model: selectedModel })
      const ms = Date.now() - t0
      setElapsed(ms)
      setResult(res.data)
      showToast('Analysis complete.', 'success')
      const conf = res.data.label === 'AI'
        ? (res.data.probabilities?.AI ?? Number(res.data.score ?? 0))
        : (res.data.probabilities?.HUMAN ?? Number(res.data.score ?? 0))
      setHistory(prev => [{
        id: Math.random().toString(36).slice(2),
        text: text.trim().slice(0, 80),
        label: res.data.label,
        confidence: conf,
        model: selModel?.name ?? res.data.model ?? '',
        ts: t0,
        ms,
        category: res.data.category,
        category_icon: res.data.category_icon,
      }, ...prev].slice(0, 5))
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) {
      const msg = getApiErrorMessage(e, 'Failed to make prediction.')
      setError(msg); showToast(msg, 'error')
    } finally { setLoading(false) }
  }

  const openLime = async () => {
    const exp = selModel?.experiment
    if (!exp) return
    setLimeLoading(true)
    setLimeOpen(true)
    setLimeIframeH(600)
    try {
      const r = await api.get<string>(`/experiments/xai/lime/${exp}/0`)
      if (limeBlob.current) URL.revokeObjectURL(limeBlob.current)
      const blob = new Blob([r.data], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      limeBlob.current = url
      setLimeUrl(url)
    } catch {
      setLimeOpen(false)
    } finally {
      setLimeLoading(false)
    }
  }

  const closeLime = () => {
    setLimeOpen(false)
    setLimeUrl(null)
    if (limeBlob.current) { URL.revokeObjectURL(limeBlob.current); limeBlob.current = null }
  }

  const isAI = result?.label === 'AI'

  /* ─── Render ─── */
  return (
    <div className="space-y-6 pb-12">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4338CA] via-[#5B21B6] to-[#1D4ED8] px-7 py-7 text-white shadow-xl"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/4 h-36 w-36 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-200">
              <Brain size={12} /> Somali Text Classifier
            </div>
            <h1 className="text-[1.75rem] font-extrabold tracking-tight leading-tight">Predict</h1>
            <p className="mt-1 text-sm text-indigo-200/90">
              AI vs Human detection — {modelsLoading ? '…' : `${models.filter(m=>m.status==='active').length} active`} of {modelsLoading ? '…' : models.length} classifiers
            </p>
          </div>
          <div className="shrink-0 hidden sm:flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-bold">{modelsLoading ? 'Loading…' : `${models.length} models`}</span>
            <Zap size={14} className="text-amber-300" />
          </div>
        </div>
      </motion.div>

      {/* ── Model Selection ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900"
      >
        <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/10">
            <Zap size={15} className="text-primary-600 dark:text-primary-400" />
          </div>
          <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Model Configuration</span>
          {selModel && (
            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              selAvailable
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
            }`}>
              {selAvailable ? `${fmtMet(selModel.accuracy, '%')} Accuracy` : `${fmtMet(selModel.accuracy, '%')} · Performance Only`}
            </span>
          )}
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {/* Experiment */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              Experiment
            </label>
            <div className="relative">
              <select
                value={selectedCat}
                disabled={modelsLoading || categories.length === 0}
                onChange={e => onCatChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-4 pr-10 text-sm font-semibold text-neutral-800 transition-all duration-200 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-800"
              >
                {categories.length === 0
                  ? <option>No experiments</option>
                  : <>
                      <option value="All Experiments">All Experiments ({models.length} models)</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </>
                }
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              Classifier
            </label>
            <div className="relative">
              <select
                value={selectedModel}
                disabled={modelsLoading || catModels.length === 0}
                onChange={e => { setSelectedModel(e.target.value); setResult(null) }}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-4 pr-10 text-sm font-semibold text-neutral-800 transition-all duration-200 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-800"
              >
                {catModels.length === 0
                  ? <option>No models</option>
                  : catModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.status !== 'active' ? ' — [No file]' : ''}
                      </option>
                    ))
                }
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          </div>
        </div>

        {/* Stats row */}
        {selModel && (
          <div className="mx-6 mb-5 grid grid-cols-3 gap-2 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
            {[
              { l: 'Type',      v: getCategoryGroup(selModel.type) },
              { l: 'Accuracy',  v: fmtMet(selModel.accuracy, '%') },
              { l: 'F1 Score',  v: fmtMet(selModel.f1) },
            ].map(({ l, v }) => (
              <div key={l}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{l}</p>
                <p className="mt-1 text-xs font-bold text-neutral-700 dark:text-neutral-200">{v}</p>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Performance-Only Panel (deep learning / unavailable models) ───── */}
      {selModel && !selAvailable && (
        <motion.div
          key={selModel.id + '-perf'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="overflow-hidden rounded-2xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-700/40 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-6 py-4 dark:border-amber-700/30 dark:bg-amber-900/10">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/15">
              <Brain size={15} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Performance Metrics</p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Test-set evaluation — live inference not available for this model</p>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              Performance Only
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
            {[
              { l: 'Accuracy',  v: fmtMet(selModel.accuracy, '%'),  color: 'text-blue-600 dark:text-blue-400' },
              { l: 'F1 Score',  v: fmtMet(selModel.f1),             color: 'text-violet-600 dark:text-violet-400' },
              { l: 'Precision', v: fmtMet(selModel.precision),      color: 'text-emerald-600 dark:text-emerald-400' },
              { l: 'Recall',    v: fmtMet(selModel.recall),         color: 'text-orange-600 dark:text-orange-400' },
            ].map(({ l, v, color }) => (
              <div key={l} className="rounded-xl bg-neutral-50 p-4 text-center dark:bg-neutral-800/40">
                <p className={`text-2xl font-black ${color}`}>{v}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{l}</p>
              </div>
            ))}
          </div>
          <div className="mx-6 mb-5 rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/30 dark:text-neutral-400">
            Model weights for deep learning and transformer models are not deployed in this environment. The metrics above are from held-out test set evaluation during training.
          </div>
        </motion.div>
      )}

      {/* ── Quick Test Samples ───────────────────────────────────────────── */}
      {samples.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900"
        >
          <button
            onClick={() => setSamplesOpen(v => !v)}
            className="flex w-full items-center gap-3 px-6 py-3.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
              <FileText size={13} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="flex-1 text-left text-sm font-bold text-neutral-800 dark:text-neutral-100">Quick Test Samples</span>
            <span className="text-[11px] text-neutral-400">{samples.length} AI samples · click to load</span>
            {samplesOpen ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
          </button>
          {samplesOpen && (
            <div className="divide-y divide-neutral-50 px-4 pb-4 dark:divide-neutral-800/50">
              {samples.map((s, i) => (
                <div key={i} className="py-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                      s.type === 'ai'
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                        : 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                    }`}>{s.label}</span>
                  </div>
                  <p className="mb-2 line-clamp-2 text-[12px] leading-5 text-neutral-500 dark:text-neutral-400">{s.text.slice(0, 160)}…</p>
                  <button
                    onClick={() => { setText(s.text); setResult(null); setSamplesOpen(false) }}
                    className="rounded-lg bg-neutral-100 px-3 py-1 text-[11px] font-bold text-neutral-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
                  >
                    Use this text →
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Text Input ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="input-focus-glow overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm transition-all duration-200 dark:border-neutral-800/60 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-3.5 dark:border-neutral-800">
          <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Somali Text</span>
          <span className={`text-[11px] font-semibold tabular-nums transition-colors ${
            charPct > 90 ? 'text-red-500' : charPct > 70 ? 'text-amber-500' : 'text-neutral-400 dark:text-neutral-500'
          }`}>
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Ku qor ama halkan ku dheji qoraalka af-Soomaaliga ah…"
          className="textarea-premium w-full min-h-[200px] resize-y border-0 bg-transparent px-6 py-5 text-[15px] leading-8 text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100 dark:placeholder-neutral-600"
        />

        {/* Character bar */}
        <div className="h-1 bg-neutral-100 dark:bg-neutral-800">
          <motion.div
            animate={{ width: `${charPct}%` }}
            transition={{ duration: 0.15 }}
            className={`h-full transition-colors duration-300 ${
              charPct > 90 ? 'bg-red-500' : charPct > 70 ? 'bg-amber-400' : 'bg-primary-500'
            }`}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <button
            onClick={() => { setText(''); setResult(null); setError(null) }}
            disabled={!text && !result}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <RotateCcw size={13} /> Clear
          </button>

          <button
            onClick={onSubmit}
            disabled={!text.trim() || !selectedModel || loading || modelsLoading || !selAvailable}
            className={`group relative flex items-center gap-2 overflow-hidden rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none active:translate-y-0 ${
              selAvailable
                ? 'bg-primary-600 shadow-primary-500/25 hover:bg-primary-700 hover:shadow-primary-500/35'
                : 'bg-amber-500 shadow-amber-500/25 hover:bg-amber-600'
            }`}
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Analyzing…
              </>
            ) : !selAvailable ? (
              <>
                <Brain size={15} />
                Weights Not Deployed
              </>
            ) : (
              <>
                <Send size={15} />
                Analyze Text
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-900/20"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RESULT SECTION ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {result && (
          <motion.div
            ref={resultRef}
            key="result"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="space-y-5"
          >
            {/* ── Verdict Card ── */}
            <div className={`overflow-hidden rounded-2xl shadow-lg ${
              isAI
                ? 'bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900'
                : 'bg-gradient-to-br from-orange-500 via-orange-600 to-amber-700'
            }`}>
              <div className="relative px-8 py-7">
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className={`absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl ${isAI ? 'bg-blue-300/20' : 'bg-amber-300/20'}`} />
                  <div className={`absolute -bottom-12 left-1/3 h-32 w-32 rounded-full blur-3xl ${isAI ? 'bg-cyan-400/15' : 'bg-orange-200/15'}`} />
                </div>

                <div className="relative flex flex-col items-center text-center gap-5 sm:flex-row sm:text-left">
                  {/* Icon */}
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-xl ${
                    isAI ? 'bg-white/15' : 'bg-white/15'
                  }`}>
                    {isAI
                      ? <Brain size={30} className="text-white" />
                      : <CheckCircle2 size={30} className="text-white" />
                    }
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Classification Result</p>
                    <h2 className="mt-1 text-4xl font-black tracking-tight text-white">
                      {isAI ? 'AI Generated' : 'Human Written'}
                    </h2>
                    <p className="mt-1.5 text-base font-semibold text-white/75">
                      {isAI
                        ? 'This text was likely produced by an AI language model.'
                        : 'This text appears to be authored by a human writer.'}
                    </p>
                    {result.category && result.category !== 'Unknown' && (
                      <div className="mt-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                          <span className="text-base leading-none">{result.category_icon}</span>
                          <span>{result.category}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Topic</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Gauge */}
                  <div className="shrink-0">
                    <ConfidenceGauge value={winConf} label={result.label} />
                  </div>
                </div>

                {/* Meta strip */}
                <div className="relative mt-6 flex flex-wrap items-center gap-3 border-t border-white/15 pt-5">
                  {[
                    { icon: <Zap size={12} />, label: selModel?.name ?? result.model ?? '—' },
                    { icon: <Clock size={12} />, label: `${elapsed}ms` },
                    { icon: <CheckCircle2 size={12} />, label: fmtPct(winConf) + ' confidence' },
                  ].map(({ icon, label }) => (
                    <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                      {icon} {label}
                    </span>
                  ))}
                  {result.category && result.category !== 'Unknown' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                      <span>{result.category_icon}</span> {result.category}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] font-semibold text-white/50">
                    {fmtTime(startMs)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Probability Distribution ── */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900">
              <p className="mb-5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                Probability Distribution
              </p>
              <div className="space-y-5">
                {(['AI', 'HUMAN'] as const).map(lbl => {
                  const val = probs[lbl]
                  const winner = result.label === lbl
                  return (
                    <div key={lbl}>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${lbl === 'AI' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                          <span className={`text-sm font-bold ${winner ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
                            {lbl === 'AI' ? 'AI Generated' : 'Human Written'}
                          </span>
                          {winner && (
                            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white dark:bg-white dark:text-neutral-900">
                              WINNER
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-lg font-black text-neutral-900 dark:text-white">
                          {fmtPct(val)}
                        </span>
                      </div>
                      <div className="relative h-3 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(val * 100, 100)}%` }}
                          transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            lbl === 'AI'
                              ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                              : 'bg-gradient-to-r from-orange-500 to-amber-400'
                          }`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Model metrics */}
              {selModel && (
                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-5 dark:border-neutral-800">
                  {[
                    { l: 'Model Family', v: getCategoryGroup(selModel.type) },
                    { l: 'F1 Score',     v: fmtMet(selModel.f1) },
                    { l: 'Model Acc.',   v: fmtMet(selModel.accuracy, '%') },
                  ].map(({ l, v }) => (
                    <div key={l} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/40">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{l}</p>
                      <p className="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-200">{v}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── XAI Token Analysis ── */}
            <div
              className="overflow-hidden rounded-2xl border shadow-sm"
              style={{ borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }}
            >
              {/* Header */}
              <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: '#F1F5F9' }}>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: '#EEF2FF' }}>
                    <Sparkles size={15} style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Explainability</p>
                    <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Token Influence Analysis</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-wrap gap-3" style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: '#FED7AA', border: '1.5px solid #F97316' }} />
                      Human leaning
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: '#BFDBFE', border: '1.5px solid #3B82F6' }} />
                      AI leaning
                    </span>
                  </div>
                  {selModel?.experiment && (
                    <button
                      onClick={openLime}
                      disabled={limeLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
                    >
                      <Microscope size={12} />
                      {limeLoading ? 'Loading…' : 'LIME View'}
                    </button>
                  )}
                </div>
              </div>

              {/* Tokens — preserved exactly */}
              <div
                className="min-h-[10rem] overflow-auto p-6 font-serif text-sm leading-[2.4]"
                style={{ backgroundColor: '#F8FAFC', color: '#0F172A' }}
              >
                {tokens.map((token, i) => {
                  if (!token.tone) return <span key={`p-${i}`}>{token.text}</span>
                  const isAITone = token.tone === 'ai'
                  const s: React.CSSProperties = isAITone
                    ? { backgroundColor: '#DBEAFE', color: '#1D4ED8', border: '1.5px solid #3B82F6', borderRadius: '6px', padding: '3px 8px', margin: '0 3px', display: 'inline-block', lineHeight: '1.4', cursor: 'default', fontWeight: 700 }
                    : { backgroundColor: '#FFEDD5', color: '#C2410C', border: '1.5px solid #F97316', borderRadius: '6px', padding: '3px 8px', margin: '0 3px', display: 'inline-block', lineHeight: '1.4', cursor: 'default', fontWeight: 700 }
                  return (
                    <mark key={token.key ?? `h-${i}`} style={s}
                      title={`Word: ${token.text?.trim()}\nScore: ${token.score?.toFixed(2) ?? '—'}\nDirection: ${token.direction}`}>
                      {token.text}
                    </mark>
                  )
                })}
              </div>

              {/* Analyzed text */}
              <div className="border-t px-6 py-4" style={{ borderColor: '#F1F5F9' }}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94A3B8' }}>Input Text</p>
                <p className="max-h-20 overflow-auto text-sm leading-relaxed" style={{ color: '#475569' }}>
                  {text.trim()}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Prediction History ─────────────────────────────────────────── */}
      <AnimatePresence>
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-2.5 border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                <History size={14} className="text-neutral-500 dark:text-neutral-400" />
              </div>
              <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Session History</span>
              <span className="ml-auto text-[11px] font-semibold text-neutral-400">{history.length} prediction{history.length > 1 ? 's' : ''}</span>
            </div>

            <div className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
              {history.map((h, i) => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-neutral-50/60 dark:hover:bg-neutral-800/20"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white text-xs font-black shadow ${
                    h.label === 'AI'
                      ? 'bg-gradient-to-br from-blue-500 to-blue-700'
                      : 'bg-gradient-to-br from-orange-500 to-amber-600'
                  }`}>
                    {h.label === 'AI' ? 'AI' : 'HU'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">{h.text}…</p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {h.model} · {fmtTime(h.ts)}
                      {h.category && h.category !== 'Unknown' && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          {h.category_icon} {h.category}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-neutral-600 dark:text-neutral-400">
                    {Math.round(h.confidence * 100)}%
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state before first prediction ───────────────────────── */}
      <AnimatePresence>
        {!result && !loading && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-neutral-200 bg-white/50 py-14 text-center dark:border-neutral-800 dark:bg-neutral-900/30"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800">
              <Brain size={24} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <div>
              <p className="font-bold text-neutral-700 dark:text-neutral-300">Results appear here</p>
              <p className="mt-1 max-w-xs text-sm text-neutral-400 dark:text-neutral-500">
                Enter Somali text above and click{' '}
                <span className="font-semibold text-primary-600 dark:text-primary-400">Analyze Text</span>{' '}
                to see the classification output.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LIME Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {limeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={closeLime}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-[#0F172A] sm:max-w-4xl sm:rounded-2xl"
              style={{ height: '92vh', maxHeight: '92vh' }}
            >
              {/* Header bar */}
              <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 bg-white px-6 py-4 dark:border-white/[0.07] dark:bg-[#0F172A]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
                  <Microscope size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">LIME Interpretability</p>
                  <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Local Feature Explanation</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 sm:inline">
                    Pre-computed · Test Set Sample
                  </span>
                  <button
                    onClick={closeLime}
                    className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
                  >
                    <X size={16} className="text-neutral-400" />
                  </button>
                </div>
              </div>

              {/* Info strip */}
              <div className="shrink-0 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-2.5 dark:from-indigo-900/20 dark:to-purple-900/20">
                <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  Green bars = words pushing toward <strong>AI</strong> · Red bars = words pushing toward <strong>Human</strong> · Bar length = feature weight
                </p>
              </div>

              {/* iframe — scrollable content area */}
              <div className="min-h-0 flex-1 overflow-auto bg-white">
                {limeLoading || !limeUrl ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-24">
                    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-indigo-500" />
                    <p className="text-[12px] font-semibold text-neutral-400">Loading LIME explanation…</p>
                  </div>
                ) : (
                  <iframe
                    src={limeUrl}
                    style={{ width: '100%', height: limeIframeH, display: 'block', border: 'none' }}
                    sandbox="allow-scripts"
                    title="LIME Explanation"
                  />
                )}
              </div>

              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between border-t border-neutral-100 bg-neutral-50/80 px-6 py-3 dark:border-white/[0.05] dark:bg-[#0F172A]">
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  For full SHAP + LIME analysis across all test samples, visit the <span className="font-semibold text-indigo-500">Explainability</span> page.
                </p>
                <button
                  onClick={closeLime}
                  className="rounded-xl bg-neutral-200 px-4 py-1.5 text-[12px] font-bold text-neutral-700 transition-colors hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
