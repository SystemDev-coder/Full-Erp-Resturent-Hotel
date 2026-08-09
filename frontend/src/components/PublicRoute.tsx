import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'

export const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-primary-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
