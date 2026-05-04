import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ScheduledTask, ListResponse, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/scheduled-tasks')({
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

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${String(Math.floor(diff))}s ago`
  if (diff < 3600) return `${String(Math.floor(diff / 60))}m ago`
  if (diff < 86400) return `${String(Math.floor(diff / 3600))}h ago`
  return `${String(Math.floor(diff / 86400))}d ago`
}

function ScheduledTasksPage() {
  const queryClient = useQueryClient()
  const [selectedSite, setSelectedSite] = useState<string>('')

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  const sites = sitesData?.data ?? []

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scheduled-tasks', selectedSite],
    queryFn: () =>
      selectedSite
        ? api<ListResponse<ScheduledTask>>(`/sites/${selectedSite}/scheduled-tasks`)
        : Promise.resolve({ data: [] as ScheduledTask[], next_cursor: null }),
    enabled: !!selectedSite,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/scheduled-tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks', selectedSite] })
      toast.success('Task deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const tasks = data?.data ?? []
  const selectedSiteObj = sites.find((s) => s.id === selectedSite)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scheduled Tasks</h1>
          <p className="mt-1 text-sm text-tundra-ink-500">
            Cron-based recurring jobs per site.
          </p>
        </div>
        {selectedSite && (
          <Link
            to="/sites/$siteId"
            params={{ siteId: selectedSite }}
            className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
          >
            + Add task
          </Link>
        )}
      </div>

      {/* Site selector */}
      <div className="mb-6">
        <label className="text-sm font-medium text-tundra-ink-600">Select site</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedSite(s.id) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedSite === s.id ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
            >
              {s.primary_domain}
            </button>
          ))}
          {sites.length === 0 && (
            <p className="text-sm text-tundra-ink-400">No sites found.</p>
          )}
        </div>
      </div>

      {!selectedSite && (
        <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
          <p className="text-sm text-tundra-ink-400">Select a site above to view its scheduled tasks.</p>
        </div>
      )}

      {selectedSite && isLoading && <p className="text-sm text-tundra-ink-400">Loading…</p>}
      {selectedSite && isError && <p className="text-sm text-tundra-rust">Failed to load scheduled tasks.</p>}

      {selectedSite && !isLoading && (
        <>
          {selectedSiteObj && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-medium text-tundra-ink">{selectedSiteObj.primary_domain}</span>
              <span className="text-sm text-tundra-ink-400">— {tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No scheduled tasks for this site.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Schedule</th>
                    <th className="px-4 py-3 text-left font-medium">Command</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Last run</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-tundra-ink-50">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-600 bg-tundra-ink-50 whitespace-nowrap">
                        {t.schedule}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-600 max-w-[16rem] truncate">
                        {t.command}
                      </td>
                      <td className="px-4 py-3">{activeBadge(t.is_active)}</td>
                      <td className="px-4 py-3 text-tundra-ink-400">
                        {relativeTime(t.last_run_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            if (confirm(`Delete task "${t.name}"?`)) {
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
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
