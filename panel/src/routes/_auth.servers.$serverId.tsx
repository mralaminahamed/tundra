import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Server, ServerMetricsState, Site, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers/$serverId')({
  component: ServerDetailPage,
})

function statusBadge(status: Server['status']) {
  const map: Record<string, { cls: string; dot: string }> = {
    active: { cls: 'bg-tundra-lichen-100 text-tundra-lichen-800', dot: 'bg-tundra-lichen' },
    provisioning: { cls: 'bg-tundra-aurora-100 text-tundra-aurora-800', dot: 'bg-tundra-aurora' },
    degraded: { cls: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-400' },
    offline: { cls: 'bg-tundra-ink-100 text-tundra-ink-600', dot: 'bg-tundra-ink-400' },
    disabled: { cls: 'bg-tundra-ink-100 text-tundra-ink-400', dot: 'bg-tundra-ink-300' },
  }
  const v = map[status] ?? { cls: '', dot: 'bg-tundra-ink-300' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${v.cls}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {status}
    </span>
  )
}

function MetricBar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const color = pct >= 90 ? 'bg-tundra-rust' : pct >= 70 ? 'bg-yellow-400' : 'bg-tundra-lichen'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-tundra-ink-700">{label}</span>
        <span className="text-tundra-ink-500">{String(used)}/{String(total)} {unit} ({String(pct)}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-tundra-ink-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${String(pct)}%` }} />
      </div>
    </div>
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

function ServerDetailPage() {
  const { serverId } = Route.useParams()

  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['servers', serverId],
    queryFn: () => api<Server>(`/servers/${serverId}`),
  })

  const { data: metricsData } = useQuery({
    queryKey: ['servers', serverId, 'metrics'],
    queryFn: () => api<ServerMetricsState>(`/servers/${serverId}/metrics-state`),
    enabled: !!server,
    refetchInterval: 30_000,
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites', 'by-server', serverId],
    queryFn: () => api<ListResponse<Site>>(`/sites?server_id=${serverId}`),
    enabled: !!server,
  })

  if (isLoading) return <p className="text-sm text-tundra-ink-400 p-4">Loading…</p>
  if (isError || !server) return <p className="text-sm text-tundra-rust p-4">Server not found.</p>

  const m = metricsData
  const sites = sitesData?.data ?? []
  const serverWithExtras = server as Server & { arch?: string; agent_cert_fingerprint?: string }
  const inMaintenance = server.maintenance_starts_at && server.maintenance_ends_at &&
    new Date(server.maintenance_starts_at) <= new Date() &&
    new Date(server.maintenance_ends_at) >= new Date()

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{server.name}</h1>
              {statusBadge(server.status)}
            </div>
            <p className="mt-1 text-sm text-tundra-ink-500">
              {server.hostname}
              {server.region && <span className="ml-2 text-tundra-ink-400">· {server.region}</span>}
            </p>
          </div>
          <a
            href={`/servers/${server.id}/maintenance`}
            className="rounded border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50"
          >
            {inMaintenance ? '🔧 In maintenance' : 'Schedule maintenance'}
          </a>
        </div>

        {inMaintenance && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            Server is in scheduled maintenance window until {new Date(server.maintenance_ends_at!).toLocaleString()}.
          </div>
        )}
      </div>

      {/* Metrics */}
      {m && (
        <div className="mb-6 rounded-lg border border-tundra-ink-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-tundra-ink-600">Resource usage</h2>
            <span className="text-xs text-tundra-ink-400">
              Updated {relativeTime(m.refreshed_at)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricBar label="CPU" used={Math.round(m.cpu_used_pct)} total={100} unit="%" />
            <MetricBar label="RAM" used={m.ram_used_mb} total={m.ram_total_mb} unit="MB" />
            <MetricBar label="Disk" used={m.disk_used_gb} total={m.disk_total_gb} unit="GB" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* System info */}
        <div className="rounded-lg border border-tundra-ink-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-tundra-ink-600">System</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-tundra-ink-500">OS</dt>
            <dd className="font-medium">{server.os}</dd>

            {serverWithExtras.arch && (
              <>
                <dt className="text-tundra-ink-500">Arch</dt>
                <dd>{serverWithExtras.arch}</dd>
              </>
            )}

            <dt className="text-tundra-ink-500">Agent</dt>
            <dd>{server.agent_version ?? <span className="text-tundra-ink-400">not enrolled</span>}</dd>

            <dt className="text-tundra-ink-500">Last seen</dt>
            <dd className={server.status === 'offline' ? 'text-tundra-rust' : 'text-tundra-ink'}>
              {relativeTime(server.agent_last_seen_at)}
            </dd>

            {server.region && (
              <>
                <dt className="text-tundra-ink-500">Region</dt>
                <dd>{server.region}</dd>
              </>
            )}

            <dt className="text-tundra-ink-500">Added</dt>
            <dd>{new Date(server.created_at).toLocaleDateString()}</dd>
          </dl>
        </div>

        {/* Sites on this server */}
        <div className="rounded-lg border border-tundra-ink-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-tundra-ink-600">
            Sites
            {m && <span className="ml-2 text-tundra-ink-400 font-normal">({String(m.site_count)})</span>}
          </h2>
          {sites.length === 0 ? (
            <p className="text-sm text-tundra-ink-400">No sites on this server.</p>
          ) : (
            <ul className="space-y-2">
              {sites.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link
                    to="/sites/$siteId"
                    params={{ siteId: s.id }}
                    className="text-sm text-tundra-aurora hover:underline truncate"
                  >
                    {s.primary_domain}
                  </Link>
                  <span className={`shrink-0 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${s.status === 'active' ? 'bg-tundra-lichen-100 text-tundra-lichen-700' : 'bg-tundra-ink-100 text-tundra-ink-500'}`}>
                    {s.status}
                  </span>
                </li>
              ))}
              {sites.length > 8 && (
                <li className="text-xs text-tundra-ink-400">+{String(sites.length - 8)} more</li>
              )}
            </ul>
          )}
          <Link
            to="/sites"
            className="mt-3 inline-block text-xs text-tundra-aurora hover:underline"
          >
            View all sites →
          </Link>
        </div>
      </div>

      {/* Agent cert fingerprint */}
      {serverWithExtras.agent_cert_fingerprint && (
        <div className="mt-6 rounded-lg border border-tundra-ink-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-tundra-ink-600">Agent certificate fingerprint</h2>
          <code className="block rounded bg-tundra-ink-50 px-3 py-2 text-xs font-mono text-tundra-ink-700 break-all">
            {serverWithExtras.agent_cert_fingerprint}
          </code>
        </div>
      )}
    </div>
  )
}
