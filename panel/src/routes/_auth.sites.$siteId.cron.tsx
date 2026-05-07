import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ListResponse, ScheduledTask } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/cron')({
  component: SiteCronTab,
})

function SiteCronTab() {
  const { siteId } = Route.useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'scheduled-tasks'],
    queryFn: () => api<ListResponse<ScheduledTask>>(`/sites/${siteId}/scheduled-tasks`),
  })

  const tasks = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{tasks.length} scheduled task{tasks.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => toast.info('Cron task create coming soon')}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Add task
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
      ) : tasks.length === 0 ? (
        <EmptyState message="No scheduled tasks configured." action="Add cron task →" onAction={() => toast.info('Cron task create coming soon')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Schedule</th>
                <th className="px-4 py-3 text-left">Command</th>
                <th className="px-4 py-3 text-left">Last run</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-tundra-ink">{t.name}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-tundra-ink-100 px-1.5 py-0.5 font-mono text-xs text-tundra-ink-600">{t.schedule}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[16rem] truncate font-mono text-xs text-tundra-ink-500" title={t.command}>{t.command}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-400">
                    {t.last_run_at ? fmtDateTime(t.last_run_at) : <span className="italic text-tundra-ink-300">Never</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      t.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                      {t.is_active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => toast.info('Run now coming soon')}
                        className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                        Run now
                      </button>
                      <button type="button" onClick={() => toast.info('Task toggle coming soon')}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                          t.is_active ? 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50' : 'border-tundra-lichen-300 text-tundra-lichen-700 hover:bg-tundra-lichen-50'
                        }`}>
                        {t.is_active ? 'Pause' : 'Resume'}
                      </button>
                      <button type="button" onClick={() => toast.info('Task delete coming soon')}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
