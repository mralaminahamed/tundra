import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
}

export function Switch({ checked, onChange, disabled, id, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => { onChange(!checked) }}
      className={cn(
        'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tundra-lichen focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-tundra-lichen bg-tundra-lichen' : 'border-tundra-ink-300 bg-tundra-ink-100',
        className,
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-px h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-3.5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
