import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  hover?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', hover = false, children, ...props }, ref) => (
    <div
      ref={ref}
      className={`
        bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/60 dark:border-neutral-800/80
        shadow-[0_8px_30px_rgba(0,0,0,0.02)] transition-all duration-300
        ${hover ? 'hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 hover:border-primary-500/30 dark:hover:border-primary-500/20 cursor-pointer' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'

interface CardHeaderProps {
  children: React.ReactNode
  className?: string
}

export const CardHeader = ({ children, className = '' }: CardHeaderProps) => (
  <div className={`px-6 py-5 border-b border-neutral-100 dark:border-neutral-800/60 ${className}`}>
    {children}
  </div>
)

interface CardContentProps {
  children: React.ReactNode
  className?: string
}

export const CardContent = ({ children, className = '' }: CardContentProps) => (
  <div className={`px-6 py-6 ${className}`}>
    {children}
  </div>
)

interface CardFooterProps {
  children: React.ReactNode
  className?: string
}

export const CardFooter = ({ children, className = '' }: CardFooterProps) => (
  <div className={`px-6 py-5 border-t border-neutral-100 dark:border-neutral-800/60 ${className}`}>
    {children}
  </div>
)
