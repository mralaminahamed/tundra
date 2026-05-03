import { type InputHTMLAttributes, forwardRef } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`flex h-10 w-full rounded border border-tundra-ink-200 bg-transparent px-3 py-2 text-sm placeholder:text-tundra-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-aurora disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
