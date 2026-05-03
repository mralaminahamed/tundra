import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', loading, children, disabled, className = '', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50'
    const variants = {
      default: 'bg-tundra-lichen text-white hover:bg-tundra-lichen-600',
      outline: 'border border-tundra-ink-200 bg-transparent hover:bg-tundra-ink-50',
      ghost: 'hover:bg-tundra-ink-50',
      destructive: 'bg-tundra-rust text-white hover:bg-tundra-rust-700',
    }
    const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6 text-lg' }

    return (
      <button
        ref={ref}
        disabled={disabled ?? loading}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
