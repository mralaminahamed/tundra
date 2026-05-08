import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import type { ScheduledTask, ListResponse, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/scheduled-tasks')({
  component: ScheduledTasksPage,
})

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return `${String(Math.floor(diff))}s ago`
  if (diff < 3600)  return `${String(Math.floor(diff / 60))}m ago`
  if (diff < 86400) return `${String(Math.floor(diff / 3600))}h ago`
  return `${String(Math.floor(diff / 86400))}d ago`
}

function ScheduledTasksPage() {
  const queryClient = useQueryClient()
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [search, setSearch] = useState('')

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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks', selectedSite] }); toast.success('Task deleted') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const allTasks = data?.data ?? []
  const selectedSiteObj = sites.find((s) => s.id === selectedSite)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return allTasks
    return allTasks.filter((t) => t.name.toLowerCase().includes(q) || t.command.toLowerCase().includes(q) || t.schedule.includes(q))
  }, [allTasks, search])

  const pg = usePagination(filtered, 25)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Scheduled Tasks</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">Cron-based recurring jobs per site.</p>
        </div>
        {selectedSite && (
          <Link to="/sites/$siteId" params={{ siteId: selectedSite }}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            + Add task
          </Link>
        )}
      </div>

      {/* Site selector */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
        <p className="mb-2 text-xs font-medium text-tundra-ink-500">Select site</p>
        <div className="flex flex-wrap gap-2">
          {sites.map((s) => (
            <button key={s.id} type="button" onClick={() => { setSelectedSite(s.id); setSearch(''); pg.setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedSite === s.id ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}>
              {s.primary_domain}
            </button>
          ))}
          {sites.length === 0 && <p className="text-sm text-tundra-ink-400">No sites found.</p>}
        </div>
      </div>

      {!selectedSite && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-tundra-ink-200 bg-white text-sm text-tundra-ink-400">
          Select a site above to view its scheduled tasks.
        </div>
      )}

      {selectedSite && (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Search name, command…" value={search}
                onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
                className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
            </div>
            <div className="ml-auto">
              {selectedSiteObj && (
                <span className="text-xs text-tundra-ink-400">
                  <span className="font-medium text-tundra-ink">{selectedSiteObj.primary_domain}</span> — {allTasks.length} task{allTasks.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-tundra-ink-100">
              {[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse bg-tundra-ink-50 px-4 py-3" />)}
            </div>
          ) : isError ? (
            <p className="px-4 py-6 text-sm text-tundra-rust">Failed to load scheduled tasks.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Schedule</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Command</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Last run</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {pg.paged.map((t) => (
                  <tr key={t.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-tundra-ink">{t.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-tundra-ink-100 px-1.5 py-0.5 font-mono text-xs text-tundra-ink-600">{t.schedule}</span>
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 font-mono text-xs text-tundra-ink-600">{t.command}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800' : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${t.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                        {t.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-400">{relativeTime(t.last_run_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" disabled={deleteMutation.isPending}
                        onClick={() => { if (confirm(`Delete task "${t.name}"?`)) deleteMutation.mutate(t.id) }}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                    {search ? 'No results match your search.' : 'No scheduled tasks for this site.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}

          <Pagination total={filtered.length} page={pg.page} pageSize={pg.pageSize}
            onPage={pg.setPage} onPageSize={(n) => { pg.setPageSize(n); pg.setPage(1) }} />
        </div>
      )}
    </div>
  )
}
