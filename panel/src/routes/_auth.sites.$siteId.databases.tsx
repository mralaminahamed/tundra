import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Database, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/lib/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/databases')({
  component: SiteDatabasesTab,
})


function SiteDatabasesTab() {
  const { siteId } = Route.useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'databases'],
    queryFn: () => api<ListResponse<Database>>(`/sites/${siteId}/databases`),
  })

  const dbs = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{dbs.length} database{dbs.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => toast.info('Database create coming soon')}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Create database
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
      ) : dbs.length === 0 ? (
        <EmptyState message="No databases for this site." action="Create database →" onAction={() => toast.info('Database create coming soon')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {dbs.map((db) => (
            <div key={db.id} className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
              <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
                <span className="font-semibold text-tundra-ink">{db.name}</span>
                <span className="rounded-full border border-tundra-ink-200 bg-tundra-ink-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tundra-ink-500">
                  Database
                </span>
              </div>
              <div className="divide-y divide-tundra-ink-100">
                {[
                  { label: 'Charset',   value: db.charset ?? '—', mono: true },
                  { label: 'Collation', value: db.collation ?? '—', mono: true },
                  { label: 'Size',      value: db.size_bytes != null ? `${(db.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—' },
                  { label: 'Created',   value: new Date(db.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="text-tundra-ink-400">{label}</span>
                    <span className={`text-tundra-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 p-3">
                <button type="button" onClick={() => toast.info('phpMyAdmin / pgAdmin coming soon')}
                  className="flex-1 rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                  Open admin
                </button>
                <button type="button" onClick={() => toast.info('Connection string copy coming soon')}
                  className="flex-1 rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                  Copy conn string
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
