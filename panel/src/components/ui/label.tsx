import { cn } from '@/lib/utils'
import type { LabelHTMLAttributes } from 'react'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium text-tundra-ink leading-none', className)}
      {...props}
    />
  )
}
