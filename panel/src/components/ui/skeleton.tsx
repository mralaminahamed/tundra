import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-tundra-ink-100', className)}
      aria-hidden="true"
    />
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
      <div className="bg-tundra-ink-50 px-4 py-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-tundra-ink-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-6 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-tundra-ink-200 bg-white p-5', className)}>
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  )
}

export function SkeletonPage({ title = true }: { title?: boolean }) {
  return (
    <div>
      {title && (
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-9 w-28 rounded" />
        </div>
      )}
      <SkeletonTable />
    </div>
  )
}
