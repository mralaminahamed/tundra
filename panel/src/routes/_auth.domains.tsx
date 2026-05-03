import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ListResponse, Domain } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/domains')({
  component: DomainsPage,
})

function dnsBadge(dns: Domain['dns_managed_by']) {
  const map: Record<string, string> = {
    tundra: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    external: 'bg-tundra-ink-100 text-tundra-ink-600',
    registrar: 'bg-tundra-aurora-100 text-tundra-aurora-800',
  }
  const labels: Record<string, string> = {
    tundra: 'Tundra DNS',
    external: 'External',
    registrar: 'Registrar',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[dns] ?? ''}`}
    >
      {labels[dns] ?? dns}
    </span>
  )
}

function DomainsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api<ListResponse<Domain>>('/domains'),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Domains</h1>
        <Link
          to="/domains/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          + Add domain
        </Link>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load domains.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Apex</th>
                <th className="px-4 py-3 text-left font-medium">DNS</th>
                <th className="px-4 py-3 text-left font-medium">Auto-renew</th>
                <th className="px-4 py-3 text-left font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((d) => (
                <tr key={d.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/domains/$domainId"
                      params={{ domainId: d.id }}
                      className="font-medium text-tundra-aurora hover:underline"
                    >
                      {d.apex}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{dnsBadge(d.dns_managed_by)}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">
                    {d.auto_renew ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {d.registration_expires_at
                      ? new Date(d.registration_expires_at).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-tundra-ink-400">
                    No domains yet. Add your first domain to get started.
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
