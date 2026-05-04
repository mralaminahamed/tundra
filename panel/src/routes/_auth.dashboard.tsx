import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { ListResponse, Server, ServerMetricsState, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/dashboard')({
  component: DashboardPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertDelivery {
  id: string
  rule_id: string
  fired_at: string
  resolved_at: string | null
  current_value: number
  threshold: number
}

interface AlertRule {
  id: string
  name: string
  severity: 'info' | 'warning' | 'critical'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function MiniBar({ value, warn = 75, crit = 90 }: { value: number; warn?: number; crit?: number }) {
  const color =
    value >= crit
      ? 'bg-tundra-rust'
      : value >= warn
        ? 'bg-yellow-400'
        : 'bg-tundra-lichen'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-tundra-ink-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-tundra-ink-500">{value}%</span>
    </div>
  )
}

function StatusDot({ status }: { status: Server['status'] }) {
  const map: Record<string, string> = {
    active: 'bg-tundra-lichen',
    provisioning: 'bg-tundra-aurora',
    degraded: 'bg-yellow-400',
    offline: 'bg-tundra-rust',
    disabled: 'bg-tundra-ink-300',
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-tundra-ink-300'}`} />
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  to,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  to: string
  accent?: 'lichen' | 'rust' | 'aurora'
}) {
  const bar: Record<string, string> = {
    lichen: 'bg-tundra-lichen',
    rust: 'bg-tundra-rust',
    aurora: 'bg-tundra-aurora',
  }
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-xl border border-tundra-ink-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      {accent && (
        <span className={`absolute left-0 top-0 h-0.5 w-full ${bar[accent]}`} />
      )}
      <div className="text-2xl font-bold text-tundra-ink tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-tundra-ink-600">{label}</div>
      {sub && <div className="mt-1 text-xs text-tundra-ink-400">{sub}</div>}
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const operator = useAuthStore((s) => s.operator)

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: metricsData } = useQuery({
    queryKey: ['server-metrics-state'],
    queryFn: () => api<{ data: ServerMetricsState[] }>('/servers/metrics-state'),
  })

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  const { data: deliveriesData } = useQuery({
    queryKey: ['alert-deliveries'],
    queryFn: () => api<{ data: AlertDelivery[] }>('/alert-deliveries?limit=20'),
  })

  const { data: rulesData } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => api<{ data: AlertRule[] }>('/alert-rules'),
  })

  const servers = serversData?.data ?? []
  const metrics = metricsData?.data ?? []
  const sites = sitesData?.data ?? []
  const deliveries = deliveriesData?.data ?? []
  const rules = rulesData?.data ?? []

  const activeAlerts = deliveries.filter((d) => !d.resolved_at)
  const activeServers = servers.filter((s) => s.status === 'active').length
  const degradedServers = servers.filter((s) => s.status === 'degraded' || s.status === 'offline').length
  const activeSites = sites.filter((s) => s.status === 'active').length

  const metricsMap = Object.fromEntries(metrics.map((m) => [m.server_id, m]))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-tundra-ink">
          {greeting}, {operator?.full_name?.split(' ')[0]}.
        </h1>
        <p className="mt-1 text-sm text-tundra-ink-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Active alerts banner */}
      {activeAlerts.length > 0 && (
        <Link
          to="/alerts"
          className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm transition-colors hover:bg-red-100"
        >
          <div className="flex items-center gap-2 font-medium text-red-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {activeAlerts.length} active alert{activeAlerts.length > 1 ? 's' : ''}
          </div>
          <span className="text-red-500">View →</span>
        </Link>
      )}

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Servers"
          value={servers.length}
          sub={degradedServers > 0 ? `${String(degradedServers)} degraded` : `${String(activeServers)} active`}
          to="/servers"
          accent={degradedServers > 0 ? 'rust' : 'lichen'}
        />
        <StatCard
          label="Sites"
          value={sites.length}
          sub={`${String(activeSites)} active`}
          to="/sites"
          accent="lichen"
        />
        <StatCard
          label="Alert rules"
          value={rules.length}
          sub={activeAlerts.length > 0 ? `${String(activeAlerts.length)} firing` : 'all clear'}
          to="/alerts"
          accent={activeAlerts.length > 0 ? 'rust' : undefined}
        />
        <StatCard
          label="Domains"
          value="—"
          sub="manage DNS"
          to="/domains"
          accent="aurora"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Server fleet */}
        <section className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-tundra-ink-100 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">Fleet</h2>
            <Link to="/servers" className="text-xs text-tundra-aurora hover:underline">
              View all
            </Link>
          </div>
          {servers.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-tundra-ink-400">
              No servers.{' '}
              <Link to="/servers/new" className="text-tundra-lichen hover:underline">
                Add one →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-tundra-ink-100">
              {servers.slice(0, 5).map((s) => {
                const m = metricsMap[s.id]
                return (
                  <Link
                    key={s.id}
                    to="/servers/$serverId"
                    params={{ serverId: s.id }}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-tundra-ink-50 transition-colors"
                  >
                    <StatusDot status={s.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-tundra-ink">{s.name}</span>
                        <span className="shrink-0 text-xs text-tundra-ink-400">{relTime(s.agent_last_seen_at)}</span>
                      </div>
                      <div className="mt-1 text-xs text-tundra-ink-400">{s.hostname}</div>
                    </div>
                    {m && (
                      <div className="hidden shrink-0 flex-col gap-1 sm:flex">
                        <MiniBar value={Math.round(m.cpu_used_pct)} />
                        <MiniBar value={pct(m.ram_used_mb, m.ram_total_mb)} />
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Sites */}
        <section className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-tundra-ink-100 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">Sites</h2>
            <Link to="/sites" className="text-xs text-tundra-aurora hover:underline">
              View all
            </Link>
          </div>
          {sites.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-tundra-ink-400">
              No sites.{' '}
              <Link to="/sites/new" className="text-tundra-lichen hover:underline">
                Create one →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-tundra-ink-100">
              {sites.slice(0, 5).map((site) => (
                <Link
                  key={site.id}
                  to="/sites/$siteId"
                  params={{ siteId: site.id }}
                  className="flex items-center justify-between px-5 py-3 hover:bg-tundra-ink-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-tundra-ink">{site.primary_domain}</div>
                    <div className="mt-0.5 text-xs text-tundra-ink-400">{site.name}</div>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                      site.status === 'active'
                        ? 'bg-tundra-lichen-100 text-tundra-lichen-800'
                        : 'bg-tundra-ink-100 text-tundra-ink-600'
                    }`}
                  >
                    {site.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Active alerts */}
        <section className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-tundra-ink-100 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
              Active alerts
            </h2>
            <Link to="/alerts" className="text-xs text-tundra-aurora hover:underline">
              Manage rules
            </Link>
          </div>
          {activeAlerts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-tundra-ink-400">
              All clear — no active alerts.
            </div>
          ) : (
            <div className="divide-y divide-tundra-ink-100">
              {activeAlerts.slice(0, 5).map((d) => {
                const rule = rules.find((r) => r.id === d.rule_id)
                const severityColor =
                  rule?.severity === 'critical'
                    ? 'text-tundra-rust'
                    : rule?.severity === 'warning'
                      ? 'text-yellow-600'
                      : 'text-tundra-aurora'
                return (
                  <div key={d.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <span className={`text-sm font-medium ${severityColor}`}>
                        {rule?.name ?? d.rule_id}
                      </span>
                      <div className="mt-0.5 text-xs text-tundra-ink-400">
                        fired {relTime(d.fired_at)} · value {d.current_value.toFixed(1)} / {d.threshold.toFixed(1)}
                      </div>
                    </div>
                    <span className="ml-3 shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {rule?.severity ?? 'alert'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="border-b border-tundra-ink-100 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">Quick actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-px bg-tundra-ink-100">
            {[
              { label: 'Add server', sub: 'Enrol a new node', to: '/servers/new' },
              { label: 'Create site', sub: 'Deploy a web application', to: '/sites/new' },
              { label: 'Add domain', sub: 'Register or import', to: '/domains' },
              { label: 'Browse templates', sub: '13 stacks available', to: '/templates' },
              { label: 'Manage plugins', sub: 'Namecheap, GitHub, MCP', to: '/plugins' },
              { label: 'Security settings', sub: 'TOTP, passkeys', to: '/settings/security' },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="flex flex-col gap-0.5 bg-white px-4 py-4 hover:bg-tundra-lichen-50 transition-colors"
              >
                <span className="text-sm font-medium text-tundra-ink">{a.label}</span>
                <span className="text-xs text-tundra-ink-400">{a.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
