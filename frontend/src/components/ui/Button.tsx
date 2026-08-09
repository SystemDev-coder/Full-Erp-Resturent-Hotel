import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, icon, children, ...props }, ref) => {
    const baseClass = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-300 transform active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100'

    const variantClass = {
      primary: 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-700 hover:to-primary-600 shadow-[0_4px_12px_rgba(79,70,229,0.25)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.35)]',
      secondary: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200/50 dark:border-neutral-700/50',
      outline: 'border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600',
      ghost: 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-850 hover:text-neutral-900 dark:hover:text-neutral-100',
      danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-[0_4px_12px_rgba(239,68,68,0.2)] hover:shadow-[0_6px_20px_rgba(239,68,68,0.3)]',
    }

    const sizeClass = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    }

    return (
      <button
        ref={ref}
        className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? (
          <>
            <div className="inline-block w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {children}
          </>
        ) : (
          <>
            {icon && <span className="mr-2">{icon}</span>}
            {children}
          </>
        )}
      </button>
    )
  }
)
Button.displayName = 'Button'
