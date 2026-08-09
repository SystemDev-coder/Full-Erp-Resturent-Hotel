import api from './api'
import type { UserRole } from '@/types/auth'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string
  last_login: string | null
  daily_prediction_count: number
  monthly_prediction_count: number
  daily_prediction_limit: number
  monthly_prediction_limit: number
  max_text_length: number
}

export interface UsersResponse {
  total: number
  page: number
  limit: number
  pages: number
  users: AdminUser[]
}

export interface ActivityLog {
  id: string
  user_id: string
  user_email: string
  user_name: string
  action: string
  category: string
  details: Record<string, unknown>
  ip_address: string
  status: string
  created_at: string
}

export interface LogsResponse {
  total: number
  page: number
  limit: number
  pages: number
  logs: ActivityLog[]
}

export interface CreateUserPayload {
  email: string
  name: string
  password: string
  role: UserRole
  daily_prediction_limit?: number
  monthly_prediction_limit?: number
  max_text_length?: number
}

export interface UpdateUserPayload {
  name?: string
  role?: UserRole
  is_active?: boolean
  daily_prediction_limit?: number
  monthly_prediction_limit?: number
  max_text_length?: number
}

export const listUsers = (params: {
  page?: number
  limit?: number
  search?: string
  role?: string
  status?: string
}) => {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.search) qs.set('search', params.search)
  if (params.role) qs.set('role', params.role)
  if (params.status) qs.set('status', params.status)
  return api.get<UsersResponse>(`/admin/users?${qs.toString()}`)
}

export const getUser = (id: string) =>
  api.get<AdminUser>(`/admin/users/${id}`)

export const createUser = (payload: CreateUserPayload) =>
  api.post<AdminUser>('/admin/users', payload)

export const updateUser = (id: string, payload: UpdateUserPayload) =>
  api.patch<AdminUser>(`/admin/users/${id}`, payload)

export const deleteUser = (id: string) =>
  api.delete(`/admin/users/${id}`)

export const suspendUser = (id: string) =>
  api.post<AdminUser>(`/admin/users/${id}/suspend`)

export const activateUser = (id: string) =>
  api.post<AdminUser>(`/admin/users/${id}/activate`)

export const resetPassword = (id: string, new_password: string) =>
  api.post(`/admin/users/${id}/reset-password`, { new_password })

export const listLogs = (params: {
  page?: number
  limit?: number
  category?: string
  user_email?: string
  action?: string
}) => {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.category) qs.set('category', params.category)
  if (params.user_email) qs.set('user_email', params.user_email)
  if (params.action) qs.set('action', params.action)
  return api.get<LogsResponse>(`/admin/logs?${qs.toString()}`)
}
