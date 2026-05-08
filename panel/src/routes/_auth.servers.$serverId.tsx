import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { WrenchIcon } from '@/components/icons'
import type { Server, ServerMetricsState, Site, ListResponse } from '@/lib/api-types'
import { fmtDate, fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/servers/$serverId')({
  component: ServerDetailPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'monitoring' | 'sites' | 'firewall' | 'updates' | 'processes' | 'terminal' | 'edit' | 'danger'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function relTime(iso: string | null): string {
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

function StatusBadge({ status }: { status: Server['status'] }) {
  const cfg: Record<string, { dot: string; text: string; bg: string }> = {
    active:       { dot: 'bg-tundra-lichen',           text: 'text-tundra-lichen-800', bg: 'bg-tundra-lichen-50 border-tundra-lichen-200' },
    provisioning: { dot: 'bg-tundra-aurora animate-pulse', text: 'text-tundra-aurora-800', bg: 'bg-tundra-aurora-50 border-tundra-aurora-200' },
    degraded:     { dot: 'bg-yellow-400',               text: 'text-yellow-800',        bg: 'bg-yellow-50 border-yellow-200' },
    offline:      { dot: 'bg-red-400',                  text: 'text-red-800',           bg: 'bg-red-50 border-red-200' },
    disabled:     { dot: 'bg-tundra-ink-300',           text: 'text-tundra-ink-500',    bg: 'bg-tundra-ink-50 border-tundra-ink-200' },
  }
  const c = cfg[status] ?? cfg.disabled
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${c.bg} ${c.text}`}>
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

function GaugeRing({ value, size = 80, warn = 75, crit = 90, label, sublabel }: {
  value: number; size?: number; warn?: number; crit?: number; label: string; sublabel?: string
}) {
  const r = 30
  const circ = 2 * Math.PI * r
  const used = circ * (Math.min(value, 100) / 100)
  const color = value >= crit ? '#ef4444' : value >= warn ? '#f59e0b' : '#4ade80'
  const textColor = value >= crit ? 'text-red-600' : value >= warn ? 'text-yellow-600' : 'text-tundra-lichen-700'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="40" cy="40" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${String(used)} ${String(circ - used)}`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-base font-bold tabular-nums ${textColor}`}>{String(value)}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-tundra-ink-600">{label}</span>
      {sublabel && <span className="text-xs text-tundra-ink-400">{sublabel}</span>}
    </div>
  )
}

function InfoRow({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-tundra-ink-100 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-tundra-ink-400 pt-0.5">{label}</span>
      <span className={`text-sm text-tundra-ink text-right ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      onClick={() => { copyText(value, label) }}
      className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-tundra-ink-200 px-1.5 py-0.5 text-xs text-tundra-ink-400 hover:bg-tundra-ink-50 hover:text-tundra-ink transition-colors"
      title={`Copy ${label}`}
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
      </svg>
      Copy
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ServerDetailPage() {
  const { serverId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [editOverrides, setEditOverrides] = useState<Partial<{ name: string; region: string; notes: string }>>({})

  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['servers', serverId],
    queryFn: () => api<Server>(`/servers/${serverId}`),
  })

  const { data: metricsData, refetch: refetchMetrics, isFetching: metricsFetching } = useQuery({
    queryKey: ['servers', serverId, 'metrics'],
    queryFn: () => api<ServerMetricsState>(`/servers/${serverId}/metrics-state`),
    enabled: !!server,
    refetchInterval: 30_000,
  })

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites', 'by-server', serverId],
    queryFn: () => api<ListResponse<Site>>(`/sites?server_id=${serverId}`),
    enabled: tab === 'sites' && !!server,
  })

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/servers/${serverId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['servers', serverId] })
      void queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server updated')
      setEditOverrides({})
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api(`/servers/${serverId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server removed')
      void navigate({ to: '/servers' })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading) return (
    <div className="max-w-5xl space-y-5">
      <div className="h-8 w-60 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-6 w-32 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-48 animate-pulse rounded-xl bg-tundra-ink-100" />
    </div>
  )
  if (isError || !server) return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Server not found or an error occurred.
    </div>
  )

  const m = metricsData
  const sites = sitesData?.data ?? []
  const editName   = editOverrides.name   ?? server.name
  const editRegion = editOverrides.region ?? (server.region ?? '')
  const editNotes  = editOverrides.notes  ?? (server.notes ?? '')

  const inMaintenance = server.maintenance_starts_at && server.maintenance_ends_at &&
    new Date(server.maintenance_starts_at) <= new Date() &&
    new Date(server.maintenance_ends_at) >= new Date()

  const isOffline = server.status === 'offline' || server.status === 'degraded'
  const isEnrolled = !!server.agent_version

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'monitoring', label: m ? 'Monitoring ●' : 'Monitoring' },
    { id: 'sites',     label: `Sites${m ? ` (${String(m.site_count)})` : ''}` },
    { id: 'firewall',  label: 'Firewall' },
    { id: 'updates',   label: 'Updates' },
    { id: 'processes', label: 'Processes' },
    { id: 'terminal',  label: 'Terminal' },
    { id: 'edit',      label: 'Edit' },
    { id: 'danger',    label: 'Danger' },
  ]

  const sshCommand = server.public_ip ? `ssh root@${server.public_ip}` : null

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-tundra-ink-400">
        <Link to="/servers" className="hover:text-tundra-aurora">Servers</Link>
        <span>/</span>
        <span className="text-tundra-ink-600">{server.name}</span>
      </nav>

      {/* Status banners */}
      {inMaintenance && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <span className="flex items-center gap-1.5 font-medium"><WrenchIcon size={14} /> Maintenance window active</span>
          <span>until {fmtDateTime(server.maintenance_ends_at ?? '')}</span>
          <Link to="/servers/$serverId/maintenance" params={{ serverId: server.id }} className="ml-auto text-xs underline">
            Manage
          </Link>
        </div>
      )}
      {isOffline && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
          <span className="font-medium">Agent not responding</span>
          <span className="text-red-600">Last heartbeat: {relTime(server.agent_last_seen_at)}</span>
        </div>
      )}
      {!isEnrolled && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <span className="font-medium">Agent not enrolled.</span>{' '}
          Run the enrolment command below to connect this server.
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">{server.name}</h1>
            <StatusBadge status={server.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-tundra-ink-500">
            <span className="flex items-center gap-1 font-mono text-xs">
              {server.hostname}
              <CopyButton value={server.hostname} label="hostname" />
            </span>
            {server.public_ip && (
              <span className="flex items-center gap-1 font-mono text-xs text-tundra-ink-400">
                {server.public_ip}
                <CopyButton value={server.public_ip} label="IP" />
              </span>
            )}
            {sshCommand && (
              <span className="flex items-center gap-1 font-mono text-xs text-tundra-ink-400">
                <CopyButton value={sshCommand} label="SSH command" />
                <span className="text-tundra-ink-300">{sshCommand}</span>
              </span>
            )}
            {server.region && (
              <span className="rounded bg-tundra-ink-100 px-2 py-0.5 text-xs">{server.region}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => { void refetchMetrics() }}
          disabled={metricsFetching}
          className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
        >
          <svg className={`h-3.5 w-3.5 ${metricsFetching ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-0.5 border-b border-tundra-ink-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-tundra-lichen text-tundra-lichen'
                : t.id === 'danger'
                  ? 'border-transparent text-tundra-rust hover:text-tundra-rust-700'
                  : 'border-transparent text-tundra-ink-500 hover:text-tundra-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* System info */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-tundra-ink">System information</h2>
            <InfoRow label="OS">{server.os} {server.os_version}</InfoRow>
            <InfoRow label="Arch">{server.arch}</InfoRow>
            <InfoRow label="Hostname" mono>
              <span className="flex items-center gap-1">
                {server.hostname}
                <CopyButton value={server.hostname} label="hostname" />
              </span>
            </InfoRow>
            <InfoRow label="Public IP" mono>
              {server.public_ip ? (
                <span className="flex items-center gap-1">
                  {server.public_ip}
                  <CopyButton value={server.public_ip} label="IP" />
                </span>
              ) : '—'}
            </InfoRow>
            <InfoRow label="Region">{server.region ?? '—'}</InfoRow>
            <InfoRow label="Added">{fmtDateTime(server.created_at)}</InfoRow>
            <InfoRow label="Last updated">{fmtDateTime(server.updated_at)}</InfoRow>
            {server.notes && (
              <div className="mt-3 border-t border-tundra-ink-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-tundra-ink-400 mb-1">Notes</p>
                <p className="text-sm text-tundra-ink-600 whitespace-pre-wrap">{server.notes}</p>
              </div>
            )}
          </div>

          {/* Agent info */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-tundra-ink">Agent</h2>
            <InfoRow label="Status">
              <StatusBadge status={server.status} />
            </InfoRow>
            <InfoRow label="Version">
              {server.agent_version
                ? <span className="rounded bg-tundra-ink-100 px-2 py-0.5 font-mono text-xs">v{server.agent_version}</span>
                : <span className="text-yellow-600 font-medium text-xs">not enrolled</span>}
            </InfoRow>
            <InfoRow label="Last heartbeat">
              <span className={isOffline ? 'text-red-600 font-medium' : ''}>
                {relTime(server.agent_last_seen_at)}
              </span>
            </InfoRow>
            <InfoRow label="Cert">
              {server.agent_cert_fingerprint ? (
                <span className="text-tundra-lichen-700 text-xs font-medium">● valid</span>
              ) : (
                <span className="text-tundra-ink-400 text-xs">none</span>
              )}
            </InfoRow>
            {server.agent_cert_fingerprint && (
              <div className="mt-3 border-t border-tundra-ink-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-tundra-ink-400 mb-1">
                  Certificate fingerprint
                  <CopyButton value={server.agent_cert_fingerprint} label="fingerprint" />
                </p>
                <code className="block rounded bg-tundra-ink-900 px-3 py-2 text-xs text-tundra-paper break-all font-mono">
                  {server.agent_cert_fingerprint}
                </code>
              </div>
            )}
            <InfoRow label="Server ID" mono>
              <span className="flex items-center gap-1 text-xs">
                {server.id.slice(0, 16)}…
                <CopyButton value={server.id} label="server ID" />
              </span>
            </InfoRow>
          </div>

          {/* Quick metrics summary */}
          {m && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-tundra-ink">Resource snapshot</h2>
                <span className="text-xs text-tundra-ink-400">Updated {relTime(m.refreshed_at)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className={`text-2xl font-bold tabular-nums ${m.cpu_used_pct >= 90 ? 'text-red-600' : m.cpu_used_pct >= 70 ? 'text-yellow-600' : 'text-tundra-ink'}`}>
                    {String(Math.round(m.cpu_used_pct))}%
                  </div>
                  <div className="text-xs text-tundra-ink-400 mt-0.5">CPU · {String(m.cpu_cores)} cores</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold tabular-nums ${pct(m.ram_used_mb, m.ram_total_mb) >= 90 ? 'text-red-600' : pct(m.ram_used_mb, m.ram_total_mb) >= 80 ? 'text-yellow-600' : 'text-tundra-ink'}`}>
                    {String(pct(m.ram_used_mb, m.ram_total_mb))}%
                  </div>
                  <div className="text-xs text-tundra-ink-400 mt-0.5">{String(m.ram_used_mb)} / {String(m.ram_total_mb)} MB</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold tabular-nums ${pct(m.disk_used_gb, m.disk_total_gb) >= 90 ? 'text-red-600' : pct(m.disk_used_gb, m.disk_total_gb) >= 75 ? 'text-yellow-600' : 'text-tundra-ink'}`}>
                    {String(pct(m.disk_used_gb, m.disk_total_gb))}%
                  </div>
                  <div className="text-xs text-tundra-ink-400 mt-0.5">{String(m.disk_used_gb)} / {String(m.disk_total_gb)} GB</div>
                </div>
              </div>
              <button
                onClick={() => { setTab('monitoring') }}
                className="mt-3 w-full rounded-lg border border-tundra-ink-200 py-1.5 text-xs text-tundra-aurora hover:bg-tundra-ink-50 transition-colors"
              >
                View full monitoring →
              </button>
            </div>
          )}

          {/* Maintenance */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-tundra-ink">Maintenance</h2>
              <Link
                to="/servers/$serverId/maintenance"
                params={{ serverId: server.id }}
                className="text-xs text-tundra-aurora hover:underline"
              >
                Configure →
              </Link>
            </div>
            {inMaintenance ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
                <p className="font-medium text-yellow-800">Maintenance window active</p>
                <p className="text-xs text-yellow-700 mt-1">
                  {fmtDateTime(server.maintenance_starts_at ?? '')} →{' '}
                  {fmtDateTime(server.maintenance_ends_at ?? '')}
                </p>
              </div>
            ) : server.maintenance_starts_at ? (
              <div className="rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-3 text-sm">
                <p className="font-medium text-tundra-ink-600">Scheduled</p>
                <p className="text-xs text-tundra-ink-400 mt-1">
                  {fmtDateTime(server.maintenance_starts_at)} →{' '}
                  {server.maintenance_ends_at ? fmtDateTime(server.maintenance_ends_at) : '?'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-tundra-ink-400">No maintenance window scheduled.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Monitoring ───────────────────────────────────────────────────────── */}
      {tab === 'monitoring' && (
        <div className="space-y-5">
          {!m ? (
            <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-10 text-center">
              <p className="text-sm font-medium text-tundra-ink-500">No metrics available</p>
              <p className="mt-1 text-xs text-tundra-ink-400">
                {isEnrolled ? 'Waiting for first metrics sample from agent.' : 'Enrol the agent to start collecting metrics.'}
              </p>
            </div>
          ) : (
            <>
              {/* Gauge row */}
              <div className="rounded-xl border border-tundra-ink-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-tundra-ink">Resource utilisation</h2>
                  <span className="text-xs text-tundra-ink-400">Updated {relTime(m.refreshed_at)} · 30s auto-refresh</span>
                </div>
                <div className="flex flex-wrap justify-around gap-6">
                  <GaugeRing value={Math.round(m.cpu_used_pct)} label="CPU" sublabel={`${String(m.cpu_cores)} core${m.cpu_cores !== 1 ? 's' : ''}`} />
                  <GaugeRing value={pct(m.ram_used_mb, m.ram_total_mb)} label="RAM" warn={80} crit={90}
                    sublabel={`${String(m.ram_used_mb)} / ${String(m.ram_total_mb)} MB`} />
                  <GaugeRing value={pct(m.disk_used_gb, m.disk_total_gb)} label="Disk" warn={75} crit={90}
                    sublabel={`${String(m.disk_used_gb)} / ${String(m.disk_total_gb)} GB`} />
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border-8 border-tundra-lichen bg-tundra-lichen-50">
                      <span className="text-lg font-bold text-tundra-lichen-700">{String(m.site_count)}</span>
                    </div>
                    <span className="text-xs font-medium text-tundra-ink-600">Sites</span>
                    <span className="text-xs text-tundra-ink-400">hosted</span>
                  </div>
                </div>
              </div>

              {/* Detailed breakdown */}
              <div className="grid gap-4 sm:grid-cols-3">
                {/* CPU */}
                <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">CPU</h3>
                  <div className={`text-3xl font-bold tabular-nums mb-1 ${m.cpu_used_pct >= 90 ? 'text-red-600' : m.cpu_used_pct >= 70 ? 'text-yellow-600' : 'text-tundra-ink'}`}>
                    {String(Math.round(m.cpu_used_pct))}%
                  </div>
                  <div className="h-2 rounded-full bg-tundra-ink-100 mb-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${m.cpu_used_pct >= 90 ? 'bg-red-400' : m.cpu_used_pct >= 70 ? 'bg-yellow-400' : 'bg-tundra-lichen'}`}
                      style={{ width: `${String(Math.min(m.cpu_used_pct, 100))}%` }} />
                  </div>
                  <div className="text-xs text-tundra-ink-500">{String(m.cpu_cores)} logical cores</div>
                </div>

                {/* RAM */}
                <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Memory</h3>
                  <div className={`text-3xl font-bold tabular-nums mb-1 ${pct(m.ram_used_mb, m.ram_total_mb) >= 90 ? 'text-red-600' : pct(m.ram_used_mb, m.ram_total_mb) >= 80 ? 'text-yellow-600' : 'text-tundra-ink'}`}>
                    {String(pct(m.ram_used_mb, m.ram_total_mb))}%
                  </div>
                  <div className="h-2 rounded-full bg-tundra-ink-100 mb-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct(m.ram_used_mb, m.ram_total_mb) >= 90 ? 'bg-red-400' : pct(m.ram_used_mb, m.ram_total_mb) >= 80 ? 'bg-yellow-400' : 'bg-tundra-lichen'}`}
                      style={{ width: `${String(pct(m.ram_used_mb, m.ram_total_mb))}%` }} />
                  </div>
                  <div className="text-xs text-tundra-ink-500">
                    {String(m.ram_used_mb)} MB used · {String(m.ram_total_mb - m.ram_used_mb)} MB free
                  </div>
                  <div className="text-xs text-tundra-ink-400 mt-0.5">Total: {String(m.ram_total_mb)} MB</div>
                </div>

                {/* Disk */}
                <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Disk</h3>
                  <div className={`text-3xl font-bold tabular-nums mb-1 ${pct(m.disk_used_gb, m.disk_total_gb) >= 90 ? 'text-red-600' : pct(m.disk_used_gb, m.disk_total_gb) >= 75 ? 'text-yellow-600' : 'text-tundra-ink'}`}>
                    {String(pct(m.disk_used_gb, m.disk_total_gb))}%
                  </div>
                  <div className="h-2 rounded-full bg-tundra-ink-100 mb-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct(m.disk_used_gb, m.disk_total_gb) >= 90 ? 'bg-red-400' : pct(m.disk_used_gb, m.disk_total_gb) >= 75 ? 'bg-yellow-400' : 'bg-tundra-lichen'}`}
                      style={{ width: `${String(pct(m.disk_used_gb, m.disk_total_gb))}%` }} />
                  </div>
                  <div className="text-xs text-tundra-ink-500">
                    {String(m.disk_used_gb)} GB used · {String(m.disk_total_gb - m.disk_used_gb)} GB free
                  </div>
                  <div className="text-xs text-tundra-ink-400 mt-0.5">Total: {String(m.disk_total_gb)} GB</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sites ────────────────────────────────────────────────────────────── */}
      {tab === 'sites' && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-tundra-ink-100 px-5 py-3">
            <span className="text-sm font-semibold text-tundra-ink">
              Sites hosted on {server.name}
              {m && <span className="ml-2 text-tundra-ink-400 font-normal">({String(m.site_count)} total)</span>}
            </span>
            <Link to="/sites/new" className="rounded-lg bg-tundra-lichen px-3 py-1 text-xs text-white hover:bg-tundra-lichen-600">
              + Create site
            </Link>
          </div>
          {sitesLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-tundra-ink-100" />
              ))}
            </div>
          ) : sites.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No sites hosted on this server yet.</p>
              <Link to="/sites/new" className="mt-3 inline-block text-sm text-tundra-aurora hover:underline">
                Create a site on this server →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50 text-xs">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-tundra-ink-500">Domain</th>
                  <th className="px-4 py-3 text-left font-semibold text-tundra-ink-500">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-tundra-ink-500">Document root</th>
                  <th className="px-4 py-3 text-left font-semibold text-tundra-ink-500">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-tundra-ink-500">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {sites.map((s) => (
                  <tr key={s.id} className="hover:bg-tundra-ink-50 group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link to="/sites/$siteId" params={{ siteId: s.id }}
                          className="font-medium text-tundra-aurora hover:underline">
                          {s.primary_domain}
                        </Link>
                        <a href={`https://${s.primary_domain}`} target="_blank" rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 text-tundra-ink-400 hover:text-tundra-aurora transition-opacity">
                          ↗
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-500">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400 max-w-[14rem] truncate">{s.document_root}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.status === 'active' ? 'bg-tundra-lichen-50 border-tundra-lichen-200 text-tundra-lichen-800' : 'bg-tundra-ink-50 border-tundra-ink-200 text-tundra-ink-600'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-400">
                      {fmtDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/sites/$siteId" params={{ siteId: s.id }}
                        className="text-xs text-tundra-aurora hover:underline opacity-0 group-hover:opacity-100">
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Edit ─────────────────────────────────────────────────────────────── */}
      {tab === 'edit' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Editable fields */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 space-y-5">
            <h2 className="text-sm font-semibold text-tundra-ink">Edit server details</h2>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Display name</span>
              <input
                value={editName}
                onChange={(e) => { setEditOverrides((p) => ({ ...p, name: e.target.value })) }}
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                placeholder="web-01"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Region <span className="font-normal text-tundra-ink-400">(optional)</span></span>
              <input
                value={editRegion}
                onChange={(e) => { setEditOverrides((p) => ({ ...p, region: e.target.value })) }}
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                placeholder="eu-central-1, us-east-2, …"
              />
              <p className="text-xs text-tundra-ink-400">Used for grouping servers on the fleet view.</p>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Notes <span className="font-normal text-tundra-ink-400">(optional)</span></span>
              <textarea
                value={editNotes}
                onChange={(e) => { setEditOverrides((p) => ({ ...p, notes: e.target.value })) }}
                rows={4}
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen resize-y"
                placeholder="SSH key location, purpose, ticket links, known issues…"
              />
            </label>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  updateMutation.mutate({
                    name: editName || undefined,
                    region: editOverrides.region !== undefined ? (editRegion || null) : undefined,
                    notes: editOverrides.notes !== undefined ? (editNotes || null) : undefined,
                  })
                }}
                disabled={updateMutation.isPending || !editName.trim()}
                className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => { setEditOverrides({}) }}
                className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>

          {/* Read-only info */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-tundra-ink">Read-only fields</h2>
            <InfoRow label="Hostname" mono>
              <span className="flex items-center gap-1">
                {server.hostname}
                <CopyButton value={server.hostname} label="hostname" />
              </span>
            </InfoRow>
            <InfoRow label="Public IP" mono>
              {server.public_ip ? (
                <span className="flex items-center gap-1">
                  {server.public_ip}
                  <CopyButton value={server.public_ip} label="IP" />
                </span>
              ) : '—'}
            </InfoRow>
            <InfoRow label="OS">{server.os} {server.os_version}</InfoRow>
            <InfoRow label="Arch">{server.arch}</InfoRow>
            <InfoRow label="Server ID" mono>
              <span className="flex items-center gap-1 text-xs">
                {server.id}
                <CopyButton value={server.id} label="ID" />
              </span>
            </InfoRow>
            <div className="mt-4 rounded-lg border border-tundra-ink-100 bg-tundra-ink-50 p-3 text-xs text-tundra-ink-500">
              Hostname, OS, arch, and IP are set by the agent during enrolment and cannot be changed from the panel. To update them, re-enrol the agent.
            </div>
          </div>
        </div>
      )}

      {/* ── Firewall ─────────────────────────────────────────────────────────── */}
      {tab === 'firewall' && <FirewallTab serverId={server.id} />}

      {/* ── Updates ──────────────────────────────────────────────────────────── */}
      {tab === 'updates' && <UpdatesTab serverId={server.id} />}

      {/* ── Processes ────────────────────────────────────────────────────────── */}
      {tab === 'processes' && <ProcessesTab serverId={server.id} />}

      {/* ── Terminal ─────────────────────────────────────────────────────────── */}
      {tab === 'terminal' && <TerminalTab serverId={server.id} />}

      {/* ── Danger ───────────────────────────────────────────────────────────── */}
      {tab === 'danger' && (
        <div className="space-y-4 max-w-xl">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="mb-1 text-sm font-semibold text-red-700">Delete server</h2>
            <p className="mb-4 text-sm text-tundra-ink-600">
              Permanently removes this server and all its records. The agent process (if running) will lose its connection. Sites are NOT deleted — they become orphaned.
              <strong className="block mt-1 text-tundra-ink">This cannot be undone.</strong>
            </p>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-tundra-ink-700">
                Type <strong className="font-mono">{server.name}</strong> to confirm
              </span>
              <input
                value={deleteConfirm}
                onChange={(e) => { setDeleteConfirm(e.target.value) }}
                className="max-w-xs rounded-lg border border-tundra-ink-200 px-3 py-2 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                placeholder={server.name}
              />
            </label>
            <button
              onClick={() => { deleteMutation.mutate() }}
              disabled={deleteConfirm !== server.name || deleteMutation.isPending}
              className="mt-4 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete server permanently'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Firewall tab ─────────────────────────────────────────────────────────────

interface FwRule {
  id: string; direction: string; action: string; protocol: string
  port: string | null; from_ip: string | null; comment: string | null; enabled: boolean
}

function FirewallTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['server-firewall', serverId],
    queryFn: () => api<{ data: FwRule[] }>(`/servers/${serverId}/firewall/rules`),
    refetchInterval: 15_000,
  })
  const { data: bansData } = useQuery({
    queryKey: ['server-bans', serverId],
    queryFn: () => api<{ data: { ip: string; reason: string; banned_at: string }[] }>(`/servers/${serverId}/firewall/bans`),
    refetchInterval: 30_000,
  })

  const [showAdd, setShowAdd] = useState(false)
  const [dir, setDir] = useState('in')
  const [action, setAction] = useState('allow')
  const [proto, setProto] = useState('tcp')
  const [port, setPort] = useState('')
  const [fromIp, setFromIp] = useState('')
  const [comment, setComment] = useState('')

  const addMut = useMutation({
    mutationFn: () => api(`/servers/${serverId}/firewall/rules`, {
      method: 'POST',
      body: { direction: dir, action, protocol: proto, port: port || null, from_ip: fromIp || null, comment: comment || null },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['server-firewall', serverId] })
      setShowAdd(false); setPort(''); setFromIp(''); setComment('')
      toast.success('Rule added')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const delMut = useMutation({
    mutationFn: (id: string) => api(`/servers/${serverId}/firewall/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['server-firewall', serverId] }); toast.success('Rule removed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const unbanMut = useMutation({
    mutationFn: (ip: string) => api(`/servers/${serverId}/firewall/bans/${encodeURIComponent(ip)}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['server-bans', serverId] }); toast.success('IP unbanned') },
  })

  const rules = data?.data ?? []
  const bans = bansData?.data ?? []

  const INPUT = 'rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20'
  const SEL = `${INPUT} bg-white`

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Rules table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-tundra-ink">Firewall rules</h3>
            <p className="text-xs text-tundra-ink-400 mt-0.5">Managed via nftables/UFW on the server.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { void refetch() }}
              className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
              Refresh
            </button>
            <button onClick={() => { setShowAdd(true) }}
              className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-xs text-white hover:bg-tundra-lichen-600 transition-colors">
              + Add rule
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="mb-4 rounded-xl border border-tundra-lichen-200 bg-tundra-lichen-50 p-4">
            <p className="text-xs font-semibold text-tundra-lichen-800 mb-3">New rule</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs text-tundra-ink-500 mb-1">Direction</label>
                <select value={dir} onChange={(e) => { setDir(e.target.value) }} className={SEL}>
                  <option value="in">Inbound</option>
                  <option value="out">Outbound</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-tundra-ink-500 mb-1">Action</label>
                <select value={action} onChange={(e) => { setAction(e.target.value) }} className={SEL}>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-tundra-ink-500 mb-1">Protocol</label>
                <select value={proto} onChange={(e) => { setProto(e.target.value) }} className={SEL}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="any">Any</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-tundra-ink-500 mb-1">Port (or range)</label>
                <input value={port} onChange={(e) => { setPort(e.target.value) }} placeholder="80, 443, 8080:8090" className={`${INPUT} w-full`} />
              </div>
              <div>
                <label className="block text-xs text-tundra-ink-500 mb-1">From IP / CIDR</label>
                <input value={fromIp} onChange={(e) => { setFromIp(e.target.value) }} placeholder="0.0.0.0/0" className={`${INPUT} w-full`} />
              </div>
              <div>
                <label className="block text-xs text-tundra-ink-500 mb-1">Comment</label>
                <input value={comment} onChange={(e) => { setComment(e.target.value) }} placeholder="Optional note" className={`${INPUT} w-full`} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { addMut.mutate() }} disabled={addMut.isPending}
                className="rounded-lg bg-tundra-lichen px-4 py-2 text-xs text-white hover:bg-tundra-lichen-600 disabled:opacity-40">
                {addMut.isPending ? 'Adding…' : 'Add rule'}
              </button>
              <button onClick={() => { setShowAdd(false) }}
                className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-xs text-tundra-ink-500 hover:bg-tundra-ink-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-tundra-ink-200 overflow-hidden">
          {isLoading ? (
            <div className="h-32 animate-pulse bg-tundra-ink-50" />
          ) : rules.length === 0 ? (
            <div className="py-10 text-center text-sm text-tundra-ink-400">No rules returned from agent.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50 border-b border-tundra-ink-100">
                <tr>
                  {['Dir', 'Action', 'Proto', 'Port', 'From', 'Comment', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-tundra-ink-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100 bg-white">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono ${r.direction === 'in' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {r.direction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${r.action === 'allow' ? 'bg-tundra-lichen-50 text-tundra-lichen-700' : 'bg-tundra-rust-50 text-tundra-rust-700'}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tundra-ink-500">{r.protocol}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.port ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tundra-ink-500">{r.from_ip ?? 'any'}</td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{r.comment ?? ''}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => { delMut.mutate(r.id) }}
                        className="text-xs text-tundra-ink-300 hover:text-tundra-rust transition-colors">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Banned IPs */}
      <div>
        <h3 className="text-sm font-semibold text-tundra-ink mb-1">Banned IPs <span className="ml-1 text-xs font-normal text-tundra-ink-400">(Fail2ban)</span></h3>
        <div className="rounded-xl border border-tundra-ink-200 overflow-hidden">
          {bans.length === 0 ? (
            <div className="py-8 text-center text-sm text-tundra-ink-400">No banned IPs.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50 border-b border-tundra-ink-100">
                <tr>
                  {['IP', 'Reason', 'Banned at', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-tundra-ink-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100 bg-white">
                {bans.map((b) => (
                  <tr key={b.ip} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-2.5 font-mono text-xs">{b.ip}</td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-500">{b.reason}</td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{b.banned_at}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => { unbanMut.mutate(b.ip) }}
                        className="text-xs text-tundra-lichen hover:underline">Unban</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Updates tab ──────────────────────────────────────────────────────────────

interface Package { name: string; current_version: string; new_version: string; size_kb: number | null; source: string }

function UpdatesTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['server-packages', serverId],
    queryFn: () => api<{ data: Package[]; last_checked: string | null }>(`/servers/${serverId}/packages`),
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [secOnly, setSecOnly] = useState(false)

  const applyMut = useMutation({
    mutationFn: () => api(`/servers/${serverId}/packages/upgrade`, {
      method: 'POST',
      body: { packages: selected.size > 0 ? [...selected] : null, security_only: secOnly },
    }),
    onSuccess: (r: { job_id: string; message: string }) => {
      toast.success(r.message)
      void qc.invalidateQueries({ queryKey: ['server-packages', serverId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const pkgs = data?.data ?? []
  const secCount = pkgs.filter((p) => p.source === 'security').length

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-tundra-ink">Available updates</h3>
          <p className="text-xs text-tundra-ink-400 mt-0.5">
            {data?.last_checked ? `Last checked: ${data.last_checked}` : 'Click Refresh to check for updates.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {secCount > 0 && (
            <span className="rounded-full bg-tundra-rust-50 border border-tundra-rust-200 px-2 py-0.5 text-xs font-medium text-tundra-rust-700">
              {secCount} security
            </span>
          )}
          <button onClick={() => { void refetch() }} disabled={isFetching}
            className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors">
            {isFetching ? 'Checking…' : 'Refresh'}
          </button>
          {pkgs.length > 0 && (
            <button onClick={() => { applyMut.mutate() }} disabled={applyMut.isPending}
              className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-xs text-white hover:bg-tundra-lichen-600 disabled:opacity-40 transition-colors">
              {applyMut.isPending ? 'Applying…' : selected.size > 0 ? `Apply (${selected.size})` : 'Apply all'}
            </button>
          )}
        </div>
      </div>

      {pkgs.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-tundra-ink-500 cursor-pointer">
          <input type="checkbox" checked={secOnly} onChange={(e) => { setSecOnly(e.target.checked) }} />
          Security updates only
        </label>
      )}

      <div className="rounded-xl border border-tundra-ink-200 overflow-hidden">
        {isLoading ? (
          <div className="h-32 animate-pulse bg-tundra-ink-50" />
        ) : pkgs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-tundra-ink">System is up to date</p>
            <p className="text-xs text-tundra-ink-400 mt-1">No packages available for upgrade.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50 border-b border-tundra-ink-100">
              <tr>
                <th className="px-4 py-2.5 w-8">
                  <input type="checkbox"
                    checked={selected.size === pkgs.length}
                    onChange={(e) => { setSelected(e.target.checked ? new Set(pkgs.map((p) => p.name)) : new Set()) }} />
                </th>
                {['Package', 'Current', 'Available', 'Source', 'Size'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-tundra-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100 bg-white">
              {pkgs.map((p) => (
                <tr key={p.name} className={`hover:bg-tundra-ink-50 ${selected.has(p.name) ? 'bg-tundra-lichen-50' : ''}`}>
                  <td className="px-4 py-2.5 w-8">
                    <input type="checkbox" checked={selected.has(p.name)}
                      onChange={(e) => {
                        const s = new Set(selected)
                        if (e.target.checked) s.add(p.name); else s.delete(p.name)
                        setSelected(s)
                      }} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-tundra-ink-400">{p.current_version}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-tundra-lichen-700">{p.new_version}</td>
                  <td className="px-4 py-2.5">
                    {p.source === 'security' ? (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-tundra-rust-50 text-tundra-rust-700">security</span>
                    ) : (
                      <span className="text-xs text-tundra-ink-400">{p.source}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{p.size_kb ? `${p.size_kb} KB` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Processes tab ────────────────────────────────────────────────────────────

interface Proc { pid: number; user: string; cpu_pct: number; mem_pct: number; mem_rss_kb: number; state: string; command: string }

function ProcessesTab({ serverId }: { serverId: string }) {
  const [sort, setSort] = useState<'cpu' | 'mem' | 'pid'>('cpu')
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['server-processes', serverId, sort],
    queryFn: () => api<{ data: Proc[] }>(`/servers/${serverId}/processes?sort=${sort}&limit=50`),
    refetchInterval: 5_000,
  })

  const killMut = useMutation({
    mutationFn: ({ pid, signal }: { pid: number; signal: string }) =>
      api(`/servers/${serverId}/processes/${pid}`, { method: 'DELETE', body: { signal } }),
    onSuccess: () => { void refetch(); toast.success('Signal sent') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const procs = data?.data ?? []

  function stateColor(s: string) {
    if (s === 'R') return 'text-tundra-lichen-700 bg-tundra-lichen-50'
    if (s === 'D') return 'text-tundra-rust-700 bg-tundra-rust-50'
    if (s === 'Z') return 'text-red-700 bg-red-50'
    return 'text-tundra-ink-400 bg-tundra-ink-50'
  }

  const SortBtn = ({ id, label }: { id: 'cpu' | 'mem' | 'pid'; label: string }) => (
    <button onClick={() => { setSort(id) }}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${sort === id ? 'bg-tundra-lichen text-white' : 'border border-tundra-ink-200 text-tundra-ink-500 hover:bg-tundra-ink-50'}`}>
      {label}
    </button>
  )

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-tundra-ink">Running processes</h3>
          <p className="text-xs text-tundra-ink-400 mt-0.5">Top 50. Auto-refreshes every 5 s.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-tundra-ink-400">Sort by</span>
          <SortBtn id="cpu" label="CPU %" />
          <SortBtn id="mem" label="Mem %" />
          <SortBtn id="pid" label="PID" />
          <button onClick={() => { void refetch() }} disabled={isFetching}
            className="ml-2 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40">
            {isFetching ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-tundra-ink-200 overflow-hidden">
        {isLoading ? (
          <div className="h-40 animate-pulse bg-tundra-ink-50" />
        ) : procs.length === 0 ? (
          <div className="py-16 text-center text-sm text-tundra-ink-400">
            No process data — agent must be connected.
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="bg-tundra-ink-50 border-b border-tundra-ink-100">
              <tr>
                {['PID', 'User', 'State', 'CPU%', 'Mem%', 'RSS', 'Command', ''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-tundra-ink-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100 bg-white">
              {procs.map((p) => (
                <tr key={p.pid} className="hover:bg-tundra-ink-50 group">
                  <td className="px-3 py-2">{p.pid}</td>
                  <td className="px-3 py-2 text-tundra-ink-500">{p.user}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1 py-0.5 ${stateColor(p.state)}`}>{p.state}</span>
                  </td>
                  <td className={`px-3 py-2 font-bold ${p.cpu_pct >= 50 ? 'text-tundra-rust' : p.cpu_pct >= 20 ? 'text-yellow-600' : ''}`}>
                    {p.cpu_pct.toFixed(1)}
                  </td>
                  <td className={`px-3 py-2 ${p.mem_pct >= 30 ? 'text-tundra-rust font-bold' : ''}`}>
                    {p.mem_pct.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-tundra-ink-400">
                    {p.mem_rss_kb > 1024 ? `${Math.round(p.mem_rss_kb / 1024)} M` : `${p.mem_rss_kb} K`}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate text-tundra-ink">{p.command}</td>
                  <td className="px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { killMut.mutate({ pid: p.pid, signal: 'TERM' }) }}
                      className="rounded px-2 py-0.5 text-xs bg-tundra-rust-50 text-tundra-rust-700 hover:bg-tundra-rust-100">
                      Kill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Terminal tab ─────────────────────────────────────────────────────────────

function TerminalTab({ serverId }: { serverId: string }) {
  const termRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let term: import('@xterm/xterm').Terminal
    let fitAddon: import('@xterm/addon-fit').FitAddon

    async function boot() {
      if (!termRef.current) return
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('@xterm/xterm/css/xterm.css')

      term = new Terminal({
        theme: { background: '#1C1F1A', foreground: '#E8E5DF', cursor: '#8DAE7D' },
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
      })
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRef.current)
      fitAddon.fit()

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/v1/servers/${serverId}/terminal`)
      wsRef.current = ws

      ws.onopen = () => { setConnected(true); setError(null) }
      ws.onclose = () => { setConnected(false); term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n') }
      ws.onerror = () => { setError('WebSocket connection failed.'); setConnected(false) }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') term.write(ev.data)
        else term.write(new Uint8Array(ev.data as ArrayBuffer))
      }

      term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(data) })

      const ro = new ResizeObserver(() => { fitAddon.fit() })
      ro.observe(termRef.current)

      return () => { ws.close(); term.dispose(); ro.disconnect() }
    }

    void boot()
    return () => { wsRef.current?.close() }
  }, [serverId])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-tundra-ink">SSH Terminal</h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
          connected ? 'bg-tundra-lichen-50 text-tundra-lichen-700' : 'bg-tundra-ink-100 text-tundra-ink-400'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
          {connected ? 'Connected' : 'Connecting…'}
        </span>
        {error && <span className="text-xs text-tundra-rust">{error}</span>}
      </div>
      <div
        ref={termRef}
        className="rounded-xl overflow-hidden border border-tundra-ink-800"
        style={{ height: 480, background: '#1C1F1A' }}
      />
      <p className="text-xs text-tundra-ink-400">
        Real SSH execution requires the tundra-agent to be connected. Currently running in stub mode.
      </p>
    </div>
  )
}
