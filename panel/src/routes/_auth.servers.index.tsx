import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { ListResponse, Server, ServerMetricsState } from '@/lib/api-types'
import { SkeletonTable } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_auth/servers/')({
  component: ServersPage,
})

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function MiniBar({ value, warn = 75, crit = 90 }: { value: number; warn?: number; crit?: number }) {
  const color = value >= crit ? 'bg-tundra-rust' : value >= warn ? 'bg-yellow-400' : 'bg-tundra-lichen'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-tundra-ink-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${String(Math.min(value, 100))}%` }} />
      </div>
      <span className="w-6 tabular-nums text-xs text-tundra-ink-500">{String(value)}%</span>
    </div>
  )
}

function StatusDot({ status }: { status: Server['status'] }) {
  const dot: Record<string, string> = {
    active: 'bg-tundra-lichen',
    provisioning: 'bg-tundra-aurora animate-pulse',
    degraded: 'bg-yellow-400',
    offline: 'bg-tundra-ink-400',
    disabled: 'bg-tundra-ink-300',
  }
  const label: Record<string, string> = {
    active: 'text-tundra-lichen-800',
    provisioning: 'text-tundra-aurora-800',
    degraded: 'text-yellow-800',
    offline: 'text-tundra-ink-600',
    disabled: 'text-tundra-ink-400',
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot[status] ?? 'bg-tundra-ink-300'}`} />
      <span className={`text-xs font-medium capitalize ${label[status] ?? 'text-tundra-ink-500'}`}>{status}</span>
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

function ServersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['servers', 'metrics-state'],
    queryFn: () => api<ListResponse<ServerMetricsState>>('/servers/metrics-state'),
    enabled: !!data,
    refetchInterval: 30_000,
  })

  const metricsMap = new Map<string, ServerMetricsState>(
    (metricsData?.data ?? []).map((m) => [m.server_id, m]),
  )

  const servers = data?.data ?? []

  const filtered = servers.filter((s) => {
    if (filterStatus && s.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.hostname.toLowerCase().includes(q) || (s.region ?? '').toLowerCase().includes(q)
    }
    return true
  })

  // Fleet stats
  const active = servers.filter((s) => s.status === 'active').length
  const degraded = servers.filter((s) => s.status === 'degraded').length
  const offline = servers.filter((s) => s.status === 'offline' || s.status === 'disabled').length

  const STATUSES = ['active', 'provisioning', 'degraded', 'offline', 'disabled'] as const

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Servers</h1>
          {servers.length > 0 && (
            <p className="mt-0.5 text-sm text-tundra-ink-500">
              {String(servers.length)} server{servers.length !== 1 ? 's' : ''} —
              {' '}<span className="text-tundra-lichen-700">{String(active)} active</span>
              {degraded > 0 && <span className="text-yellow-700"> · {String(degraded)} degraded</span>}
              {offline > 0 && <span className="text-tundra-ink-500"> · {String(offline)} offline</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void queryClient.invalidateQueries({ queryKey: ['servers', 'metrics-state'] }) }}
            disabled={metricsLoading}
            className="rounded border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40"
            title="Refresh metrics"
          >
            <svg className={`h-3.5 w-3.5 ${metricsLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link to="/servers/new" className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600">
            + Add server
          </Link>
        </div>
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          placeholder="Search by name, hostname, region…"
          className="w-64 rounded border border-tundra-ink-200 px-3 py-1.5 text-sm placeholder:text-tundra-ink-400 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => { setFilterStatus('') }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterStatus === '' ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
          >
            All
          </button>
          {STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => { setFilterStatus(st) }}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${filterStatus === st ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <SkeletonTable rows={4} cols={7} />}
      {isError && <p className="text-sm text-tundra-rust">Failed to load servers.</p>}

      {data && (
        <>
          {filtered.length === 0 && (
            <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">
                {servers.length === 0
                  ? 'No servers yet.'
                  : 'No servers match the current filters.'}
              </p>
              {servers.length === 0 && (
                <Link to="/servers/new" className="mt-3 inline-block text-sm text-tundra-aurora hover:underline">
                  Add your first server →
                </Link>
              )}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">OS / Region</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Agent</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">CPU</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">RAM</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Sites</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Last seen</th>
                    <th className="px-4 py-3 text-left font-medium text-tundra-ink-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {filtered.map((s) => {
                    const m = metricsMap.get(s.id)
                    const cpuPct = m ? Math.round(m.cpu_used_pct) : null
                    const ramPct = m ? pct(m.ram_used_mb, m.ram_total_mb) : null
                    return (
                      <tr key={s.id} className="hover:bg-tundra-ink-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            to="/servers/$serverId"
                            params={{ serverId: s.id }}
                            className="font-medium text-tundra-aurora hover:underline"
                          >
                            {s.name}
                          </Link>
                          <div className="text-xs text-tundra-ink-400 mt-0.5">{s.hostname}</div>
                        </td>
                        <td className="px-4 py-3"><StatusDot status={s.status} /></td>
                        <td className="px-4 py-3 text-xs text-tundra-ink-500">
                          <div>{s.os}</div>
                          {s.region && <div className="text-tundra-ink-400">{s.region}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {s.agent_version ? (
                            <span className="rounded bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-mono">{s.agent_version}</span>
                          ) : (
                            <span className="text-xs text-tundra-ink-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {cpuPct != null ? <MiniBar value={cpuPct} /> : <span className="text-xs text-tundra-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {ramPct != null ? <MiniBar value={ramPct} /> : <span className="text-xs text-tundra-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-tundra-ink-500">
                          {m ? String(m.site_count) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-tundra-ink-400">
                          {relativeTime(s.agent_last_seen_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              to="/servers/$serverId"
                              params={{ serverId: s.id }}
                              className="text-xs text-tundra-aurora hover:underline"
                            >
                              View
                            </Link>
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
