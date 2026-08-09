import api from './api'

export interface TrainingStatus {
  stage: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  started_at?: string | null
  finished_at?: string | null
  message?: string
  trained_models?: number
  log_tail?: string
}

export async function startTraditionalTraining(allTraditional = true) {
  const response = await api.post<TrainingStatus>('/train/traditional', {
    all_traditional: allTraditional,
  })
  return response.data
}

export async function getTrainingStatus() {
  const response = await api.get<TrainingStatus>('/train/status')
  return response.data
}

export async function reloadModels() {
  const response = await api.post<{ models_loaded: number; models: string[] }>('/models/reload')
  return response.data
}
