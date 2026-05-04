import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { ListResponse, Server, ServerMetricsState, Site, Domain } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/dashboard')({
  component: DashboardPage,
})

// ─── Local types ──────────────────────────────────────────────────────────────

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

interface AuditEntry {
  id: string
  occurred_at: string
  actor_type: string
  actor_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${String(Math.floor(s))}s ago`
  if (s < 3600) return `${String(Math.floor(s / 60))}m ago`
  if (s < 86400) return `${String(Math.floor(s / 3600))}h ago`
  return `${String(Math.floor(s / 86400))}d ago`
}

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function ResourceBar({ value, warn = 75, crit = 90, label }: { value: number; warn?: number; crit?: number; label: string }) {
  const color = value >= crit ? 'bg-tundra-rust' : value >= warn ? 'bg-yellow-400' : 'bg-tundra-lichen'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 shrink-0 text-tundra-ink-400">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-tundra-ink-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${String(Math.min(value, 100))}%` }} />
      </div>
      <span className="w-8 shrink-0 tabular-nums text-right text-tundra-ink-500">{value}%</span>
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
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${map[status] ?? 'bg-tundra-ink-300'}`} />
}

function StatCard({ label, value, sub, to, accent }: {
  label: string; value: string | number; sub?: string; to: string
  accent?: 'lichen' | 'rust' | 'aurora'
}) {
  const bar = { lichen: 'bg-tundra-lichen', rust: 'bg-tundra-rust', aurora: 'bg-tundra-aurora' }
  return (
    <Link to={to} className="group relative overflow-hidden rounded-xl border border-tundra-ink-200 bg-white p-5 transition-shadow hover:shadow-md">
      {accent && <span className={`absolute left-0 top-0 h-0.5 w-full ${bar[accent]}`} />}
      <div className="text-2xl font-bold text-tundra-ink tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-tundra-ink-600">{label}</div>
      {sub && <div className="mt-1 text-xs text-tundra-ink-400">{sub}</div>}
    </Link>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-tundra-ink-100 px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ message, cta, to }: { message: string; cta?: string; to?: string }) {
  return (
    <div className="px-5 py-8 text-center text-sm text-tundra-ink-400">
      {message}{' '}
      {cta && to && <Link to={to} className="text-tundra-lichen hover:underline">{cta}</Link>}
    </div>
  )
}

// ─── Action label map ─────────────────────────────────────────────────────────

function auditLabel(action: string): string {
  const map: Record<string, string> = {
    'operator.login': 'Signed in',
    'operator.logout': 'Signed out',
    'operator.totp_enabled': 'Enabled TOTP',
    'operator.totp_disabled': 'Disabled TOTP',
    'operator.passkey_registered': 'Registered passkey',
    'operator.passkey_deleted': 'Deleted passkey',
    'site.created': 'Created site',
    'site.deleted': 'Deleted site',
    'server.created': 'Added server',
    'server.deleted': 'Deleted server',
    'backup.job_started': 'Backup started',
    'backup.job_completed': 'Backup completed',
    'backup.job_failed': 'Backup failed',
    'deployment.triggered': 'Deployment triggered',
    'alert_rule.created': 'Alert rule created',
    'alert_rule.deleted': 'Alert rule deleted',
  }
  return map[action] ?? action.replace(/\./g, ' ').replace(/_/g, ' ')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const operator = useAuthStore((s) => s.operator)

  const { data: serversData } = useQuery({ queryKey: ['servers'], queryFn: () => api<ListResponse<Server>>('/servers') })
  const { data: metricsData } = useQuery({ queryKey: ['server-metrics-state'], queryFn: () => api<{ data: ServerMetricsState[] }>('/servers/metrics-state') })
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: () => api<ListResponse<Site>>('/sites') })
  const { data: domainsData } = useQuery({ queryKey: ['domains'], queryFn: () => api<ListResponse<Domain>>('/domains') })
  const { data: deliveriesData } = useQuery({ queryKey: ['alert-deliveries'], queryFn: () => api<{ data: AlertDelivery[] }>('/alert-deliveries?limit=20') })
  const { data: rulesData } = useQuery({ queryKey: ['alert-rules'], queryFn: () => api<{ data: AlertRule[] }>('/alert-rules') })
  const { data: auditData } = useQuery({ queryKey: ['audit-log-dash'], queryFn: () => api<{ data: AuditEntry[] }>('/audit-log?limit=8') })

  const servers = serversData?.data ?? []
  const metrics = metricsData?.data ?? []
  const sites = sitesData?.data ?? []
  const domains = domainsData?.data ?? []
  const deliveries = deliveriesData?.data ?? []
  const rules = rulesData?.data ?? []
  const auditEntries = auditData?.data ?? []

  const activeAlerts = deliveries.filter((d) => !d.resolved_at)
  const degradedServers = servers.filter((s) => s.status === 'degraded' || s.status === 'offline').length
  const activeSites = sites.filter((s) => s.status === 'active').length
  const metricsMap = Object.fromEntries(metrics.map((m) => [m.server_id, m])) as Record<string, ServerMetricsState | undefined>

  // Fleet aggregates
  const metricsArr = metrics
  const avgCpu = metricsArr.length > 0 ? Math.round(metricsArr.reduce((s, m) => s + m.cpu_used_pct, 0) / metricsArr.length) : null
  const avgRam = metricsArr.length > 0 ? Math.round(metricsArr.reduce((s, m) => s + pct(m.ram_used_mb, m.ram_total_mb), 0) / metricsArr.length) : null
  const avgDisk = metricsArr.length > 0 ? Math.round(metricsArr.reduce((s, m) => s + pct(m.disk_used_gb, m.disk_total_gb), 0) / metricsArr.length) : null

  // Domains expiring within 30 days
  const nowMs = Date.now()
  const expiringDomains = domains.filter((d) => {
    if (!d.registration_expires_at) return false
    const daysLeft = (new Date(d.registration_expires_at).getTime() - nowMs) / 86_400_000
    return daysLeft >= 0 && daysLeft <= 30
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-tundra-ink">
          {greeting}, {operator?.full_name.split(' ')[0]}.
        </h1>
        <p className="mt-1 text-sm text-tundra-ink-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Active alerts banner */}
      {activeAlerts.length > 0 && (
        <Link to="/alerts" className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm transition-colors hover:bg-red-100">
          <div className="flex items-center gap-2 font-medium text-red-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {activeAlerts.length} active alert{activeAlerts.length > 1 ? 's' : ''} firing
          </div>
          <span className="text-red-500 text-xs">View →</span>
        </Link>
      )}

      {/* Domain expiry warning */}
      {expiringDomains.length > 0 && (
        <Link to="/domains" className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm transition-colors hover:bg-yellow-100">
          <div className="flex items-center gap-2 font-medium text-yellow-700">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
            {expiringDomains.length} domain{expiringDomains.length > 1 ? 's' : ''} expiring within 30 days
          </div>
          <span className="text-yellow-600 text-xs">Manage →</span>
        </Link>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Servers" value={servers.length}
          sub={degradedServers > 0 ? `${String(degradedServers)} degraded` : `${String(servers.filter(s => s.status === 'active').length)} active`}
          to="/servers" accent={degradedServers > 0 ? 'rust' : 'lichen'} />
        <StatCard label="Sites" value={sites.length} sub={`${String(activeSites)} active`}
          to="/sites" accent="lichen" />
        <StatCard label="Domains" value={domains.length}
          sub={expiringDomains.length > 0 ? `${String(expiringDomains.length)} expiring soon` : 'all managed'}
          to="/domains" accent={expiringDomains.length > 0 ? 'rust' : 'aurora'} />
        <StatCard label="Alert rules" value={rules.length}
          sub={activeAlerts.length > 0 ? `${String(activeAlerts.length)} firing` : 'all clear'}
          to="/alerts" accent={activeAlerts.length > 0 ? 'rust' : undefined} />
      </div>

      {/* Fleet aggregate health bar */}
      {metricsArr.length > 0 && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Fleet health — {metricsArr.length} server{metricsArr.length > 1 ? 's' : ''} reporting</h2>
            <Link to="/servers" className="text-xs text-tundra-aurora hover:underline">Details →</Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {avgCpu != null && <ResourceBar value={avgCpu} label="CPU" />}
            {avgRam != null && <ResourceBar value={avgRam} label="RAM" />}
            {avgDisk != null && <ResourceBar value={avgDisk} label="Disk" />}
          </div>
          {/* Per-server dots */}
          <div className="mt-3 flex flex-wrap gap-3">
            {servers.map((s) => {
              const sm = metricsMap[s.id]
              return (
                <Link key={s.id} to="/servers/$serverId" params={{ serverId: s.id }}
                  className="flex items-center gap-1.5 text-xs text-tundra-ink-500 hover:text-tundra-ink">
                  <StatusDot status={s.status} />
                  <span>{s.name}</span>
                  {sm && (
                    <span className="text-tundra-ink-300">
                      CPU {String(Math.round(sm.cpu_used_pct))}%
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Main 2-col grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fleet */}
        <SectionCard title="Fleet" action={<Link to="/servers" className="text-xs text-tundra-aurora hover:underline">View all</Link>}>
          {servers.length === 0
            ? <EmptyState message="No servers." cta="Add one →" to="/servers/new" />
            : (
              <div className="divide-y divide-tundra-ink-100">
                {servers.slice(0, 5).map((s) => {
                  const m = metricsMap[s.id]
                  return (
                    <Link key={s.id} to="/servers/$serverId" params={{ serverId: s.id }}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-tundra-ink-50 transition-colors">
                      <StatusDot status={s.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-tundra-ink">{s.name}</span>
                          <span className="shrink-0 text-xs text-tundra-ink-400">{relTime(s.agent_last_seen_at)}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-tundra-ink-400">{s.hostname} · {s.region ?? 'no region'}</div>
                      </div>
                      {m && (
                        <div className="hidden shrink-0 flex-col gap-1 sm:flex w-20">
                          <ResourceBar value={Math.round(m.cpu_used_pct)} label="C" />
                          <ResourceBar value={pct(m.ram_used_mb, m.ram_total_mb)} label="R" />
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
        </SectionCard>

        {/* Sites */}
        <SectionCard title="Sites" action={<Link to="/sites" className="text-xs text-tundra-aurora hover:underline">View all</Link>}>
          {sites.length === 0
            ? <EmptyState message="No sites." cta="Create one →" to="/sites/new" />
            : (
              <div className="divide-y divide-tundra-ink-100">
                {sites.slice(0, 5).map((site) => {
                  const srv = servers.find((s) => s.id === site.server_id)
                  return (
                    <Link key={site.id} to="/sites/$siteId" params={{ siteId: site.id }}
                      className="flex items-center justify-between px-5 py-3 hover:bg-tundra-ink-50 transition-colors">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-tundra-ink">{site.primary_domain}</div>
                        <div className="mt-0.5 text-xs text-tundra-ink-400">
                          {site.name}{srv ? ` · ${srv.name}` : ''}
                        </div>
                      </div>
                      <span className={`ml-3 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        site.status === 'active' ? 'bg-tundra-lichen-100 text-tundra-lichen-800' : 'bg-tundra-ink-100 text-tundra-ink-600'
                      }`}>{site.status}</span>
                    </Link>
                  )
                })}
              </div>
            )}
        </SectionCard>

        {/* Active alerts */}
        <SectionCard title="Active alerts" action={<Link to="/alerts" className="text-xs text-tundra-aurora hover:underline">Manage rules</Link>}>
          {activeAlerts.length === 0
            ? <EmptyState message="All clear — no active alerts." />
            : (
              <div className="divide-y divide-tundra-ink-100">
                {activeAlerts.slice(0, 5).map((d) => {
                  const rule = rules.find((r) => r.id === d.rule_id)
                  const color = rule?.severity === 'critical' ? 'text-tundra-rust' : rule?.severity === 'warning' ? 'text-yellow-600' : 'text-tundra-aurora'
                  return (
                    <div key={d.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <span className={`text-sm font-medium ${color}`}>{rule?.name ?? d.rule_id}</span>
                        <div className="mt-0.5 text-xs text-tundra-ink-400">
                          fired {relTime(d.fired_at)} · value {d.current_value.toFixed(1)} / threshold {d.threshold.toFixed(1)}
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
        </SectionCard>

        {/* Recent activity */}
        <SectionCard title="Recent activity" action={<Link to="/audit-log" className="text-xs text-tundra-aurora hover:underline">Full log</Link>}>
          {auditEntries.length === 0
            ? <EmptyState message="No activity yet." />
            : (
              <div className="divide-y divide-tundra-ink-100">
                {auditEntries.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-tundra-ink-300 mt-2" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-tundra-ink">{auditLabel(e.action)}</div>
                      <div className="mt-0.5 text-xs text-tundra-ink-400">
                        {e.resource_type ?? e.actor_type} · {relTime(e.occurred_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </SectionCard>

        {/* Domains */}
        <SectionCard title="Domains" action={<Link to="/domains" className="text-xs text-tundra-aurora hover:underline">View all</Link>}>
          {domains.length === 0
            ? <EmptyState message="No domains registered." cta="Add one →" to="/domains" />
            : (
              <div className="divide-y divide-tundra-ink-100">
                {domains.slice(0, 5).map((d) => {
                  const daysLeft = d.registration_expires_at
                    ? Math.ceil((new Date(d.registration_expires_at).getTime() - nowMs) / 86_400_000)
                    : null
                  const expiringSoon = daysLeft != null && daysLeft <= 30
                  return (
                    <Link key={d.id} to="/domains" className="flex items-center justify-between px-5 py-3 hover:bg-tundra-ink-50 transition-colors">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-tundra-ink">{d.apex}</div>
                        <div className="mt-0.5 text-xs text-tundra-ink-400">DNS: {d.dns_managed_by}</div>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        {daysLeft != null ? (
                          <span className={`text-xs font-medium ${expiringSoon ? 'text-tundra-rust' : 'text-tundra-ink-400'}`}>
                            {expiringSoon ? `expires in ${String(daysLeft)}d` : `${String(daysLeft)}d left`}
                          </span>
                        ) : (
                          <span className="rounded bg-tundra-lichen-100 px-2 py-0.5 text-xs text-tundra-lichen-800">
                            {d.dns_managed_by === 'tundra' ? 'managed' : 'external'}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
        </SectionCard>

        {/* Quick actions */}
        <SectionCard title="Quick actions">
          <div className="grid grid-cols-2 gap-px bg-tundra-ink-100">
            {[
              { label: 'Add server', sub: 'Enrol a new node', to: '/servers/new' },
              { label: 'Create site', sub: 'Deploy a web application', to: '/sites/new' },
              { label: 'Add domain', sub: 'Register or import', to: '/domains' },
              { label: 'Browse templates', sub: '13 stacks available', to: '/templates' },
              { label: 'Manage plugins', sub: 'Namecheap, GitHub, MCP', to: '/plugins' },
              { label: 'AI agents (MCP)', sub: 'Connect Claude, Cursor', to: '/settings/mcp' },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="flex flex-col gap-0.5 bg-white px-4 py-4 hover:bg-tundra-lichen-50 transition-colors">
                <span className="text-sm font-medium text-tundra-ink">{a.label}</span>
                <span className="text-xs text-tundra-ink-400">{a.sub}</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
