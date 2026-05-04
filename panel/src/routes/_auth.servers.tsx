import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ListResponse, Server, ServerMetricsState } from '@/lib/api-types'
import { SkeletonPage } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_auth/servers')({
  component: ServersPage,
})

function statusBadge(status: Server['status']) {
  const map: Record<string, string> = {
    active: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    provisioning: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    offline: 'bg-tundra-ink-100 text-tundra-ink-600',
    disabled: 'bg-tundra-ink-100 text-tundra-ink-400',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}
    >
      {status}
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

function FleetHealthBar({ servers }: { servers: Server[] }) {
  const active = servers.filter((s) => s.status === 'active').length
  const degraded = servers.filter((s) => s.status === 'degraded').length
  const offline = servers.filter(
    (s) => s.status === 'offline' || s.status === 'disabled',
  ).length
  const total = servers.length

  if (total === 0) return null

  return (
    <div className="mb-6 flex items-center gap-6 rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 px-5 py-3 text-sm">
      <span className="font-medium text-tundra-ink-600">{total} servers</span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-tundra-lichen" />
        <span className="text-tundra-ink-700">
          {active} active
        </span>
      </span>
      {degraded > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
          <span className="text-yellow-800">{degraded} degraded</span>
        </span>
      )}
      {offline > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-tundra-ink-400" />
          <span className="text-tundra-ink-600">{offline} offline</span>
        </span>
      )}
    </div>
  )
}

function ServersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: metricsData } = useQuery({
    queryKey: ['servers', 'metrics-state'],
    queryFn: () => api<ListResponse<ServerMetricsState>>('/servers/metrics-state'),
    enabled: !!data,
  })

  const metricsMap = new Map<string, ServerMetricsState>(
    (metricsData?.data ?? []).map((m) => [m.server_id, m]),
  )

  // Group servers by region
  const grouped: Partial<Record<string, Server[]>> = {}
  for (const s of data?.data ?? []) {
    const region = s.region ?? 'No region'
    if (!grouped[region]) grouped[region] = []
    grouped[region].push(s)
  }
  const regions = Object.keys(grouped).sort()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servers</h1>
        <Link
          to="/servers/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Add server
        </Link>
      </div>

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-tundra-rust">Failed to load servers.</p>}

      {data && (
        <>
          <FleetHealthBar servers={data.data} />

          {data.data.length === 0 && (
            <p className="text-center text-sm text-tundra-ink-400 py-8">
              No servers yet. Add your first server to get started.
            </p>
          )}

          {regions.map((region) => (
            <div key={region} className="mb-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
                {region}
              </h2>
              <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
                <table className="w-full text-sm">
                  <thead className="bg-tundra-ink-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium">Hostname</th>
                      <th className="px-4 py-3 text-left font-medium">OS</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Sites</th>
                      <th className="px-4 py-3 text-left font-medium">RAM used</th>
                      <th className="px-4 py-3 text-left font-medium">Last seen</th>
                      <th className="px-4 py-3 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tundra-ink-100">
                    {(grouped[region] ?? []).map((s) => {
                      const m = metricsMap.get(s.id)
                      const ramPct =
                        m && m.ram_total_mb > 0
                          ? Math.round((m.ram_used_mb / m.ram_total_mb) * 100)
                          : null
                      return (
                        <tr key={s.id} className="hover:bg-tundra-ink-50">
                          <td className="px-4 py-3">
                            <Link
                              to="/servers/$serverId"
                              params={{ serverId: s.id }}
                              className="font-medium text-tundra-aurora hover:underline"
                            >
                              {s.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-tundra-ink-500">{s.hostname}</td>
                          <td className="px-4 py-3 text-tundra-ink-500">{s.os}</td>
                          <td className="px-4 py-3">{statusBadge(s.status)}</td>
                          <td className="px-4 py-3 text-tundra-ink-500">
                            {m ? String(m.site_count) : '—'}
                          </td>
                          <td className="px-4 py-3 text-tundra-ink-500">
                            {ramPct !== null ? `${String(ramPct)}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-tundra-ink-400">
                            {relativeTime(s.agent_last_seen_at)}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={`/servers/${s.id}/maintenance`}
                              className="text-xs text-tundra-ink-400 hover:text-tundra-aurora hover:underline"
                            >
                              Maintenance
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
