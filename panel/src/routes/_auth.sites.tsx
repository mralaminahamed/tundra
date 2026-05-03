import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ListResponse, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/sites')({
  component: SitesPage,
})

function statusBadge(status: Site['status']) {
  const map: Record<string, string> = {
    active: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    provisioning: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    suspended: 'bg-yellow-100 text-yellow-800',
    migrating: 'bg-tundra-aurora-100 text-tundra-aurora-700',
    archived: 'bg-tundra-ink-100 text-tundra-ink-400',
  }
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}>
      {status}
    </span>
  )
}

function SitesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sites</h1>
        <Link
          to="/sites/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Create site
        </Link>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load sites.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Domain</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((s) => (
                <tr key={s.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/sites/$siteId"
                      params={{ siteId: s.id }}
                      className="font-medium text-tundra-aurora hover:underline"
                    >
                      {s.primary_domain}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{s.name}</td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-tundra-ink-400">
                    No sites yet.
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
