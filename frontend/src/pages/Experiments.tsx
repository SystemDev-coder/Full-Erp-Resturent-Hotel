import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts'
import {
  Trophy, FlaskConical, Search, X, FileSpreadsheet,
  Download, ChevronRight, Layers, Brain, Cpu, Database,
  Bot, MessageSquare, Sparkles,
} from 'lucide-react'
import { listExperiments } from '../services/experimentService'
import { getApiErrorMessage } from '../services/api'
import { useToast } from '../contexts/ToastContext'
import type { Experiment } from '../types/experiment'

interface AiCategoryStat { category: string; total: number; original: number; Claude: number; ChatGPT: number; Gemini: number }
interface AiStats { total: number; categories: AiCategoryStat[]; tool_totals: { tool: string; count: number }[] }
interface ClaudeWord { word: string; score: number; count: number }
interface AiSample { text: string; category: string; ai_tool: string }
interface WordCloudWord { word: string; count: number; weight: number }
type WordCloudData = Record<'Claude' | 'ChatGPT' | 'Gemini' | 'Human', WordCloudWord[]>

/* ── Types ────────────────────────────────────────────────────────────────── */
interface ComparisonRow {
  experiment: string; family: string; model: string
  accuracy: number; precision: number; recall: number
  f1: number; macro_f1: number; test_rows: number
}

/* ── Constants ────────────────────────────────────────────────────────────── */
const EXP_META: Record<string, { short: string; label: string; gradient: string; badge: string }> = {
  experiment_1_stopwords_included: {
    short: 'Exp 1', label: 'Stopwords Included',
    gradient: 'from-violet-600 via-purple-600 to-indigo-700',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  },
  experiment_2_stopwords_removed: {
    short: 'Exp 2', label: 'Stopwords Removed',
    gradient: 'from-sky-600 via-cyan-600 to-teal-600',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
}

const FAMILY_META: Record<string, { label: string; color: string; dot: string; icon: typeof Layers }> = {
  traditional_ml: { label: 'Traditional ML', color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',   dot: 'bg-blue-500', icon: Layers },
  deep_learning:  { label: 'Deep Learning',  color: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400', dot: 'bg-orange-500', icon: Brain },
  transformers:   { label: 'Transformer',    color: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400', dot: 'bg-violet-500', icon: Cpu },
}

const downloadCSV = (items: Experiment[], name: string) => {
  if (!items.length) return
  const headers = ['Name', 'Date', 'Status', 'Accuracy', 'F1', 'Models', 'Dataset', 'Notes']
  const rows = items.map(i => [i.name, i.date, i.status, i.accuracy, i.f1, i.models, i.dataset ?? '', i.notes ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.setAttribute('download', `${name}.csv`)
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}

/* ── Sub-components ───────────────────────────────────────────────────────── */
function ExperimentCard({ exp, comparison, onClick }: {
  exp: Experiment
  comparison: ComparisonRow[]
  onClick: () => void
}) {
  const meta   = EXP_META[exp.id] ?? { short: exp.id, label: exp.name, gradient: 'from-neutral-600 to-neutral-800', badge: '' }
  const myRows = comparison.filter(r => r.experiment === exp.id)
  const famCounts = {
    traditional_ml: myRows.filter(r => r.family === 'traditional_ml').length,
    deep_learning:  myRows.filter(r => r.family === 'deep_learning').length,
    transformers:   myRows.filter(r => r.family === 'transformers').length,
  }
  const bestModel = (exp.params as Record<string, unknown>)?.best_model as string | undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm transition-all duration-300 hover:shadow-lg dark:border-neutral-800/60 dark:bg-neutral-900"
    >
      {/* Gradient top bar */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${meta.gradient}`} />

      <div className="p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${meta.badge}`}>
              {meta.short}
            </span>
            <h3 className="mt-2 text-base font-extrabold leading-tight text-neutral-900 dark:text-white">
              {meta.label}
            </h3>
            <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{exp.date}</p>
          </div>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${meta.gradient} shadow-md`}>
            <FlaskConical size={18} className="text-white" />
          </div>
        </div>

        {/* Key metrics */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { label: 'Best Acc.', value: `${exp.accuracy.toFixed(1)}%` },
            { label: 'Best F1',  value: exp.f1.toFixed(3) },
            { label: 'Models',   value: exp.models },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/40">
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
              <p className="mt-0.5 text-sm font-black text-neutral-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Best model */}
        {bestModel && (
          <div className="mb-4 rounded-xl border border-neutral-100 bg-neutral-50/60 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/20">
            <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Top Model</p>
            <p className="mt-0.5 text-xs font-bold text-neutral-700 dark:text-neutral-200">{bestModel}</p>
          </div>
        )}

        {/* Family breakdown */}
        <div className="mb-5 flex gap-2">
          {Object.entries(famCounts).map(([key, count]) => {
            const fm = FAMILY_META[key]
            return (
              <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${fm.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${fm.dot}`} />
                {count}
              </span>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onClick}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r ${meta.gradient} py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:opacity-90`}>
            View Details <ChevronRight size={13} />
          </button>
          <button onClick={() => downloadCSV([exp], `experiment-${exp.id}`)}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-bold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            <Download size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Main Component ───────────────────────────────────────────────────────── */
export default function Experiments() {
  const [experiments, setExperiments]   = useState<Experiment[]>([])
  const [comparison, setComparison]     = useState<ComparisonRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [cmpLoading, setCmpLoading]     = useState(true)
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [selected, setSelected]         = useState<Experiment | null>(null)

  const [expTab, setExpTab]     = useState<'all' | string>('all')
  const [famTab, setFamTab]     = useState<'all' | string>('all')
  const [cmpSearch, setCmpSearch] = useState('')

  const [aiStats, setAiStats]       = useState<AiStats | null>(null)
  const [claudeWords, setClaudeWords] = useState<ClaudeWord[]>([])
  const [aiSamples, setAiSamples]   = useState<AiSample[]>([])
  const [sampleTool, setSampleTool] = useState<'Claude' | 'ChatGPT' | 'Gemini'>('Claude')
  const [dataTab, setDataTab]       = useState<'overview' | 'words' | 'samples' | 'wordcloud'>('overview')
  const [wordCloudData, setWordCloudData] = useState<WordCloudData | null>(null)
  const [wcSource, setWcSource]     = useState<'Claude' | 'ChatGPT' | 'Gemini' | 'Human'>('Claude')

  const { showToast } = useToast()

  const ALLOWED = ['experiment_1_stopwords_included', 'experiment_2_stopwords_removed']

  useEffect(() => {
    listExperiments()
      .then(r => setExperiments(r.data.filter(e => ALLOWED.includes(e.id)).sort((a, b) => a.id.localeCompare(b.id))))
      .catch(err => { const m = getApiErrorMessage(err, 'Unable to load experiments.'); setLoadError(m); showToast(m, 'error') })
      .finally(() => setLoading(false))

    import('../services/api').then(({ default: api }) => {
      api.get<ComparisonRow[]>('/experiments/comparison')
        .then(r => {
            const raw: ComparisonRow[] = Array.isArray(r.data) ? r.data : []
            const seen = new Set<string>()
            const deduped = raw.filter(row => {
              const key = `${row.experiment}::${row.model}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            setComparison(deduped)
          })
        .catch(() => setComparison([]))
        .finally(() => setCmpLoading(false))

      api.get<AiStats>('/experiments/dataset/ai-stats')
        .then(r => setAiStats(r.data))
        .catch(() => {})

      api.get<ClaudeWord[]>('/experiments/dataset/claude-words', { params: { limit: 15 } })
        .then(r => setClaudeWords(Array.isArray(r.data) ? r.data : []))
        .catch(() => {})

      api.get<AiSample[]>('/experiments/dataset/samples', { params: { tool: 'Claude', limit: 5 } })
        .then(r => setAiSamples(Array.isArray(r.data) ? r.data : []))
        .catch(() => {})

      api.get<WordCloudData>('/experiments/dataset/wordcloud', { params: { limit: 80 } })
        .then(r => setWordCloudData(r.data))
        .catch(() => {})
    })
  }, [showToast])

  const filteredCmp = useMemo(() => comparison.filter(r => {
    const eOk = expTab === 'all' || r.experiment === expTab
    const fOk = famTab === 'all' || r.family === famTab
    const sOk = !cmpSearch.trim() || r.model.toLowerCase().includes(cmpSearch.toLowerCase())
    return eOk && fOk && sOk
  }), [comparison, expTab, famTab, cmpSearch])

  /* Bar chart data — top 12 models by accuracy */
  const barData = useMemo(() =>
    filteredCmp.slice(0, 12).map(r => ({
      name: r.model.replace(/_/g, ' ').slice(0, 18),
      accuracy: r.accuracy,
      exp: r.experiment.includes('1') ? 'Exp 1' : 'Exp 2',
    })).reverse(),
    [filteredCmp])

  /* Per-family bar charts for the 3 model families */
  const familyChartData = useMemo(() => {
    const families = ['traditional_ml', 'deep_learning', 'transformers'] as const
    return families.map(fam => {
      const rows = comparison.filter(r => r.family === fam)
      const modelNames = [...new Set(rows.map(r => r.model.replace(/_/g, ' ')))]
      return {
        family: fam,
        data: modelNames.map(name => {
          const e1 = rows.find(r => r.model.replace(/_/g, ' ') === name && r.experiment.includes('1'))
          const e2 = rows.find(r => r.model.replace(/_/g, ' ') === name && r.experiment.includes('2'))
          return { name: name.slice(0, 20), 'Exp 1': e1 ? e1.accuracy : 0, 'Exp 2': e2 ? e2.accuracy : 0 }
        }),
      }
    })
  }, [comparison])

  const fetchSamples = (tool: 'Claude' | 'ChatGPT' | 'Gemini') => {
    setSampleTool(tool)
    import('../services/api').then(({ default: api }) =>
      api.get<AiSample[]>('/experiments/dataset/samples', { params: { tool, limit: 5 } })
        .then(r => setAiSamples(Array.isArray(r.data) ? r.data : []))
        .catch(() => setAiSamples([]))
    )
  }

  const cardCls = 'overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900'

  return (
    <div className="space-y-6 pb-12">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 px-7 py-7 text-white shadow-xl"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 h-40 w-40 rounded-full bg-violet-300/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-violet-200">
              <FlaskConical size={12} /> Somali NLP Research
            </div>
            <h1 className="text-[1.75rem] font-extrabold tracking-tight">Experiments</h1>
            <p className="mt-1 text-sm text-violet-200/90">
              {loading ? 'Loading…' : `${experiments.length} ablation experiments · ${comparison.length} model evaluations`}
            </p>
          </div>
          {!loading && (
            <div className="hidden sm:flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5">
              <Trophy size={14} className="text-amber-300" />
              <span className="text-sm font-bold">{comparison.length} models ranked</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {loadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {loadError}
        </div>
      )}

      {/* ── Experiment Cards ─────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1].map(i => (
            <div key={i} className={`${cardCls} h-72 animate-pulse`}>
              <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-700" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {experiments.map(exp => (
            <ExperimentCard key={exp.id} exp={exp} comparison={comparison} onClick={() => setSelected(exp)} />
          ))}
        </div>
      )}

      {/* ── Dataset Analytics ────────────────────────────────────────── */}
      {aiStats && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={cardCls}>
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
                <Database size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">Dataset Analytics</h2>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  {aiStats.total.toLocaleString()} articles · AI-generated by Claude, ChatGPT & Gemini
                </p>
              </div>
            </div>
            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'overview', label: 'Overview' },
                { key: 'words', label: 'Top Words' },
                { key: 'wordcloud', label: '☁ Word Cloud' },
                { key: 'samples', label: 'Samples' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setDataTab(key)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    dataTab === key ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Overview tab: AI counts per category ── */}
          {dataTab === 'overview' && (
            <div className="p-6 space-y-5">
              {/* Tool totals */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { tool: 'Claude', color: 'from-violet-500 to-purple-600', icon: Bot },
                  { tool: 'ChatGPT', color: 'from-emerald-500 to-teal-600', icon: MessageSquare },
                  { tool: 'Gemini', color: 'from-blue-500 to-cyan-600', icon: Sparkles },
                ].map(({ tool, color, icon: Icon }) => {
                  const t = aiStats.tool_totals.find(x => x.tool === tool)
                  return (
                    <div key={tool} className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800/40">
                      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${color}`}>
                        <Icon size={14} className="text-white" />
                      </div>
                      <p className="text-xl font-black text-neutral-900 dark:text-white">{t?.count.toLocaleString() ?? 0}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{tool}</p>
                    </div>
                  )
                })}
              </div>

              {/* Per-category bar chart */}
              {(() => {
                const totalAllAI = aiStats.categories.reduce(
                  (s, c) => s + (c.Claude || 0) + (c.ChatGPT || 0) + (c.Gemini || 0), 0
                )
                const renderTopLabel = (props: any) => {
                  const { x, y, width, index } = props
                  const cat = aiStats.categories[index]
                  if (!cat) return null
                  const count = (cat.Claude || 0) + (cat.ChatGPT || 0) + (cat.Gemini || 0)
                  if (!count) return null
                  const pct = totalAllAI > 0 ? Math.round(count / totalAllAI * 100) : 0
                  return (
                    <text x={x + width / 2} y={y - 5} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight={700}>
                      {count} ({pct}%)
                    </text>
                  )
                }
                return (
                  <div>
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">AI-Generated Samples per Category</p>
                    <div style={{ height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={aiStats.categories} margin={{ top: 22, right: 10, left: 0, bottom: 55 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                          <XAxis dataKey="category" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} height={55} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconType="square" iconSize={10} />
                          <Bar dataKey="Claude"  stackId="a" fill="#8b5cf6" radius={[0,0,0,0]} />
                          <Bar dataKey="ChatGPT" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                          <Bar dataKey="Gemini"  stackId="a" fill="#3b82f6" radius={[4,4,0,0]}>
                            <LabelList content={renderTopLabel} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Words tab: Claude-specific words ── */}
          {dataTab === 'words' && (
            <div className="p-6">
              <p className="mb-4 text-[11px] text-neutral-500 dark:text-neutral-400">
                Words significantly more frequent in <strong className="text-violet-600 dark:text-violet-400">Claude-generated</strong> articles compared to ChatGPT & Gemini (relative frequency ratio).
              </p>
              {claudeWords.length === 0 ? (
                <p className="text-sm text-neutral-400">No data available</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {claudeWords.map((w, i) => {
                    const max = claudeWords[0]?.score ?? 1
                    return (
                      <div key={w.word} className="rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/20">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-black ${i < 3 ? 'bg-violet-500 text-white' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'}`}>{i+1}</span>
                            <span className="text-sm font-bold text-neutral-900 dark:text-white">{w.word}</span>
                          </span>
                          <span className="text-[10px] text-neutral-400">{w.count} uses · ×{w.score.toFixed(2)} ratio</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${(w.score / max) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Word Cloud tab ── */}
          {dataTab === 'wordcloud' && (
            <div className="p-6 space-y-5">
              {/* Source selector */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-1">Source:</span>
                {([
                  { key: 'Claude',  bg: 'bg-violet-500',  ring: 'ring-violet-400' },
                  { key: 'ChatGPT', bg: 'bg-emerald-500', ring: 'ring-emerald-400' },
                  { key: 'Gemini',  bg: 'bg-blue-500',    ring: 'ring-blue-400' },
                  { key: 'Human',   bg: 'bg-amber-500',   ring: 'ring-amber-400' },
                ] as const).map(({ key, bg, ring }) => (
                  <button key={key} onClick={() => setWcSource(key)}
                    className={`rounded-full px-4 py-1.5 text-[11px] font-bold text-white transition-all ${bg} ${wcSource === key ? `ring-2 ${ring} ring-offset-1 scale-105` : 'opacity-60 hover:opacity-90'}`}>
                    {key}
                  </button>
                ))}
              </div>

              {/* Cloud */}
              {!wordCloudData ? (
                <div className="flex h-56 items-center justify-center text-sm text-neutral-400">Loading word cloud…</div>
              ) : (() => {
                const SOURCE_COLORS: Record<string, string[]> = {
                  Claude:  ['#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#6d28d9','#4c1d95'],
                  ChatGPT: ['#059669','#10b981','#34d399','#6ee7b7','#047857','#065f46'],
                  Gemini:  ['#1d4ed8','#3b82f6','#60a5fa','#93c5fd','#1e40af','#1e3a8a'],
                  Human:   ['#b45309','#d97706','#f59e0b','#fcd34d','#92400e','#78350f'],
                }
                const words = wordCloudData[wcSource] ?? []
                const maxW = words[0]?.weight ?? 1
                const colors = SOURCE_COLORS[wcSource] ?? SOURCE_COLORS.Claude
                return (
                  <div className="relative min-h-[280px] rounded-2xl border border-neutral-100 bg-neutral-50/50 p-6 dark:border-neutral-800 dark:bg-neutral-900/40 overflow-hidden">
                    <div className="flex flex-wrap gap-x-3 gap-y-2.5 items-end leading-none">
                      {words.map((w, i) => {
                        const ratio = w.weight / maxW
                        const size = Math.round(11 + ratio * 26)
                        const color = colors[i % colors.length]
                        const opacity = 0.55 + ratio * 0.45
                        return (
                          <motion.span
                            key={w.word}
                            title={`${w.word}: ${w.count} occurrences`}
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity, scale: 1 }}
                            transition={{ duration: 0.35, delay: i * 0.008 }}
                            className="cursor-default select-none font-bold transition-transform hover:scale-110"
                            style={{ fontSize: size, color, lineHeight: 1.3 }}
                          >
                            {w.word}
                          </motion.span>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Legend / stats */}
              {wordCloudData && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(['Claude', 'ChatGPT', 'Gemini', 'Human'] as const).map(src => {
                    const total = (wordCloudData[src] ?? []).reduce((s, w) => s + w.count, 0)
                    const palette: Record<string, string> = {
                      Claude: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
                      ChatGPT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                      Gemini: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
                      Human: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                    }
                    return (
                      <button key={src} onClick={() => setWcSource(src)}
                        className={`rounded-xl p-3 text-left transition-all ${wcSource === src ? 'ring-2 ring-offset-1 ' + (src === 'Claude' ? 'ring-violet-400' : src === 'ChatGPT' ? 'ring-emerald-400' : src === 'Gemini' ? 'ring-blue-400' : 'ring-amber-400') : ''} ${palette[src]}`}>
                        <div className="text-[11px] font-bold">{src}</div>
                        <div className="text-[10px] opacity-70">{(wordCloudData[src] ?? []).length} words · {total.toLocaleString()} total</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Samples tab: AI-generated texts ── */}
          {dataTab === 'samples' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Show samples from:</span>
                {(['Claude', 'ChatGPT', 'Gemini'] as const).map(tool => (
                  <button key={tool} onClick={() => fetchSamples(tool)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      sampleTool === tool ? 'bg-violet-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}>
                    {tool}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {aiSamples.length === 0 ? (
                  <p className="text-sm text-neutral-400">No samples available</p>
                ) : aiSamples.map((s, i) => (
                  <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{s.category}</span>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{s.ai_tool}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{s.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Per-Family Model Comparison Charts ───────────────────────── */}
      {!cmpLoading && comparison.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-4">
          <div className="px-1">
            <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">Model Comparison by Family</h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">Accuracy (%) — Experiment 1 vs Experiment 2 per model family</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {familyChartData.map(({ family, data }) => {
              const fm = FAMILY_META[family]
              const colors = { traditional_ml: ['#8b5cf6','#06b6d4'], deep_learning: ['#f97316','#fb923c'], transformers: ['#3b82f6','#22d3ee'] }
              const [c1, c2] = colors[family as keyof typeof colors] ?? ['#8b5cf6','#06b6d4']
              return (
                <div key={family} className={`${cardCls} p-5`}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${fm.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${fm.dot}`} />{fm.label}
                    </span>
                  </div>
                  {data.length === 0 ? (
                    <p className="text-sm text-neutral-400">No data</p>
                  ) : (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 0, right: 8, left: -20, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-35} textAnchor="end" interval={0} />
                          <YAxis domain={[75, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                          <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                          <Bar dataKey="Exp 1" fill={c1} radius={[3,3,0,0]} maxBarSize={28} />
                          <Bar dataKey="Exp 2" fill={c2} radius={[3,3,0,0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="mt-2 flex justify-center gap-4 text-[10px] font-bold">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c1 }} />Exp 1</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c2 }} />Exp 2</span>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── Model Leaderboard ────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={cardCls}>

        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-neutral-100 px-6 py-5 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-orange-500/20">
              <Trophy size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-neutral-900 dark:text-white">Model Leaderboard</h2>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                All models ranked by accuracy across both experiments
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-52">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={cmpSearch} onChange={e => setCmpSearch(e.target.value)} placeholder="Search model…"
              className="h-9 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-8 pr-3 text-xs font-semibold text-neutral-800 placeholder-neutral-400 focus:border-primary-400 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
          {/* Experiment tabs */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Experiment:</span>
            {[
              { key: 'all', label: 'Both' },
              { key: 'experiment_1_stopwords_included', label: 'Exp 1 — Stopwords Included' },
              { key: 'experiment_2_stopwords_removed',  label: 'Exp 2 — Stopwords Removed' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setExpTab(key)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                  expTab === key
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
          {/* Family tabs */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Family:</span>
            {[
              { key: 'all', label: 'All' },
              { key: 'traditional_ml', label: 'Traditional ML' },
              { key: 'deep_learning',  label: 'Deep Learning' },
              { key: 'transformers',   label: 'Transformer' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFamTab(key)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                  famTab === key
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Bar chart — top models */}
        {!cmpLoading && filteredCmp.length > 0 && (
          <div className="border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Accuracy Overview (top 12)</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="rgba(148,163,184,0.4)" tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} stroke="rgba(148,163,184,0.4)" />
                  <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                  <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}
                    fill="url(#accGrad)"
                  />
                  <defs>
                    <linearGradient id="accGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800">
                {['#', 'Model', 'Experiment', 'Family', 'Accuracy', 'F1', 'Precision', 'Recall'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/40">
              {cmpLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 w-full animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredCmp.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-neutral-400">
                      <Trophy size={28} className="text-neutral-200 dark:text-neutral-700" />
                      <p className="text-sm font-semibold">No models match the current filters.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredCmp.map((row, idx) => {
                const globalRank = comparison.findIndex(r => r.model === row.model && r.experiment === row.experiment) + 1
                const fam  = FAMILY_META[row.family] ?? { label: row.family, color: 'bg-neutral-100 text-neutral-600', dot: 'bg-neutral-400' }
                const exp  = EXP_META[row.experiment] ?? { short: row.experiment, badge: 'bg-neutral-100 text-neutral-600' }
                const medal = globalRank === 1 ? '🥇' : globalRank === 2 ? '🥈' : globalRank === 3 ? '🥉' : null
                const isTop3 = globalRank <= 3

                return (
                  <motion.tr key={`${row.experiment}-${row.model}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.015, 0.3) }}
                    className={`transition-colors hover:bg-neutral-50/80 dark:hover:bg-neutral-800/20 ${isTop3 ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}`}
                  >
                    {/* Rank */}
                    <td className="w-10 px-5 py-3.5 text-center">
                      {medal
                        ? <span className="text-lg leading-none">{medal}</span>
                        : <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500">#{globalRank}</span>}
                    </td>

                    {/* Model */}
                    <td className="px-5 py-3.5">
                      <span className={`text-sm font-bold ${isTop3 ? 'text-neutral-900 dark:text-white' : 'text-neutral-700 dark:text-neutral-300'}`}>
                        {row.model}
                      </span>
                    </td>

                    {/* Experiment */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${exp.badge}`}>
                        {exp.short}
                      </span>
                    </td>

                    {/* Family */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${fam.color}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${fam.dot}`} />
                        {fam.label}
                      </span>
                    </td>

                    {/* Accuracy with bar */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-14 text-right font-mono text-xs font-black text-neutral-800 dark:text-neutral-200">
                          {row.accuracy.toFixed(2)}%
                        </span>
                        <div className="relative h-2 w-20 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${row.accuracy}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut', delay: idx * 0.02 }}
                            className={`absolute inset-y-0 left-0 rounded-full ${
                              row.accuracy >= 90 ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : row.accuracy >= 80 ? 'bg-gradient-to-r from-violet-500 to-indigo-400'
                              : 'bg-gradient-to-r from-amber-400 to-orange-400'
                            }`}
                          />
                        </div>
                      </div>
                    </td>

                    {/* F1 */}
                    <td className="px-5 py-3.5 font-mono text-xs font-black text-neutral-800 dark:text-neutral-200">
                      {row.f1.toFixed(4)}
                    </td>

                    {/* Precision */}
                    <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {row.precision.toFixed(2)}%
                    </td>

                    {/* Recall */}
                    <td className="px-5 py-3.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {row.recall.toFixed(2)}%
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!cmpLoading && filteredCmp.length > 0 && (
          <div className="border-t border-neutral-100 px-6 py-3 dark:border-neutral-800">
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
              Showing {filteredCmp.length} of {comparison.length} model evaluations · sorted by accuracy
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Experiment Detail Drawer ─────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.aside
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.28, ease: 'easeInOut' }}
            >
              {/* Gradient header */}
              {(() => {
                const m = EXP_META[selected.id] ?? { short: '', label: selected.name, gradient: 'from-neutral-600 to-neutral-800', badge: '' }
                return (
                  <div className={`relative overflow-hidden bg-gradient-to-br ${m.gradient} px-6 py-7 text-white`}>
                    <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest">{m.short}</span>
                        <h2 className="mt-2 text-xl font-black leading-tight">{m.label}</h2>
                        <p className="mt-1 text-sm text-white/70">{selected.date}</p>
                      </div>
                      <button onClick={() => setSelected(null)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 transition-colors hover:bg-white/20">
                        <X size={18} />
                      </button>
                    </div>
                    {/* Key stats inline */}
                    <div className="relative mt-5 grid grid-cols-3 gap-3">
                      {[
                        { label: 'Accuracy', value: `${selected.accuracy.toFixed(1)}%` },
                        { label: 'F1 Score', value: selected.f1.toFixed(3) },
                        { label: 'Models',   value: selected.models },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-xl bg-white/10 px-3 py-2.5">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">{label}</p>
                          <p className="mt-0.5 text-lg font-black">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Body */}
              <div className="flex-1 space-y-4 p-6">

                {/* Dataset & Runtime */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'Dataset', value: selected.dataset ?? 'N/A' },
                    { label: 'Runtime', value: selected.runtime ?? 'Completed' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{label}</p>
                      <p className="mt-1.5 text-sm font-bold text-neutral-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Research Notes</p>
                    <p className="text-xs leading-6 text-neutral-600 dark:text-neutral-400">{selected.notes}</p>
                  </div>
                )}

                {/* Hyperparameters */}
                {selected.params && (
                  <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Hyperparameters</p>
                      <button onClick={() => downloadCSV([selected], `experiment-${selected.id}`)}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        <FileSpreadsheet size={12} /> Export
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(selected.params).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-white px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
                          <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{k}</span>
                          <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Models in this experiment */}
                <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                    Models in this experiment ({comparison.filter(r => r.experiment === selected.id).length})
                  </p>
                  <div className="space-y-1.5">
                    {comparison
                      .filter(r => r.experiment === selected.id)
                      .map((r, i) => {
                        const fm = FAMILY_META[r.family] ?? { label: r.family, color: 'bg-neutral-100 text-neutral-600', dot: 'bg-neutral-400' }
                        return (
                          <div key={r.model} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-white px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500">#{i + 1}</span>
                              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{r.model}</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${fm.color}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${fm.dot}`} />{fm.label}
                              </span>
                            </div>
                            <span className="font-mono text-xs font-black text-neutral-700 dark:text-neutral-300">{r.accuracy.toFixed(1)}%</span>
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}
