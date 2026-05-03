import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Deployment, ListResponse, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/sites/$siteId')({
  component: SiteDetailPage,
})

function SiteDetailPage() {
  const { siteId } = Route.useParams()

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const { data: deploys } = useQuery({
    queryKey: ['sites', siteId, 'deployments'],
    queryFn: () => api<ListResponse<Deployment>>(`/sites/${siteId}/deployments`),
    enabled: !!site,
  })

  if (siteLoading) return <p className="text-tundra-ink-400">Loading…</p>
  if (!site) return <p className="text-tundra-rust">Site not found.</p>

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-0.5 text-2xl font-semibold">{site.primary_domain}</h1>
          <p className="text-sm text-tundra-ink-500">{site.name}</p>
        </div>
        <span className="rounded bg-tundra-lichen-100 px-3 py-1 text-sm text-tundra-lichen-800 capitalize">
          {site.status}
        </span>
      </div>

      {/* Deployments */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Deployments</h2>
        {deploys && deploys.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">Trigger</th>
                  <th className="px-4 py-3 text-left font-medium">Ref</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {deploys.data.map((d) => (
                  <tr key={d.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-3 font-mono text-xs">{d.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 capitalize text-tundra-ink-500">{d.triggered_by}</td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">
                      {d.source_ref?.slice(0, 8) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        d.status === 'succeeded' ? 'bg-tundra-lichen-100 text-tundra-lichen-800'
                        : d.status === 'failed' ? 'bg-tundra-rust-100 text-tundra-rust-800'
                        : 'bg-tundra-aurora-100 text-tundra-aurora-800'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-400">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-tundra-ink-400">No deployments yet.</p>
        )}
      </section>
    </div>
  )
}
