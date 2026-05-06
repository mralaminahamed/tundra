import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Daemon, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/daemons')({
  component: SiteDaemonsTab,
})

function SiteDaemonsTab() {
  const { siteId } = Route.useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'daemons'],
    queryFn: () => api<ListResponse<Daemon>>(`/sites/${siteId}/daemons`),
  })

  const daemons = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{daemons.length} daemon{daemons.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => toast.info('Daemon create coming soon')}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Add daemon
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
      ) : daemons.length === 0 ? (
        <EmptyState message="No daemons configured for this site." action="Add daemon →" onAction={() => toast.info('Daemon create coming soon')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Command</th>
                <th className="px-4 py-3 text-left">Working dir</th>
                <th className="px-4 py-3 text-left">Restarts</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {daemons.map((d) => (
                <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-tundra-ink">{d.name}</td>
                  <td className="px-4 py-3">
                    <span className="block max-w-[18rem] truncate font-mono text-xs text-tundra-ink-500" title={d.command}>{d.command}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">{d.working_dir}</td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-500">∞</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      d.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${d.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                      {d.is_active ? 'Running' : 'Stopped'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => toast.info('Daemon toggle coming soon')}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                          d.is_active ? 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50' : 'border-tundra-lichen-300 text-tundra-lichen-700 hover:bg-tundra-lichen-50'
                        }`}>
                        {d.is_active ? 'Stop' : 'Start'}
                      </button>
                      <button type="button" onClick={() => toast.info('Daemon delete coming soon')}
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
