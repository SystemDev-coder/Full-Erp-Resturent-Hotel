import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getToken, setToken, removeToken } from '../utils/token'
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

    api.get('/auth/me')
      .then(r => {
        setUser(r.data.data)
        setIsAuthenticated(true)
      })
      .catch(() => {
        removeToken()
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (credentials: LoginCredentials) => {
    const res = await api.post('/auth/login', credentials)
    const { access_token, user: userData } = res.data
    setToken(access_token)
    setUser(userData)
    setIsAuthenticated(true)
  }

  const register = async (_payload: RegisterPayload) => {
    await new Promise(r => setTimeout(r, 400))
  }

  const logout = () => {
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
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, logout, switchBranch, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuthContext must be used within AuthProvider')
  return context
}
