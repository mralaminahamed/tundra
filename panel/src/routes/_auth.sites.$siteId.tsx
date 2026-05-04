import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Daemon, Deployment, ListResponse, ScheduledTask, Site, Server } from '@/lib/api-types'
import { resolveBadge } from '@/lib/source-badge'

export const Route = createFileRoute('/_auth/sites/$siteId')({
  component: SiteDetailPage,
})

// ── Sub-components ─────────────────────────────────────────────────────────────

function SourceBadge({ site, enabledPlugins }: { site: Site; enabledPlugins: string[] }) {
  const m = resolveBadge(site, enabledPlugins)
  if (!m) return null
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  )
}

function StatusBadge({ status }: { status: Site['status'] }) {
  const map: Record<string, string> = {
    active:       'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
    provisioning: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
    suspended:    'border-yellow-300 bg-yellow-50 text-yellow-800',
    migrating:    'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700',
    archived:     'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400',
  }
  const pulse = status === 'provisioning' || status === 'migrating'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${map[status] ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === 'active' ? 'bg-tundra-lichen' : status === 'suspended' ? 'bg-yellow-400' : status === 'archived' ? 'bg-tundra-ink-300' : 'bg-tundra-aurora'
      } ${pulse ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

function DeployStatusBadge({ status }: { status: Deployment['status'] }) {
  const map: Record<string, string> = {
    succeeded: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    failed:    'bg-red-100 text-red-800',
    running:   'bg-tundra-aurora-100 text-tundra-aurora-800',
    queued:    'bg-tundra-ink-100 text-tundra-ink-500',
    cancelled: 'bg-tundra-ink-100 text-tundra-ink-400',
  }
  const pulse = status === 'running' || status === 'queued'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}>
      {pulse && <span className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'bg-tundra-aurora animate-pulse' : 'bg-tundra-ink-300 animate-pulse'}`} />}
      {status}
    </span>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-tundra-ink-100 last:border-0">
      <span className="text-sm text-tundra-ink-400 shrink-0">{label}</span>
      <span className="text-sm text-tundra-ink font-medium text-right">{children}</span>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { toast.success(`${label} copied`) }) }}
      className="ml-1.5 rounded p-0.5 text-tundra-ink-300 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors"
      title={`Copy ${label}`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7.414A2 2 0 0 0 11.414 6L8 2.586A2 2 0 0 0 6.586 2H4Zm0 1.5h2V6a1 1 0 0 0 1 1h2.5V12a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Zm3.5.621L9.879 6.5H8a.5.5 0 0 1-.5-.5V4.121Z"/>
      </svg>
    </button>
  )
}

const TABS = ['Overview', 'Deployments', 'Daemons', 'Scheduled Tasks', 'Edit', 'Danger'] as const
type Tab = typeof TABS[number]

// ── Main page ──────────────────────────────────────────────────────────────────

function SiteDetailPage() {
  const { siteId } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('Overview')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [editOverrides, setEditOverrides] = useState<Partial<{ name: string; primary_domain: string }>>({})
  const [triggerSource, setTriggerSource] = useState('')

  const { data: site, isLoading } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: pluginsNav = [] } = useQuery<{ plugin_id: string; state: string }[]>({
    queryKey: ['plugins-nav'],
    queryFn: () =>
      fetch('/api/v1/plugins').then((r) => r.json()).then((r: { data: { plugin_id: string; state: string }[] }) => r.data),
    staleTime: 30_000,
  })
  const enabledPluginIds = pluginsNav.filter((p) => p.state === 'enabled').map((p) => p.plugin_id)

  const { data: deploys, isLoading: deploysLoading } = useQuery({
    queryKey: ['sites', siteId, 'deployments'],
    queryFn: () => api<ListResponse<Deployment>>(`/sites/${siteId}/deployments`),
    enabled: tab === 'Deployments' || tab === 'Overview',
    refetchInterval: tab === 'Deployments' ? 8000 : false,
  })

  const { data: daemons, isLoading: daemonsLoading } = useQuery({
    queryKey: ['sites', siteId, 'daemons'],
    queryFn: () => api<ListResponse<Daemon>>(`/sites/${siteId}/daemons`),
    enabled: tab === 'Daemons',
  })

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['sites', siteId, 'scheduled-tasks'],
    queryFn: () => api<ListResponse<ScheduledTask>>(`/sites/${siteId}/scheduled-tasks`),
    enabled: tab === 'Scheduled Tasks',
  })

  const serverMap = new Map<string, Server>((serversData?.data ?? []).map((s) => [s.id, s]))

  const triggerMutation = useMutation({
    mutationFn: (body: { trigger: string; source_ref?: string }) =>
      api(`/sites/${siteId}/deployments`, { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'deployments'] })
      toast.success('Deployment triggered')
      setTriggerSource('')
      setTab('Deployments')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Trigger failed'),
  })

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/sites/${siteId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId] })
      void queryClient.invalidateQueries({ queryKey: ['sites'] })
      toast.success('Site updated')
      setEditOverrides({})
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api(`/sites/${siteId}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.href = '/sites/' },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  if (isLoading) return (
    <div className="max-w-4xl space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-8 w-72 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-48 animate-pulse rounded-xl bg-tundra-ink-100" />
    </div>
  )
  if (!site) return <p className="text-sm text-tundra-rust">Site not found.</p>

  const server = serverMap.get(site.server_id)

  const editName   = editOverrides.name          ?? site.name
  const editDomain = editOverrides.primary_domain ?? site.primary_domain
  const isEditDirty = editOverrides.name !== undefined || editOverrides.primary_domain !== undefined

  const latestDeploy = deploys?.data[0]

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-tundra-ink-400">
        <Link to="/sites/" className="hover:text-tundra-aurora">Sites</Link>
        <span>/</span>
        <span className="text-tundra-ink">{site.primary_domain}</span>
      </nav>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">{site.primary_domain}</h1>
            <StatusBadge status={site.status} />
          </div>
          <p className="mt-0.5 text-sm text-tundra-ink-400">{site.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`https://${site.primary_domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-600 hover:border-tundra-lichen hover:text-tundra-lichen transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" />
              <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 14 21 3" strokeLinecap="round" />
            </svg>
            Visit site
          </a>
          <button
            type="button"
            onClick={() => { triggerMutation.mutate({ trigger: 'manual' }) }}
            disabled={triggerMutation.isPending}
            className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
          >
            {triggerMutation.isPending ? 'Deploying…' : 'Deploy now'}
          </button>
        </div>
      </div>

      {/* Suspended banner */}
      {site.status === 'suspended' && (
        <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3 flex items-center gap-3 text-sm text-yellow-800">
          <span className="h-2 w-2 rounded-full bg-yellow-400 shrink-0" />
          Site is suspended — visitors see a suspended page.
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-0.5 border-b border-tundra-ink-200">
        {TABS.map((t) => {
          let badge: string | null = null
          if (t === 'Deployments' && deploys) badge = String(deploys.data.length)
          if (t === 'Daemons' && daemons) badge = String(daemons.data.length)
          if (t === 'Scheduled Tasks' && tasks) badge = String(tasks.data.length)
          return (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t) }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-tundra-lichen text-tundra-lichen-700'
                  : 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
              } ${t === 'Danger' ? 'text-tundra-rust-500 hover:text-tundra-rust' : ''}`}
            >
              {t}
              {badge !== null && (
                <span className="rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs text-tundra-ink-500">{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'Overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Site info */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Site</p>
            <InfoRow label="ID">
              <span className="font-mono text-xs">{site.id.slice(0, 12)}…</span>
              <CopyButton value={site.id} label="ID" />
            </InfoRow>
            <InfoRow label="Primary domain">
              <span className="font-mono text-sm">{site.primary_domain}</span>
              <CopyButton value={site.primary_domain} label="Domain" />
            </InfoRow>
            <InfoRow label="Server">
              {server ? (
                <Link to="/servers/$serverId" params={{ serverId: server.id }} className="hover:text-tundra-aurora hover:underline">
                  {server.name}
                </Link>
              ) : (
                <span className="font-mono text-xs text-tundra-ink-400">{site.server_id.slice(0, 12)}</span>
              )}
            </InfoRow>
            <InfoRow label="Source">
              <SourceBadge site={site} enabledPlugins={enabledPluginIds} />
            </InfoRow>
            <InfoRow label="Document root">
              <span className="font-mono text-xs">{site.document_root}</span>
              <CopyButton value={site.document_root} label="Document root" />
            </InfoRow>
            <InfoRow label="Created">
              <span className="text-tundra-ink-500">
                {new Date(site.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <span className="text-tundra-ink-300 text-xs">
                {new Date(site.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </InfoRow>
          </div>

          {/* Latest deployment */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Latest deployment</p>
            {deploysLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-tundra-ink-100" />
                <div className="h-4 w-48 animate-pulse rounded bg-tundra-ink-100" />
              </div>
            ) : latestDeploy ? (
              <>
                <InfoRow label="Deploy ID">
                  <span className="font-mono text-xs">{latestDeploy.id.slice(0, 12)}</span>
                </InfoRow>
                <InfoRow label="Status">
                  <DeployStatusBadge status={latestDeploy.status} />
                </InfoRow>
                <InfoRow label="Triggered by">
                  <span className="capitalize">{latestDeploy.triggered_by}</span>
                </InfoRow>
                {latestDeploy.source_ref && (
                  <InfoRow label="Source ref">
                    <span className="font-mono text-xs">{latestDeploy.source_ref.slice(0, 8)}</span>
                  </InfoRow>
                )}
                <InfoRow label="Started">
                  <span className="text-tundra-ink-500">{new Date(latestDeploy.created_at).toLocaleString()}</span>
                </InfoRow>
                <div className="mt-3 pt-3 border-t border-tundra-ink-100">
                  <button
                    type="button"
                    onClick={() => { setTab('Deployments') }}
                    className="text-xs text-tundra-lichen hover:underline"
                  >
                    View all deployments →
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-tundra-ink-400">No deployments yet.</p>
            )}
          </div>

          {/* Deploy trigger */}
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5 md:col-span-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Trigger deployment</p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Source ref (commit SHA, tag, branch) — optional"
                value={triggerSource}
                onChange={(e) => { setTriggerSource(e.target.value) }}
                className="flex-1 rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
              />
              <button
                type="button"
                onClick={() => { triggerMutation.mutate({ trigger: 'manual', ...(triggerSource ? { source_ref: triggerSource } : {}) }) }}
                disabled={triggerMutation.isPending}
                className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
              >
                {triggerMutation.isPending ? 'Deploying…' : 'Deploy'}
              </button>
            </div>
            <p className="mt-2 text-xs text-tundra-ink-400">Leave ref empty to deploy the latest commit on the default branch.</p>
          </div>
        </div>
      )}

      {/* ── Deployments tab ── */}
      {tab === 'Deployments' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-tundra-ink-400">
              {deploys?.data.length ?? 0} deployment{deploys?.data.length !== 1 ? 's' : ''}
              <span className="ml-2 text-xs text-tundra-ink-300">Auto-refreshes every 8s</span>
            </p>
            <button
              type="button"
              onClick={() => { triggerMutation.mutate({ trigger: 'manual' }) }}
              disabled={triggerMutation.isPending}
              className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
            >
              {triggerMutation.isPending ? 'Deploying…' : '+ Deploy'}
            </button>
          </div>
          {deploysLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-tundra-ink-100" />
              ))}
            </div>
          ) : deploys && deploys.data.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50 border-b border-tundra-ink-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Trigger</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Source ref</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {deploys.data.map((d) => (
                    <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-tundra-ink-500">{d.id.slice(0, 12)}</span>
                      </td>
                      <td className="px-4 py-3"><DeployStatusBadge status={d.status} /></td>
                      <td className="px-4 py-3 capitalize text-tundra-ink-500">{d.triggered_by}</td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">
                        {d.source_ref ? d.source_ref.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-tundra-ink-400 whitespace-nowrap">
                        {new Date(d.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No deployments yet.</p>
              <button
                type="button"
                onClick={() => { triggerMutation.mutate({ trigger: 'manual' }) }}
                className="mt-3 text-sm font-medium text-tundra-lichen hover:underline"
              >
                Trigger first deployment →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Daemons tab ── */}
      {tab === 'Daemons' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-tundra-ink-400">{daemons?.data.length ?? 0} daemon{daemons?.data.length !== 1 ? 's' : ''}</p>
          </div>
          {daemonsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-tundra-ink-100" />
              ))}
            </div>
          ) : daemons && daemons.data.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50 border-b border-tundra-ink-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Command</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Working dir</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {daemons.data.map((d) => (
                    <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-tundra-ink">{d.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-tundra-ink-500 max-w-[18rem] truncate block" title={d.command}>
                          {d.command}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">{d.working_dir}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-2 w-2 rounded-full ${d.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No daemons configured for this site.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Scheduled Tasks tab ── */}
      {tab === 'Scheduled Tasks' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-tundra-ink-400">{tasks?.data.length ?? 0} scheduled task{tasks?.data.length !== 1 ? 's' : ''}</p>
          </div>
          {tasksLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-tundra-ink-100" />
              ))}
            </div>
          ) : tasks && tasks.data.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50 border-b border-tundra-ink-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Schedule</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Command</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Last run</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {tasks.data.map((t) => (
                    <tr key={t.id} className="hover:bg-tundra-ink-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-tundra-ink">{t.name}</td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-mono text-tundra-ink-600">
                          {t.schedule}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-tundra-ink-500 max-w-[16rem] truncate block" title={t.command}>
                          {t.command}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-tundra-ink-400">
                        {t.last_run_at ? new Date(t.last_run_at).toLocaleString() : <span className="italic text-tundra-ink-300">Never</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-2 w-2 rounded-full ${t.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-200'}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No scheduled tasks configured for this site.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Edit tab ── */}
      {tab === 'Edit' && (
        <div className="max-w-lg">
          <div className="rounded-xl border border-tundra-ink-200 bg-white p-5 space-y-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Site name</span>
              <input
                type="text"
                value={editName}
                onChange={(e) => { setEditOverrides((p) => ({ ...p, name: e.target.value })) }}
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-tundra-ink-700">Primary domain</span>
              <input
                type="text"
                value={editDomain}
                onChange={(e) => { setEditOverrides((p) => ({ ...p, primary_domain: e.target.value })) }}
                className="rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                placeholder="example.com"
              />
            </label>

            {/* Read-only info */}
            <div className="rounded-lg bg-tundra-ink-50 p-3 text-xs text-tundra-ink-500 space-y-1">
              <div className="flex justify-between"><span>Server</span><span>{server?.name ?? site.server_id.slice(0, 12)}</span></div>
              <div className="flex justify-between"><span>Document root</span><span className="font-mono">{site.document_root}</span></div>
              <div className="flex justify-between"><span>ID</span><span className="font-mono">{site.id.slice(0, 12)}</span></div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { updateMutation.mutate({ name: editName, primary_domain: editDomain }) }}
                disabled={!isEditDirty || updateMutation.isPending}
                className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => { setEditOverrides({}) }}
                disabled={!isEditDirty}
                className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Danger tab ── */}
      {tab === 'Danger' && (
        <div className="max-w-lg space-y-4">
          <div className="rounded-xl border border-tundra-rust-200 bg-tundra-rust-50 p-5">
            <h3 className="mb-1 text-sm font-semibold text-tundra-rust-800">Delete site</h3>
            <p className="mb-4 text-sm text-tundra-rust-700">
              Permanently removes <strong>{site.primary_domain}</strong> and all its deployments, daemons, and scheduled tasks.
              This action cannot be undone.
            </p>
            <p className="mb-2 text-sm text-tundra-ink-600">
              Type <code className="font-mono font-bold">{site.primary_domain}</code> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => { setDeleteConfirm(e.target.value) }}
              placeholder={site.primary_domain}
              className="mb-3 w-full rounded-lg border border-tundra-rust-200 px-3 py-2 font-mono text-sm focus:border-tundra-rust focus:outline-none focus:ring-1 focus:ring-tundra-rust"
            />
            <button
              type="button"
              onClick={() => { deleteMutation.mutate() }}
              disabled={deleteConfirm !== site.primary_domain || deleteMutation.isPending}
              className="rounded-lg bg-tundra-rust px-5 py-2 text-sm font-medium text-white hover:bg-tundra-rust-600 disabled:opacity-40 transition-colors"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete site'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
