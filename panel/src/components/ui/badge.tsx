import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted'

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-600',
  success: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
  warning: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  error:   'border-red-300 bg-red-50 text-red-800',
  info:    'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
  muted:   'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400',
}

const dotClasses: Record<BadgeVariant, string> = {
  default: 'bg-tundra-ink-400',
  success: 'bg-tundra-lichen',
  warning: 'bg-yellow-400',
  error:   'bg-red-500',
  info:    'bg-tundra-aurora',
  muted:   'bg-tundra-ink-300',
}

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  dot?: boolean
  pulse?: boolean
  className?: string
}

export function Badge({ children, variant = 'default', dot, pulse, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', dotClasses[variant], pulse && 'animate-pulse')}
        />
      )}
      {children}
    </span>
  )
}
