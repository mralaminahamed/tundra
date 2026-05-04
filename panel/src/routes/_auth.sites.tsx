import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import type { ListResponse, Site, Server } from '@/lib/api-types'

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
  const [filterServer, setFilterServer] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const serverMap = new Map<string, Server>(
    (serversData?.data ?? []).map((s) => [s.id, s]),
  )

  const sites = data?.data ?? []

  const filtered = sites.filter((s) => {
    if (filterServer && s.server_id !== filterServer) return false
    if (filterStatus && s.status !== filterStatus) return false
    return true
  })

  const servers = serversData?.data ?? []
  const STATUSES = ['active', 'provisioning', 'suspended', 'migrating', 'archived'] as const

  const activeCount = sites.filter((s) => s.status === 'active').length
  const suspendedCount = sites.filter((s) => s.status === 'suspended').length

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sites</h1>
          {sites.length > 0 && (
            <p className="mt-1 text-sm text-tundra-ink-500">
              {sites.length} site{sites.length !== 1 ? 's' : ''} — {activeCount} active
              {suspendedCount > 0 && `, ${String(suspendedCount)} suspended`}
            </p>
          )}
        </div>
        <Link
          to="/sites/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Create site
        </Link>
      </div>

      {/* Filters */}
      {(servers.length > 1 || filterStatus) && (
        <div className="mb-4 flex flex-wrap gap-3">
          {servers.length > 1 && (
            <select
              value={filterServer}
              onChange={(e) => { setFilterServer(e.target.value) }}
              className="rounded border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-700 focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            >
              <option value="">All servers</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value) }}
            className="rounded border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-700 focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
          >
            <option value="">All statuses</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
      )}

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-sm text-tundra-rust">Failed to load sites.</p>}

      {data && (
        <>
          {filtered.length === 0 && (
            <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">
                {sites.length === 0 ? 'No sites yet. Create your first site to get started.' : 'No sites match the current filters.'}
              </p>
              {sites.length === 0 && (
                <Link to="/sites/new" className="mt-3 inline-block text-sm text-tundra-aurora hover:underline">
                  Create a site →
                </Link>
              )}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Domain</th>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Server</th>
                    <th className="px-4 py-3 text-left font-medium">Document root</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {filtered.map((s) => {
                    const server = serverMap.get(s.server_id)
                    return (
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
                        <td className="px-4 py-3 text-tundra-ink-600">{s.name}</td>
                        <td className="px-4 py-3">
                          {server ? (
                            <Link
                              to="/servers/$serverId"
                              params={{ serverId: server.id }}
                              className="text-tundra-ink-500 hover:text-tundra-aurora hover:underline"
                            >
                              {server.name}
                            </Link>
                          ) : (
                            <span className="text-tundra-ink-400 font-mono text-xs">{s.server_id.slice(0, 8)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400 max-w-[14rem] truncate">
                          {s.document_root}
                        </td>
                        <td className="px-4 py-3">{statusBadge(s.status)}</td>
                        <td className="px-4 py-3 text-tundra-ink-400">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <a
                              href={`https://${s.primary_domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-tundra-ink-400 hover:text-tundra-aurora"
                              title="Open site"
                            >
                              ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
