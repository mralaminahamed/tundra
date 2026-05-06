import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Deployment, ListResponse, Server, Site } from '@/lib/api-types'
import { resolveBadge } from '@/lib/source-badge'
import { CopyButton, DeployStatusBadge, InfoRow, SectionCard } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/')({
  component: SiteOverviewTab,
})

function SiteOverviewTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()
  const [triggerRef, setTriggerRef] = useState('')

  const { data: site } = useQuery({
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

  const { data: deploys, isLoading: deploysLoading } = useQuery({
    queryKey: ['sites', siteId, 'deployments'],
    queryFn: () => api<ListResponse<Deployment>>(`/sites/${siteId}/deployments`),
  })

  const enabledPluginIds = pluginsNav.filter((p) => p.state === 'enabled').map((p) => p.plugin_id)
  const serverMap = new Map<string, Server>((serversData?.data ?? []).map((s) => [s.id, s]))

  const deployMut = useMutation({
    mutationFn: (ref?: string) =>
      api(`/sites/${siteId}/deployments`, { method: 'POST', body: { trigger: 'manual', ...(ref ? { source_ref: ref } : {}) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'deployments'] })
      toast.success('Deployment triggered')
      setTriggerRef('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Deploy failed'),
  })

  if (!site) return null

  const server = serverMap.get(site.server_id)
  const latestDeploy = deploys?.data[0]
  const sourceBadge = resolveBadge(site, enabledPluginIds)

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Site info */}
      <SectionCard title="Site">
        <InfoRow label="ID">
          <span className="flex items-center font-mono text-xs">{site.id.slice(0, 14)}…<CopyButton value={site.id} label="ID" /></span>
        </InfoRow>
        <InfoRow label="Primary domain">
          <span className="flex items-center font-mono text-sm">{site.primary_domain}<CopyButton value={site.primary_domain} label="Domain" /></span>
        </InfoRow>
        <InfoRow label="Display name">{site.name}</InfoRow>
        <InfoRow label="Server">
          {server ? (
            <Link to="/servers/$serverId" params={{ serverId: server.id }}
              className="hover:text-tundra-aurora hover:underline transition-colors">{server.name}</Link>
          ) : (
            <span className="font-mono text-xs text-tundra-ink-400">{site.server_id.slice(0, 12)}</span>
          )}
        </InfoRow>
        <InfoRow label="Source">
          {sourceBadge ? (
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sourceBadge.cls}`}>
              {sourceBadge.label}
            </span>
          ) : (
            <span className="text-tundra-ink-400">{site.source_kind ?? '—'}</span>
          )}
        </InfoRow>
        <InfoRow label="Document root">
          <span className="flex items-center font-mono text-xs">{site.document_root}<CopyButton value={site.document_root} label="Document root" /></span>
        </InfoRow>
        <InfoRow label="Created">
          {new Date(site.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          {' '}
          <span className="text-xs text-tundra-ink-300">
            {new Date(site.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
        </InfoRow>
      </SectionCard>

      {/* Latest deployment */}
      <SectionCard title="Latest deployment">
        {deploysLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-tundra-ink-100" />)}
          </div>
        ) : latestDeploy ? (
          <>
            <InfoRow label="Deploy ID">
              <span className="font-mono text-xs">{latestDeploy.id.slice(0, 14)}</span>
            </InfoRow>
            <InfoRow label="Status"><DeployStatusBadge status={latestDeploy.status} /></InfoRow>
            <InfoRow label="Triggered by"><span className="capitalize">{latestDeploy.triggered_by}</span></InfoRow>
            {latestDeploy.source_ref && (
              <InfoRow label="Source ref">
                <span className="font-mono text-xs">{latestDeploy.source_ref.slice(0, 10)}</span>
              </InfoRow>
            )}
            <InfoRow label="Started">
              <span className="text-tundra-ink-500 text-xs">{new Date(latestDeploy.created_at).toLocaleString()}</span>
            </InfoRow>
            <div className="mt-3 border-t border-tundra-ink-100 pt-3">
              <Link to="/sites/$siteId/deployments" params={{ siteId }}
                className="text-xs font-medium text-tundra-lichen hover:underline">
                View all deployments →
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-tundra-ink-400">No deployments yet.</p>
        )}
      </SectionCard>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:col-span-2">
        {(() => {
          const cls = 'flex flex-col items-center gap-2 rounded-xl border border-tundra-ink-200 bg-white py-4 text-xs font-medium text-tundra-ink-500 transition-colors hover:border-tundra-lichen hover:text-tundra-lichen-700'
          return (<>
            <Link to="/files/$siteId" params={{ siteId }} search={{ path: '/' }} className={cls}>
              <svg className="h-5 w-5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
              File Manager
            </Link>
            <Link to="/sites/$siteId/domains" params={{ siteId }} className={cls}>
              <svg className="h-5 w-5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              Domains
            </Link>
            <Link to="/sites/$siteId/ssl" params={{ siteId }} className={cls}>
              <svg className="h-5 w-5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              SSL
            </Link>
            <Link to="/sites/$siteId/databases" params={{ siteId }} className={cls}>
              <svg className="h-5 w-5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/><path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/></svg>
              Databases
            </Link>
          </>)
        })()}
      </div>

      {/* Deploy trigger */}
      <div className="md:col-span-2">
        <SectionCard title="Trigger deployment">
          <div className="flex items-center gap-3">
            <input type="text" placeholder="Source ref (commit SHA, tag, branch) — optional"
              value={triggerRef}
              onChange={(e) => { setTriggerRef(e.target.value) }}
              className="flex-1 rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
            <button type="button"
              onClick={() => { deployMut.mutate(triggerRef || undefined) }}
              disabled={deployMut.isPending}
              className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {deployMut.isPending ? 'Deploying…' : 'Deploy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-tundra-ink-400">Leave ref empty to deploy the latest commit on the default branch.</p>
        </SectionCard>
      </div>
    </div>
  )
}
