import api from './api'
import type { Experiment, ExperimentStatus } from '../types/experiment'

interface ApiExperimentRecord {
  file?: string
  data?: Record<string, unknown>
}

const statuses: ExperimentStatus[] = ['completed', 'running', 'queued', 'failed']

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asStatus = (value: unknown): ExperimentStatus => {
  const normalized = String(value ?? 'completed').toLowerCase()
  return statuses.includes(normalized as ExperimentStatus) ? (normalized as ExperimentStatus) : 'completed'
}

const asString = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback)
const getMetric = (data: Record<string, unknown>, key: string) => {
  const metrics = data.metrics
  if (metrics && typeof metrics === 'object' && !Array.isArray(metrics)) {
    return (metrics as Record<string, unknown>)[key]
  }
  return undefined
}

const normalizeExperiment = (record: ApiExperimentRecord, index: number): Experiment => {
  const data = record.data ?? {}
  const fileName = record.file ?? `experiment-${index + 1}`
  const params = data.params && typeof data.params === 'object' && !Array.isArray(data.params)
    ? (data.params as Experiment['params'])
    : undefined

  return {
    id: asString(data.id, fileName),
    name: asString(data.name ?? data.experiment_name ?? data.title, fileName.replace(/\.(json|csv)$/i, '')),
    date: asString(data.date ?? data.created_at ?? data.timestamp, new Date().toISOString().slice(0, 10)),
    status: asStatus(data.status),
    accuracy: asNumber(data.accuracy ?? data.best_accuracy ?? getMetric(data, 'accuracy')),
    f1: asNumber(data.f1 ?? data.f1_score ?? getMetric(data, 'f1')),
    models: asNumber(data.models ?? data.model_count, 1),
    runtime: typeof data.runtime === 'string' ? data.runtime : undefined,
    dataset: typeof data.dataset === 'string' ? data.dataset : undefined,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    params,
  }
}

export const listExperiments = async () => {
  const response = await api.get<ApiExperimentRecord[]>('/experiments')
  return {
    ...response,
    data: response.data.map(normalizeExperiment),
  }
}

export const getExperimentById = (id: string) => api.get<Experiment>(`/experiments/${id}`)
