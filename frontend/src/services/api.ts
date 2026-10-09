import axios, { AxiosError } from 'axios'
import { getToken, setToken, removeToken, parseJwt } from '@utils/token'

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
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/register', '/auth/2fa/verify']

// Access tokens are short-lived (15 min). Instead of kicking the user to /login
// the moment one expires — which wiped a cashier's open order mid-shift — the
// interceptor silently trades the httpOnly refresh cookie for a new token and
// replays the failed request. Concurrent 401s share ONE refresh call.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
let refreshing: Promise<string | null> | null = null

const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshing) {
    const stale = getToken()
    // Keep the branch the user switched to (the server would otherwise fall back to the primary one)
    const branch_id = stale ? parseJwt(stale)?.branchId : undefined
    refreshing = axios
      .post(`${API_BASE}/auth/refresh`, { branch_id }, { withCredentials: true })
      .then(r => {
        const token = r.data?.access_token as string | undefined
        if (token) setToken(token)
        return token ?? null
      })
      .catch(() => null)
      .finally(() => { refreshing = null })
  }
  return refreshing
}

const forceLogout = () => {
  try { localStorage.removeItem('system_lock_user') } catch { /* ignore */ }
  removeToken()
  if (window.location.pathname !== '/login') window.location.href = '/login'
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config
    const url = config?.url ?? ''
    const isAuthEndpoint = AUTH_ENDPOINTS.some(p => url.includes(p))

    if (error.response?.status === 401 && !isAuthEndpoint && config && !config._retried) {
      const token = await refreshAccessToken()
      if (token) {
        config._retried = true
        config.headers.Authorization = `Bearer ${token}`
        return api(config)
      }
      forceLogout()
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
