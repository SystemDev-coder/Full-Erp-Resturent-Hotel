export type ExperimentStatus = 'completed' | 'running' | 'failed' | 'queued'

export interface ExperimentParams {
  [key: string]: string | number | boolean
}

export interface Experiment {
  id: string
  name: string
  date: string
  status: ExperimentStatus
  accuracy: number
  f1: number
  models: number
  runtime?: string
  dataset?: string
  notes?: string
  params?: ExperimentParams
}
