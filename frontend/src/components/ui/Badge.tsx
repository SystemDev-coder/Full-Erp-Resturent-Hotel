import React from 'react'

interface BadgeProps {
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral'
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

export const Badge = ({
  variant = 'primary',
  size = 'sm',
  children,
  className = '',
}: BadgeProps) => {
  const variantClass = {
    primary: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300 border border-primary-100/50 dark:border-primary-500/20',
    success: 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300 border border-accent-100/50 dark:border-accent-500/20',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-100/50 dark:border-amber-500/20',
    error: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300 border border-red-100/50 dark:border-red-500/20',
    neutral: 'bg-neutral-50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200/50 dark:border-neutral-700/50',
  }

  const sizeClass = {
    sm: 'px-2.5 py-0.5 text-xs font-semibold rounded-full',
    md: 'px-3 py-1 text-sm font-semibold rounded-full',
  }

  return (
    <span className={`inline-block ${variantClass[variant]} ${sizeClass[size]} ${className}`}>
      {children}
    </span>
  )
}
