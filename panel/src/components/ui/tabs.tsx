import { cn } from '@/lib/utils'
import { createContext, useContext, type ReactNode } from 'react'

interface TabsContextValue {
  active: string
  setActive: (value: string) => void
}

const TabsContext = createContext<TabsContextValue>({ active: '', setActive: () => {} })

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <TabsContext.Provider value={{ active: value, setActive: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-0.5 border-b border-tundra-ink-200', className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const { active, setActive } = useContext(TabsContext)
  const isActive = active === value
  return (
    <button
      type="button"
      onClick={() => { setActive(value) }}
      className={cn(
        '-mb-px px-4 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'border-b-2 border-tundra-lichen text-tundra-lichen'
          : 'text-tundra-ink-400 hover:text-tundra-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const { active } = useContext(TabsContext)
  if (active !== value) return null
  return <div className={className}>{children}</div>
}
