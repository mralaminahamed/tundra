import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Server, ServerMetricsState, Site, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers/$serverId')({
  component: ServerDetailPage,
})

type Tab = 'overview' | 'sites' | 'edit' | 'danger'

function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function MetricBar({ label, value, extra }: { label: string; value: number; extra?: string }) {
  const color = value >= 90 ? 'bg-tundra-rust' : value >= 70 ? 'bg-yellow-400' : 'bg-tundra-lichen'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-tundra-ink-700">{label}</span>
        <span className="text-tundra-ink-500">{extra ?? `${String(value)}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-tundra-ink-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${String(Math.min(value, 100))}%` }} />
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: Server['status'] }) {
  const map: Record<string, { dot: string; label: string }> = {
    active:       { dot: 'bg-tundra-lichen',          label: 'text-tundra-lichen-800' },
    provisioning: { dot: 'bg-tundra-aurora animate-pulse', label: 'text-tundra-aurora-800' },
    degraded:     { dot: 'bg-yellow-400',              label: 'text-yellow-800' },
    offline:      { dot: 'bg-tundra-ink-400',          label: 'text-tundra-ink-600' },
    disabled:     { dot: 'bg-tundra-ink-300',          label: 'text-tundra-ink-400' },
  }
  const v = map[status] ?? { dot: 'bg-tundra-ink-300', label: 'text-tundra-ink-500' }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${v.dot}`} />
      <span className={`text-xs font-medium capitalize ${v.label}`}>{status}</span>
    </span>
  )
}

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${String(Math.floor(s))}s ago`
  if (s < 3600) return `${String(Math.floor(s / 60))}m ago`
  if (s < 86400) return `${String(Math.floor(s / 3600))}h ago`
  return `${String(Math.floor(s / 86400))}d ago`
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-tundra-ink-400">{label}</dt>
      <dd className="mt-1 text-sm text-tundra-ink">{value ?? <span className="text-tundra-ink-400">—</span>}</dd>
    </div>
  )
}

function ServerDetailPage() {
  const { serverId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // Edit form: track only what the user has overridden; fall back to server values
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

  const { data: sitesData } = useQuery({
    queryKey: ['sites', 'by-server', serverId],
    queryFn: () => api<ListResponse<Site>>(`/sites?server_id=${serverId}`),
    enabled: tab === 'sites' && !!server,
  })

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/servers/${serverId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['servers', serverId] })
      void queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Server updated')
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
    <div className="space-y-4 max-w-4xl">
      <div className="h-8 w-48 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-48 animate-pulse rounded-lg bg-tundra-ink-100" />
    </div>
  )
  if (isError || !server) return <p className="text-sm text-tundra-rust">Server not found.</p>

  const m = metricsData
  const sites = sitesData?.data ?? []

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sites', label: `Sites${m ? ` (${String(m.site_count)})` : ''}` },
    { id: 'edit', label: 'Edit' },
    { id: 'danger', label: 'Danger zone' },
  ]

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-tundra-ink-400">
        <Link to="/servers" className="hover:text-tundra-ink">Servers</Link>
        <span>/</span>
        <span className="text-tundra-ink">{server.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{server.name}</h1>
            <StatusDot status={server.status} />
          </div>
          <p className="mt-1 text-sm text-tundra-ink-500">
            {server.hostname}
            {server.public_ip && <span className="ml-2 text-tundra-ink-400">· {server.public_ip}</span>}
            {server.region && <span className="ml-2 text-tundra-ink-400">· {server.region}</span>}
          </p>
        </div>
        <button
          onClick={() => { void refetchMetrics() }}
          disabled={metricsFetching}
          className="flex items-center gap-1.5 rounded border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40"
          title="Refresh metrics"
        >
          <svg className={`h-3.5 w-3.5 ${metricsFetching ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-tundra-ink-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
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

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Metrics */}
          {m && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-tundra-ink-600">Resource usage</h2>
                <span className="text-xs text-tundra-ink-400">Updated {relTime(m.refreshed_at)}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricBar label="CPU" value={Math.round(m.cpu_used_pct)}
                  extra={`${String(Math.round(m.cpu_used_pct))}% · ${String(m.cpu_cores)} core${m.cpu_cores !== 1 ? 's' : ''}`} />
                <MetricBar label="RAM" value={pct(m.ram_used_mb, m.ram_total_mb)}
                  extra={`${String(m.ram_used_mb)} / ${String(m.ram_total_mb)} MB`} />
                <MetricBar label="Disk" value={pct(m.disk_used_gb, m.disk_total_gb)}
                  extra={`${String(m.disk_used_gb)} / ${String(m.disk_total_gb)} GB`} />
              </div>
            </div>
          )}
          {!m && (
            <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-5 text-sm text-tundra-ink-400 text-center">
              No metrics yet — agent may not be connected.
            </div>
          )}

          {/* System info */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-tundra-ink-600">System</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <Field label="OS" value={`${server.os} ${server.os_version}`} />
              <Field label="Arch" value={server.arch} />
              <Field label="Region" value={server.region} />
              <Field label="Public IP" value={server.public_ip} />
              <Field label="Agent version" value={server.agent_version ?? 'not enrolled'} />
              <Field label="Last seen" value={relTime(server.agent_last_seen_at)} />
              <Field label="Added" value={new Date(server.created_at).toLocaleDateString()} />
              <Field label="Updated" value={new Date(server.updated_at).toLocaleDateString()} />
            </dl>
            {server.notes && (
              <div className="mt-4 border-t border-tundra-ink-100 pt-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-tundra-ink-400">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-tundra-ink-600">{server.notes}</dd>
              </div>
            )}
          </div>

          {/* Agent cert */}
          {server.agent_cert_fingerprint && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold text-tundra-ink-600">Agent certificate fingerprint</h2>
              <code className="block rounded bg-tundra-ink-50 px-3 py-2 text-xs font-mono text-tundra-ink-700 break-all select-all">
                {server.agent_cert_fingerprint}
              </code>
            </div>
          )}

          {/* Maintenance */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-tundra-ink-600">Maintenance</h2>
              <a
                href={`/servers/${server.id}/maintenance`}
                className="text-xs text-tundra-aurora hover:underline"
              >
                Schedule →
              </a>
            </div>
            {server.maintenance_starts_at && server.maintenance_ends_at ? (
              <p className="mt-2 text-sm text-tundra-ink-600">
                <span className="font-medium text-yellow-700">Window scheduled:</span>{' '}
                {new Date(server.maintenance_starts_at).toLocaleString()} →{' '}
                {new Date(server.maintenance_ends_at).toLocaleString()}
              </p>
            ) : (
              <p className="mt-2 text-sm text-tundra-ink-400">No maintenance window scheduled.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Sites ── */}
      {tab === 'sites' && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          {sites.length === 0 ? (
            <div className="py-12 text-center text-sm text-tundra-ink-400">
              No sites on this server.{' '}
              <Link to="/sites/new" className="text-tundra-aurora hover:underline">Create one →</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50 text-xs">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-tundra-ink-500">Domain</th>
                  <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Document root</th>
                  <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-tundra-ink-500">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {sites.map((s) => (
                  <tr key={s.id} className="hover:bg-tundra-ink-50">
                    <td className="px-5 py-3">
                      <Link to="/sites/$siteId" params={{ siteId: s.id }}
                        className="font-medium text-tundra-aurora hover:underline">
                        {s.primary_domain}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-500">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400 max-w-[14rem] truncate">{s.document_root}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.status === 'active' ? 'bg-tundra-lichen-100 text-tundra-lichen-800' : 'bg-tundra-ink-100 text-tundra-ink-600'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-400">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Edit ── */}
      {tab === 'edit' && (() => {
        const editName = editOverrides.name ?? server.name
        const editRegion = editOverrides.region ?? (server.region ?? '')
        const editNotes = editOverrides.notes ?? (server.notes ?? '')
        return (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-6 max-w-xl space-y-5">
          <h2 className="text-base font-semibold text-tundra-ink">Edit server details</h2>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Display name</span>
            <input
              value={editName}
              onChange={(e) => { setEditOverrides((p) => ({ ...p, name: e.target.value })) }}
              className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
              placeholder="web-01"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">
              Region <span className="font-normal text-tundra-ink-400">(optional)</span>
            </span>
            <input
              value={editRegion}
              onChange={(e) => { setEditOverrides((p) => ({ ...p, region: e.target.value })) }}
              className="rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
              placeholder="eu-central"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">
              Notes <span className="font-normal text-tundra-ink-400">(optional)</span>
            </span>
            <textarea
              value={editNotes}
              onChange={(e) => { setEditOverrides((p) => ({ ...p, notes: e.target.value })) }}
              rows={3}
              className="rounded border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen resize-y"
              placeholder="Any notes about this server…"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button
              onClick={() => {
                updateMutation.mutate({
                  name: editName || undefined,
                  region: editRegion !== '' ? editRegion : null,
                  notes: editNotes !== '' ? editNotes : null,
                })
              }}
              disabled={updateMutation.isPending || !editName.trim()}
              className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              onClick={() => { setEditOverrides({}) }}
              className="rounded border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50"
            >
              Reset
            </button>
          </div>

          {/* Read-only fields */}
          <div className="border-t border-tundra-ink-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Read-only</h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Field label="Hostname" value={<span className="font-mono text-xs">{server.hostname}</span>} />
              <Field label="OS" value={server.os} />
              <Field label="Arch" value={server.arch} />
              <Field label="ID" value={<span className="font-mono text-xs">{server.id}</span>} />
            </dl>
          </div>
        </div>
        )
      })()}

      {/* ── Danger zone ── */}
      {tab === 'danger' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-tundra-rust-200 bg-tundra-rust-50 p-6">
            <h2 className="mb-1 text-sm font-semibold text-tundra-rust">Delete server</h2>
            <p className="mb-4 text-sm text-tundra-ink-600">
              Permanently removes this server record. The agent (if installed) will continue running but lose its connection.
              This cannot be undone.
            </p>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-tundra-ink-700">
                Type <strong>{server.name}</strong> to confirm deletion
              </span>
              <input
                value={deleteConfirm}
                onChange={(e) => { setDeleteConfirm(e.target.value) }}
                className="max-w-xs rounded border border-tundra-ink-200 px-3 py-2 focus:border-tundra-rust focus:outline-none focus:ring-1 focus:ring-tundra-rust"
                placeholder={server.name}
              />
            </label>
            <button
              onClick={() => { deleteMutation.mutate() }}
              disabled={deleteConfirm !== server.name || deleteMutation.isPending}
              className="mt-4 rounded bg-tundra-rust px-4 py-2 text-sm text-white hover:bg-tundra-rust-700 disabled:opacity-40"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete server'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
