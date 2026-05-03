import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ScheduledTask, ListResponse } from '@/lib/api-types'

interface ScheduledTasksSearch {
  siteId?: string
}

export const Route = createFileRoute('/_auth/scheduled-tasks')({
  validateSearch: (search: Record<string, unknown>): ScheduledTasksSearch => ({
    siteId: typeof search.siteId === 'string' ? search.siteId : undefined,
  }),
  component: ScheduledTasksPage,
})

function activeBadge(active: boolean) {
  return active ? (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
      active
    </span>
  ) : (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
      inactive
    </span>
  )
}

function ScheduledTasksPage() {
  const { siteId } = Route.useSearch()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scheduled-tasks', siteId],
    queryFn: () =>
      siteId
        ? api<ListResponse<ScheduledTask>>(`/sites/${siteId}/scheduled-tasks`)
        : Promise.resolve({ data: [] as ScheduledTask[], next_cursor: null }),
    enabled: !!siteId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/scheduled-tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks', siteId] })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scheduled Tasks</h1>
      </div>

      {!siteId && (
        <p className="text-tundra-ink-400">
          Select a site to view its scheduled tasks. Append{' '}
          <code className="rounded bg-tundra-ink-100 px-1">?siteId=&lt;id&gt;</code> to the URL.
        </p>
      )}

      {siteId && isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {siteId && isError && <p className="text-tundra-rust">Failed to load scheduled tasks.</p>}

      {siteId && data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Schedule</th>
                <th className="px-4 py-3 text-left font-medium">Command</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Last Run</th>
                <th className="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((t) => (
                <tr key={t.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-600">{t.schedule}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-600 max-w-xs truncate">
                    {t.command}
                  </td>
                  <td className="px-4 py-3">{activeBadge(t.is_active)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {t.last_run_at ? new Date(t.last_run_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (confirm(`Delete scheduled task "${t.name}"?`)) {
                          deleteMutation.mutate(t.id)
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="text-tundra-rust hover:underline text-xs disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-tundra-ink-400">
                    No scheduled tasks yet for this site.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
