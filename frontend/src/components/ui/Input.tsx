import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500">{icon}</div>}
        <input
          ref={ref}
          className={`
            w-full px-4 py-2.5 bg-neutral-50/50 dark:bg-neutral-900/50 text-neutral-900 dark:text-white
            border border-neutral-200 dark:border-neutral-800/80 rounded-xl
            focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10
            transition-all duration-300
            placeholder-neutral-450 dark:placeholder-neutral-500
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
