import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/audit-log')({
  component: AuditLogPage,
})

interface AuditEntry {
  id: string
  operator_id: string | null
  operator_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  ip: string | null
  request_id: string | null
  created_at: string
  meta: Record<string, unknown> | null
}

function resourceBadge(type: string) {
  const colors: Record<string, string> = {
    server: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    site: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    operator: 'bg-yellow-100 text-yellow-800',
    domain: 'bg-tundra-ink-100 text-tundra-ink-700',
    database: 'bg-purple-100 text-purple-800',
    backup: 'bg-orange-100 text-orange-800',
    plugin: 'bg-pink-100 text-pink-800',
    alert_rule: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colors[type] ?? 'bg-tundra-ink-100 text-tundra-ink-600'}`}>
      {type}
    </span>
  )
}

function actionVerb(action: string): string {
  const parts = action.split('.')
  return parts[parts.length - 1] ?? action
}

function AuditLogPage() {
  const [page, setPage] = useState(0)
  const [filterResource, setFilterResource] = useState('')
  const limit = 30

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-log', page, filterResource],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) })
      if (filterResource) params.set('resource_type', filterResource)
      return api<{ data: AuditEntry[]; total?: number }>(`/audit-log?${params.toString()}`)
    },
  })

  const entries = data?.data ?? []

  const RESOURCE_TYPES = ['server', 'site', 'operator', 'domain', 'database', 'backup', 'plugin', 'alert_rule']

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="mt-1 text-sm text-tundra-ink-500">
            All state-changing operations, who performed them, and when.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => { setFilterResource(''); setPage(0) }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterResource === '' ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
        >
          All
        </button>
        {RESOURCE_TYPES.map((rt) => (
          <button
            key={rt}
            onClick={() => { setFilterResource(rt); setPage(0) }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterResource === rt ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
          >
            {rt}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-sm text-tundra-rust">Failed to load audit log.</p>}

      {entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Operator</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Resource</th>
                <th className="px-4 py-3 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3 text-tundra-ink-400 whitespace-nowrap">
                    <span title={new Date(e.created_at).toISOString()}>
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-600">
                    {e.operator_email ?? <span className="text-tundra-ink-400">system</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-tundra-ink">{actionVerb(e.action)}</span>
                      <span className="text-xs text-tundra-ink-400 font-mono">{e.action}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {resourceBadge(e.resource_type)}
                      {e.resource_id && (
                        <span className="text-xs text-tundra-ink-400 font-mono truncate max-w-[10rem]">
                          {e.resource_id}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400 font-mono text-xs">
                    {e.ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
          <p className="text-sm text-tundra-ink-400">No audit log entries yet.</p>
        </div>
      )}

      {/* Pagination */}
      {(entries.length === limit || page > 0) && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => { setPage((p) => Math.max(0, p - 1)) }}
            disabled={page === 0}
            className="rounded border border-tundra-ink-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-tundra-ink-50"
          >
            ← Previous
          </button>
          <span className="text-sm text-tundra-ink-500">Page {page + 1}</span>
          <button
            onClick={() => { setPage((p) => p + 1) }}
            disabled={entries.length < limit}
            className="rounded border border-tundra-ink-200 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-tundra-ink-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
