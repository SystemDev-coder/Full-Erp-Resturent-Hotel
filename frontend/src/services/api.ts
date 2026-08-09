import axios, { AxiosError } from 'axios'
import { getToken, removeToken } from '@utils/token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Endpoints where a 401 is an expected "bad credentials" response, not proof
// that the current session's token has gone stale — these must never trigger
// a forced logout/redirect of the page the user is already on.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/register']

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? ''
    const isAuthEndpoint = AUTH_ENDPOINTS.some(p => url.includes(p))
    if (error.response?.status === 401 && !isAuthEndpoint) {
      removeToken()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const getApiErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.') => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: unknown; message?: string }>
    const detail = axiosError.response?.data?.detail

    if (typeof detail === 'string') {
      return detail
    }

    if (Array.isArray(detail) && detail.length > 0) {
      return 'Please check the submitted values and try again.'
    }

    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message
    }

    if (axiosError.message === 'Network Error') {
      return 'Unable to reach the API. Please make sure the backend is running.'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

export default api
