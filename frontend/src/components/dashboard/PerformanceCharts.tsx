import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ChartModel {
  name: string
  shortName: string
  accuracy: number
  f1: number
  precision: number
  recall: number
  experiment: string
  color: string
}

interface PerformanceChartsProps {
  models: ChartModel[]
  bestModel: ChartModel | undefined
}

const CHART_COLORS = ['#6366f1', '#818cf8', '#14b8a6', '#2dd4bf', '#8b5cf6', '#a78bfa', '#f59e0b', '#10b981']

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
      <p className="mb-2 text-xs font-bold text-neutral-500 dark:text-neutral-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
          {entry.name === 'Accuracy' ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

export const PerformanceCharts = ({ models, bestModel }: PerformanceChartsProps) => {
  const barData = models.slice(0, 8).map((m) => ({
    name: m.shortName,
    Accuracy: m.accuracy,
    F1: m.f1 * 100,
  }))

  const radarData = bestModel
    ? [
        { metric: 'Accuracy', value: bestModel.accuracy, fullMark: 100 },
        { metric: 'F1 Score', value: bestModel.f1 * 100, fullMark: 100 },
        { metric: 'Precision', value: bestModel.precision * 100, fullMark: 100 },
        { metric: 'Recall', value: bestModel.recall * 100, fullMark: 100 },
      ]
    : []

  const experimentGroups = models.reduce<Record<string, number>>((acc, model) => {
    acc[model.experiment] = (acc[model.experiment] ?? 0) + 1
    return acc
  }, {})

  const expComparison = Object.entries(experimentGroups).map(([name, count]) => {
    const expModels = models.filter((m) => m.experiment === name)
    const avgAcc = expModels.reduce((s, m) => s + m.accuracy, 0) / (expModels.length || 1)
    const avgF1 = expModels.reduce((s, m) => s + m.f1, 0) / (expModels.length || 1)
    return {
      experiment: name.replace('experiment_', 'Exp ').replace(/_/g, ' '),
      models: count,
      avgAccuracy: Number(avgAcc.toFixed(2)),
      avgF1: Number((avgF1 * 100).toFixed(2)),
    }
  })

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-neutral-800/80 dark:bg-neutral-900">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary-500">Benchmark</p>
            <h3 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">Model Accuracy Ranking</h3>
          </div>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-[11px] font-bold text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
            Top {barData.length}
          </span>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148,163,184,0.2)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Accuracy" radius={[0, 6, 6, 0]} barSize={14}>
                {barData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-neutral-800/80 dark:bg-neutral-900">
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-400">
            Multi-metric
          </p>
          <h3 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
            Best Model Profile
            {bestModel && (
              <span className="ml-2 text-sm font-medium text-neutral-500">— {bestModel.shortName}</span>
            )}
          </h3>
        </div>
        <div className="h-[280px]">
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="rgba(148,163,184,0.25)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">No model data</div>
          )}
        </div>
      </div>

      {expComparison.length > 0 && (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 lg:col-span-2 dark:border-neutral-800/80 dark:bg-neutral-900">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-500">A/B Experiments</p>
            <h3 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">Stopword Ablation Comparison</h3>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expComparison} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="experiment" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                <Bar dataKey="avgAccuracy" name="Avg Accuracy" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={36} />
                <Bar dataKey="avgF1" name="Avg F1 (×100)" fill="#14b8a6" radius={[6, 6, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
