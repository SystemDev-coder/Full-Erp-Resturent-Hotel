import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getToken, setToken, removeToken } from '../utils/token'
import { clearApiCache } from '../utils/pwa'
import type { AuthContextValue, LoginCredentials, RegisterPayload, User } from '@/types/auth'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate()
  const [user, setUser]                     = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading]           = useState(true)

  // Restore session on mount
  useEffect(() => {
    const token = getToken()
    if (!token) { setIsLoading(false); return }

    // Only a real 401 (token invalid / expired and not refreshable) ends the session.
    // A temporary failure — rate limit, server restarting, network blip — is retried instead
    // of silently signing the user out.
    let alive = true
    const restore = async (attempt = 0): Promise<void> => {
      try {
        const r = await api.get('/auth/me')
        if (!alive) return
        setUser(r.data.data)
        setIsAuthenticated(true)
        setIsLoading(false)
      } catch (e: any) {
        if (!alive) return
        const status = e?.response?.status
        if (status === 401 || status === 403) { removeToken(); setIsLoading(false); return }
        if (attempt < 3) { setTimeout(() => restore(attempt + 1), 1200 * (attempt + 1)); return }
        setIsLoading(false)   // give up for now, but keep the token so a reload can still recover
      }
    }
    restore()
    return () => { alive = false }
  }, [])

  const finishSignIn = (data: { access_token: string; user: User }) => {
    clearApiCache()   // a different person may be signing in on this PC
    const { access_token, user: userData } = data
    setToken(access_token)
    try { localStorage.removeItem('system_lock_user') } catch { /* ignore */ }
    setUser(userData)
    setIsAuthenticated(true)
  }

  const login = async (credentials: LoginCredentials) => {
    const res = await api.post('/auth/login', credentials)
    // two-factor on → the password alone is not enough; the page asks for the code next
    if (res.data.requires_2fa) return { challenge: res.data.challenge as string }
    finishSignIn(res.data)
    return undefined
  }

  const verifyTwoFactor = async (challenge: string, code: string) => {
    const res = await api.post('/auth/2fa/verify', { challenge, code })
    finishSignIn(res.data)
  }

  const register = async (_payload: RegisterPayload) => {
    await new Promise(r => setTimeout(r, 400))
  }

  const logout = () => {
    // Revoke the refresh token server-side too, otherwise "sign out" leaves a valid 7-day session behind
    api.post('/auth/logout').catch(() => {})
    try { localStorage.removeItem('system_lock_user') } catch { /* ignore */ }
    removeToken()
    setUser(null)
    setIsAuthenticated(false)
    navigate('/login', { replace: true })
  }

  // Swap the JWT for one scoped to the new branch, then hard-reload so every
  // mounted page refetches its data under the new branch context.
  const switchBranch = async (branchId: string) => {
    const res = await api.post('/auth/switch-branch', { branch_id: branchId })
    setToken(res.data.access_token)
    setUser(prev => prev ? { ...prev, current_branch: res.data.current_branch } : prev)
    window.location.reload()
  }

  // Re-fetch the profile — keeps the navbar avatar/name fresh after the user
  // edits their own account (photo upload, rename).
  const refreshUser = async () => {
    try {
      const r = await api.get('/auth/me')
      setUser(r.data.data)
    } catch { /* session unchanged */ }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, verifyTwoFactor, register, logout, switchBranch, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuthContext must be used within AuthProvider')
  return context
}
