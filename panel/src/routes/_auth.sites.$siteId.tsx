import { createFileRoute, Outlet, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ListResponse, Server, Site } from '@/lib/api-types'
import { resolveBadge } from '@/lib/source-badge'
import { SiteStatusPill } from '@/components/site-shared'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId')({
  component: SiteDetailLayout,
})

function SourceBadge({ site, enabledPlugins }: { site: Site; enabledPlugins: string[] }) {
  const m = resolveBadge(site, enabledPlugins)
  if (!m) return null
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  )
}

function SiteDetailLayout() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

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
  const serverMap = new Map<string, Server>((serversData?.data ?? []).map((s) => [s.id, s]))

  const deployMut = useMutation({
    mutationFn: () => api(`/sites/${siteId}/deployments`, { method: 'POST', body: { trigger: 'manual' } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'deployments'] })
      toast.success('Deployment triggered')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Deploy failed'),
  })

  if (isLoading) return (
    <div className="space-y-3 pb-10">
      <div className="h-4 w-32 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-tundra-ink-100" />
      <div className="h-10 animate-pulse rounded-xl bg-tundra-ink-100" />
    </div>
  )
  if (!site) return <p className="text-sm text-tundra-rust">Site not found.</p>

  const server = serverMap.get(site.server_id)

  const TAB_BASE  = 'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium -mb-px transition-colors'
  const TAB_ON    = 'border-tundra-lichen text-tundra-lichen-700'
  const TAB_OFF   = 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
  const TAB_DANGER_ON  = 'border-red-500 text-red-600'
  const TAB_DANGER_OFF = 'border-transparent text-tundra-ink-400 hover:text-red-500'

  const tabLink = (to: string, label: string, danger = false) => (
    <Link
      key={to}
      to={to as '/sites/$siteId'}
      params={{ siteId }}
      activeProps={{ className: `${TAB_BASE} ${danger ? TAB_DANGER_ON : TAB_ON}` }}
      inactiveProps={{ className: `${TAB_BASE} ${danger ? TAB_DANGER_OFF : TAB_OFF}` }}
      activeOptions={to === '/sites/$siteId' ? { exact: true } : undefined}
    >
      {label}
    </Link>
  )

  return (
    <div className="pb-10">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-tundra-ink-400">
        <Link to="/sites" className="hover:text-tundra-ink transition-colors">Sites</Link>
        <span>/</span>
        <span className="text-tundra-ink">{site.primary_domain}</span>
      </nav>

      {/* Hero */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-tundra-ink-200 bg-white p-6 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-tundra-ink-900">
          <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h1 className="text-xl font-bold text-tundra-ink">{site.primary_domain}</h1>
            <SiteStatusPill status={site.status} />
            <SourceBadge site={site} enabledPlugins={enabledPluginIds} />
          </div>
          <p className="text-sm text-tundra-ink-400">{site.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tundra-ink-400">
            {server && (
              <span className="flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                </svg>
                <Link to="/servers/$serverId" params={{ serverId: server.id }}
                  className="hover:text-tundra-aurora transition-colors">{server.name}</Link>
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              </svg>
              <span className="font-mono">{site.document_root}</span>
            </span>
            <span>Created {fmtDate(site.created_at)}</span>
          </div>
          {site.status === 'suspended' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
              Site is suspended — visitors see a suspended page.
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={`https://${site.primary_domain}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-2 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Visit site
          </a>
          <Link to="/sites/$siteId/settings" params={{ siteId }}
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-2 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Settings
          </Link>
          <button type="button"
            onClick={() => { deployMut.mutate() }}
            disabled={deployMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-3 py-2 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M5 3l14 9-14 9V3z"/>
            </svg>
            {deployMut.isPending ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0.5 overflow-x-auto border-b border-tundra-ink-200">
        {tabLink('/sites/$siteId',              'Overview')}
        {tabLink('/sites/$siteId/deployments',  'Deployments')}
        {tabLink('/sites/$siteId/files',        'Files')}
        {tabLink('/sites/$siteId/domains',      'Domains')}
        {tabLink('/sites/$siteId/dns',          'DNS')}
        {tabLink('/sites/$siteId/ssl',          'SSL')}
        {tabLink('/sites/$siteId/email',        'Email')}
        {tabLink('/sites/$siteId/databases',    'Databases')}
        {tabLink('/sites/$siteId/backups',      'Backups')}
        {tabLink('/sites/$siteId/php',          'PHP')}
        {tabLink('/sites/$siteId/daemons',      'Daemons')}
        {tabLink('/sites/$siteId/cron',         'Cron')}
        {tabLink('/sites/$siteId/logs',         'Logs')}
        {tabLink('/sites/$siteId/analytics',    'Analytics')}
        {tabLink('/sites/$siteId/settings',     'Settings')}
        {tabLink('/sites/$siteId/danger',       'Danger Zone', true)}
      </div>

      <Outlet />
    </div>
  )
}
