import api from '@services/api'
import type { LoginCredentials, RegisterPayload, User } from '@/types/auth'

export const login = (payload: LoginCredentials) => api.post('/auth/login', payload)
export const register = (payload: RegisterPayload) => api.post('/auth/register', payload)
export const getCurrentUser = () => api.get<User>('/auth/me')
