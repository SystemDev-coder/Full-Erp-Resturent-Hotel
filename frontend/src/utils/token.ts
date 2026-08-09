import type { User } from '@/types/auth'

const AUTH_TOKEN_KEY = 'somali_nlp_token'

export const getToken = () => localStorage.getItem(AUTH_TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token)
export const removeToken = () => localStorage.removeItem(AUTH_TOKEN_KEY)

export const parseJwt = (token: string): Record<string, any> | null => {
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) {
      return null
    }

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      Array.from(atob(base64), (c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join('')
    )

    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export const getUserFromToken = (token: string): User | null => {
  const payload = parseJwt(token)
  if (!payload) {
    return null
  }

  return {
    id: payload.sub ?? payload.user?.id,
    email: payload.email ?? payload.user?.email,
    name: payload.name ?? payload.user?.name,
  }
}
