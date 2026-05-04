import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ListResponse, Server, ServerMetricsState } from '@/lib/api-types'
import { Skeleton, SkeletonTable } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_auth/servers/')({
  component: ServersPage,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${String(Math.floor(s))}s ago`
  if (s < 3600) return `${String(Math.floor(s / 60))}m ago`
  if (s < 86400) return `${String(Math.floor(s / 3600))}h ago`
  return `${String(Math.floor(s / 86400))}d ago`
}

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: Server['status'] }) {
  const cfg: Record<string, { dot: string; text: string; bg: string }> = {
    active:       { dot: 'bg-tundra-lichen', text: 'text-tundra-lichen-800', bg: 'bg-tundra-lichen-50 border-tundra-lichen-200' },
    provisioning: { dot: 'bg-tundra-aurora animate-pulse', text: 'text-tundra-aurora-800', bg: 'bg-tundra-aurora-50 border-tundra-aurora-200' },
    degraded:     { dot: 'bg-yellow-400', text: 'text-yellow-800', bg: 'bg-yellow-50 border-yellow-200' },
    offline:      { dot: 'bg-red-400', text: 'text-red-800', bg: 'bg-red-50 border-red-200' },
    disabled:     { dot: 'bg-tundra-ink-300', text: 'text-tundra-ink-500', bg: 'bg-tundra-ink-50 border-tundra-ink-200' },
  }
  const c = cfg[status] ?? cfg.disabled
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

function MiniBar({ value, warn = 75, crit = 90 }: { value: number; warn?: number; crit?: number }) {
  const color = value >= crit ? 'bg-red-400' : value >= warn ? 'bg-yellow-400' : 'bg-tundra-lichen'
  const textColor = value >= crit ? 'text-red-700' : value >= warn ? 'text-yellow-700' : 'text-tundra-ink-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-tundra-ink-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${String(Math.min(value, 100))}%` }} />
      </div>
      <span className={`w-7 tabular-nums text-xs font-medium ${textColor}`}>{String(value)}%</span>
    </div>
  )
}

function FleetCard({ label, value, sub, color = 'ink' }: { label: string; value: number | string; sub?: string; color?: 'lichen' | 'rust' | 'yellow' | 'ink' }) {
  const colors = {
    lichen: 'text-tundra-lichen-700',
    rust:   'text-tundra-rust',
    yellow: 'text-yellow-700',
    ink:    'text-tundra-ink',
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-tundra-ink-200 bg-white px-4 py-3">
      <span className="text-xs font-medium uppercase tracking-wider text-tundra-ink-400">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${colors[color]}`}>{String(value)}</span>
      {sub && <span className="text-xs text-tundra-ink-400">{sub}</span>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ServersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [groupByRegion, setGroupByRegion] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: metricsData, isLoading: metricsLoading, dataUpdatedAt } = useQuery({
    queryKey: ['servers', 'metrics-state'],
    queryFn: () => api<ListResponse<ServerMetricsState>>('/servers/metrics-state'),
    enabled: !!data,
    refetchInterval: 30_000,
  })

  const metricsMap = new Map<string, ServerMetricsState>(
    (metricsData?.data ?? []).map((m) => [m.server_id, m]),
  )

  const servers = data?.data ?? []
  const metrics = metricsData?.data ?? []

  // Fleet stats
  const active    = servers.filter((s) => s.status === 'active').length
  const degraded  = servers.filter((s) => s.status === 'degraded').length
  const offline   = servers.filter((s) => s.status === 'offline' || s.status === 'disabled').length
  const enrolling = servers.filter((s) => s.status === 'provisioning').length

  const avgCpu  = metrics.length ? Math.round(metrics.reduce((a, m) => a + m.cpu_used_pct, 0) / metrics.length) : null
  const avgRam  = metrics.length ? Math.round(metrics.reduce((a, m) => a + pct(m.ram_used_mb, m.ram_total_mb), 0) / metrics.length) : null
  const totalSites = metrics.reduce((a, m) => a + m.site_count, 0)

  const STATUSES = ['active', 'provisioning', 'degraded', 'offline', 'disabled'] as const

  const filtered = servers.filter((s) => {
    if (filterStatus && s.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.hostname.toLowerCase().includes(q) ||
        (s.region ?? '').toLowerCase().includes(q) ||
        (s.public_ip ?? '').includes(q) ||
        s.os.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Group by region
  const grouped: Map<string, Server[]> = new Map()
  if (groupByRegion) {
    for (const s of filtered) {
      const r = s.region ?? 'No region'
      if (!grouped.has(r)) grouped.set(r, [])
      grouped.get(r)?.push(s)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">Servers</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">
            Managed nodes — agent health, resource usage, site hosting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['servers', 'metrics-state'] })
              void queryClient.invalidateQueries({ queryKey: ['servers'] })
            }}
            disabled={metricsLoading || isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
            title="Refresh all"
          >
            <svg className={`h-3.5 w-3.5 shrink-0 ${metricsLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
          <Link
            to="/servers/new"
            className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
          >
            + Add server
          </Link>
        </div>
      </div>

      {/* Fleet summary cards */}
      {isLoading ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-tundra-ink-100 bg-white px-4 py-3 space-y-1">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-7 w-10" />
            </div>
          ))}
        </div>
      ) : servers.length > 0 ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FleetCard label="Total" value={servers.length} sub="servers" />
          <FleetCard label="Active" value={active} color="lichen" sub="healthy" />
          {degraded > 0 && <FleetCard label="Degraded" value={degraded} color="yellow" sub="check required" />}
          {offline > 0 && <FleetCard label="Offline" value={offline} color="rust" sub="no heartbeat" />}
          {enrolling > 0 && <FleetCard label="Enrolling" value={enrolling} sub="provisioning" />}
          {avgCpu != null && <FleetCard label="Avg CPU" value={`${String(avgCpu)}%`} color={avgCpu >= 80 ? 'rust' : avgCpu >= 60 ? 'yellow' : 'lichen'} sub="fleet average" />}
          {avgRam != null && <FleetCard label="Avg RAM" value={`${String(avgRam)}%`} color={avgRam >= 85 ? 'rust' : avgRam >= 70 ? 'yellow' : 'ink'} sub="fleet average" />}
          <FleetCard label="Sites" value={totalSites} sub="across fleet" />
        </div>
      ) : null}

      {/* Metrics timestamp */}
      {dataUpdatedAt > 0 && metrics.length > 0 && (
        <p className="mb-3 text-xs text-tundra-ink-400">
          Metrics updated {relativeTime(new Date(dataUpdatedAt).toISOString())} · auto-refresh every 30s
        </p>
      )}

      {/* Search + filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-2.5 top-2 h-4 w-4 text-tundra-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value) }}
            placeholder="Search name, hostname, IP, OS…"
            className="w-64 rounded-lg border border-tundra-ink-200 py-1.5 pl-8 pr-3 text-sm placeholder:text-tundra-ink-400 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
          />
        </div>

        <div className="flex gap-1.5">
          {(['', ...STATUSES] as const).map((st) => (
            <button
              key={st}
              onClick={() => { setFilterStatus(st) }}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filterStatus === st
                  ? 'bg-tundra-ink text-white'
                  : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'
              }`}
            >
              {st === '' ? 'All' : st}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-tundra-ink-500">
            <input
              type="checkbox"
              checked={groupByRegion}
              onChange={(e) => { setGroupByRegion(e.target.checked) }}
              className="rounded"
            />
            Group by region
          </label>
        </div>
      </div>

      {isLoading && <SkeletonTable rows={5} cols={8} />}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load servers. Check the control-plane connection.
        </div>
      )}

      {data && (
        <>
          {filtered.length === 0 && (
            <div className="rounded-lg border border-tundra-ink-200 bg-white py-16 text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-tundra-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-medium text-tundra-ink-500">
                {servers.length === 0 ? 'No servers enrolled yet' : 'No servers match your filters'}
              </p>
              <p className="mt-1 text-xs text-tundra-ink-400">
                {servers.length === 0
                  ? 'Add your first server to start managing infrastructure.'
                  : 'Try clearing the search or status filter.'}
              </p>
              {servers.length === 0 && (
                <Link to="/servers/new" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600">
                  + Add first server
                </Link>
              )}
            </div>
          )}

          {filtered.length > 0 && (() => {
            const renderTable = (rows: Server[]) => (
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50 text-xs">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-tundra-ink-500">Server</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">Status</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">System</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">Agent</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">CPU</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">RAM</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">Disk</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">Sites</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">Heartbeat</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {rows.map((s) => {
                    const m = metricsMap.get(s.id)
                    const cpuPct  = m ? Math.round(m.cpu_used_pct) : null
                    const ramPct  = m ? pct(m.ram_used_mb, m.ram_total_mb) : null
                    const diskPct = m ? pct(m.disk_used_gb, m.disk_total_gb) : null
                    const heartbeatOld = s.agent_last_seen_at
                      ? (Date.now() - new Date(s.agent_last_seen_at).getTime()) > 5 * 60 * 1000
                      : true
                    const inMaintenance = s.maintenance_starts_at && s.maintenance_ends_at &&
                      new Date(s.maintenance_starts_at) <= new Date() &&
                      new Date(s.maintenance_ends_at) >= new Date()

                    return (
                      <tr key={s.id} className={`group hover:bg-tundra-ink-50 transition-colors ${s.status === 'offline' || s.status === 'degraded' ? 'bg-red-50/30' : ''}`}>
                        {/* Server name + hostname */}
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <Link
                              to="/servers/$serverId"
                              params={{ serverId: s.id }}
                              className="font-semibold text-tundra-aurora hover:underline"
                            >
                              {s.name}
                            </Link>
                            {inMaintenance && (
                              <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">maint</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-tundra-ink-400 font-mono">{s.hostname}</span>
                            <button
                              onClick={() => { copyText(s.hostname, 'Hostname') }}
                              className="opacity-0 group-hover:opacity-100 text-tundra-ink-300 hover:text-tundra-ink-600 transition-opacity"
                              title="Copy hostname"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                          {s.public_ip && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs text-tundra-ink-300 font-mono">{s.public_ip}</span>
                              <button
                                onClick={() => { copyText(s.public_ip ?? '', 'IP') }}
                                className="opacity-0 group-hover:opacity-100 text-tundra-ink-300 hover:text-tundra-ink-600 transition-opacity"
                                title="Copy IP"
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3">
                          <StatusPill status={s.status} />
                        </td>

                        {/* System */}
                        <td className="px-3 py-3 text-xs">
                          <div className="text-tundra-ink-600">{s.os}</div>
                          <div className="text-tundra-ink-400">{s.arch} · {s.region ?? 'no region'}</div>
                        </td>

                        {/* Agent */}
                        <td className="px-3 py-3">
                          {s.agent_version ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="rounded bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-mono w-fit">
                                v{s.agent_version}
                              </span>
                              {s.agent_cert_fingerprint && (
                                <span className="text-xs text-tundra-lichen-600">● cert ok</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-yellow-600 font-medium">not enrolled</span>
                          )}
                        </td>

                        {/* CPU */}
                        <td className="px-3 py-3">
                          {cpuPct != null ? <MiniBar value={cpuPct} /> : <span className="text-xs text-tundra-ink-300">—</span>}
                        </td>

                        {/* RAM */}
                        <td className="px-3 py-3">
                          {ramPct != null ? (
                            <div>
                              <MiniBar value={ramPct} warn={80} crit={90} />
                              <div className="text-xs text-tundra-ink-400 mt-0.5">
                                {String(m?.ram_used_mb ?? 0)} / {String(m?.ram_total_mb ?? 0)} MB
                              </div>
                            </div>
                          ) : <span className="text-xs text-tundra-ink-300">—</span>}
                        </td>

                        {/* Disk */}
                        <td className="px-3 py-3">
                          {diskPct != null ? (
                            <div>
                              <MiniBar value={diskPct} warn={75} crit={90} />
                              <div className="text-xs text-tundra-ink-400 mt-0.5">
                                {String(m?.disk_used_gb ?? 0)} / {String(m?.disk_total_gb ?? 0)} GB
                              </div>
                            </div>
                          ) : <span className="text-xs text-tundra-ink-300">—</span>}
                        </td>

                        {/* Sites */}
                        <td className="px-3 py-3 text-xs font-medium text-tundra-ink-600">
                          {m ? String(m.site_count) : '—'}
                        </td>

                        {/* Heartbeat */}
                        <td className="px-3 py-3">
                          <span className={`text-xs ${heartbeatOld && s.status === 'active' ? 'text-red-600' : 'text-tundra-ink-400'}`}>
                            {relativeTime(s.agent_last_seen_at)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              to="/servers/$serverId"
                              params={{ serverId: s.id }}
                              className="rounded px-2 py-1 text-xs text-tundra-aurora hover:bg-tundra-aurora-50 transition-colors"
                            >
                              View
                            </Link>
                            {s.public_ip && (
                              <button
                                onClick={() => { copyText(`ssh root@${s.public_ip ?? ''}`, 'SSH command') }}
                                className="rounded px-2 py-1 text-xs text-tundra-ink-500 hover:bg-tundra-ink-100 transition-colors"
                                title="Copy SSH command"
                              >
                                SSH
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )

            if (groupByRegion) {
              return (
                <div className="space-y-6">
                  {Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([region, rows]) => (
                    <div key={region}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">{region}</span>
                        <span className="text-xs text-tundra-ink-300">{String(rows.length)} server{rows.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-tundra-ink-200 bg-white">
                        {renderTable(rows)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }

            return (
              <div className="overflow-hidden rounded-lg border border-tundra-ink-200 bg-white">
                {renderTable(filtered)}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
