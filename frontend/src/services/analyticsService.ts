import api from './api'

export interface OverviewData {
  total_predictions: number
  ai_predictions: number
  human_predictions: number
  ai_detection_rate: number
  human_detection_rate: number
  total_users: number
  active_users: number
  today_predictions: number
  month_predictions: number
  avg_confidence: number
  top_models: { model: string; count: number }[]
}

export interface DailyPrediction {
  date: string
  total: number
  ai: number
  human: number
}

export interface UserSignup {
  date: string
  signups: number
}

export interface TrendsData {
  daily_predictions: DailyPrediction[]
  user_signups: UserSignup[]
  days: number
}

export const getAnalyticsOverview = () =>
  api.get<OverviewData>('/analytics/overview')

export const getAnalyticsTrends = (days = 30) =>
  api.get<TrendsData>(`/analytics/trends?days=${days}`)
