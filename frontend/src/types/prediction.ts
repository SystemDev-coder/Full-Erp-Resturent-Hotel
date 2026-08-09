export interface PredictPayload {
  text: string
  model?: string
}

export interface PredictProbabilities {
  AI: number
  HUMAN: number
  [key: string]: number
}

export interface PredictResponse {
  label: 'AI' | 'HUMAN' | string
  score: number
  probabilities?: PredictProbabilities
  model?: string
  text?: string
  historySaved?: boolean
  category?: string
  category_icon?: string
}

export interface PredictionHistoryItem {
  id: string
  label: 'AI' | 'HUMAN' | string
  score: number
  probabilities: PredictProbabilities
  model: string
  text: string
  createdAt: string
}
