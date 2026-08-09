import React from 'react'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export const Skeleton = ({ className = '', style }: SkeletonProps) => (
  <div
    className={`animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-700 ${className}`}
    style={style}
  />
)
