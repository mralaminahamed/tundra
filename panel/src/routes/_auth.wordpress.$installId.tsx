import { createFileRoute, Outlet, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { StatePill, type WpInstallation, type WpPlugin, type WpTheme } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId')({
  component: WpInstallLayout,
})

function WpInstallLayout() {
  const { installId } = Route.useParams()

  const qc = useQueryClient()

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
    // Poll every 3s while provisioning so state auto-updates
    refetchInterval: (q) =>
      q.state.data?.state === 'provisioning' ? 3000 : false,
  })

  const reprovisionMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/reprovision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast.success('Re-provisioning started')
      void qc.invalidateQueries({ queryKey: ['wp-installation', installId] })
    },
    onError: () => toast.error('Failed to start re-provisioning'),
  })

  const { data: plugins = [] } = useQuery<WpPlugin[]>({
    queryKey: ['wp-plugins', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins`)
        .then((r) => r.json())
        .then((r: { data: WpPlugin[] }) => r.data),
  })

  const { data: themes = [] } = useQuery<WpTheme[]>({
    queryKey: ['wp-themes', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes`)
        .then((r) => r.json())
        .then((r: { data: WpTheme[] }) => r.data),
  })

  const updateCount = [...plugins, ...themes].filter((x) => x.update_available).length

  const TAB_LINK_BASE = 'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium -mb-px transition-colors'
  const TAB_ACTIVE = 'border-tundra-lichen text-tundra-lichen-700'
  const TAB_INACTIVE = 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
  const TAB_DANGER_ACTIVE = 'border-red-500 text-red-600'
  const TAB_DANGER_INACTIVE = 'border-transparent text-tundra-ink-400 hover:text-red-500'

  return (
    <div className="pb-10">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-2 text-sm text-tundra-ink-400">
        <Link to="/wordpress" className="hover:text-tundra-ink transition-colors">WordPress</Link>
        <span>/</span>
        <span className="text-tundra-ink">{install?.site_title ?? installId}</span>
      </nav>

      {/* Hero */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-tundra-ink-200 bg-white p-6 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#21759B]">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="white">
            <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5c.5.1.9.1 1.3.1.5 0 1-.05 1-.05l1.2 3.5 1.3-3.6c.5.05.9.1 1.4.1.1 0 .2 0 .3-.01l-3 8.5-1.5-.05zm4.5 0l-1.3-3.8 2.8-7.7c.5 1.1.8 2.4.8 3.7 0 3.05-1.65 5.7-4 7l1.7.8z"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h1 className="text-xl font-bold text-tundra-ink">
              {install?.site_title ?? 'WordPress'}
            </h1>
            {install && <StatePill state={install.state} />}
            {install?.multisite && (
              <span className="rounded border border-tundra-aurora-300 bg-tundra-aurora-50 px-2 py-0.5 text-xs font-medium text-tundra-aurora-700">
                Multisite
              </span>
            )}
            {updateCount > 0 && (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                {updateCount} update{updateCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {install?.site_url && (
            <a href={install.site_url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-tundra-aurora hover:underline">
              {install.site_url} ↗
            </a>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tundra-ink-400">
            {install?.wp_version && <span>WordPress {install.wp_version}</span>}
            {install?.php_version && (
              <><span className="text-tundra-ink-200">·</span><span>PHP {install.php_version}</span></>
            )}
            {install?.admin_email && (
              <><span className="text-tundra-ink-200">·</span><span>{install.admin_email}</span></>
            )}
            {install?.disk_usage_mb != null && (
              <><span className="text-tundra-ink-200">·</span><span>{install.disk_usage_mb} MB</span></>
            )}
          </div>
          {install?.error_message && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {install.error_message}
            </div>
          )}
        </div>

        {/* Hero actions */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {install?.state === 'error' && (
            <button
              type="button"
              onClick={() => reprovisionMut.mutate()}
              disabled={reprovisionMut.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-medium text-yellow-800 hover:bg-yellow-100 disabled:opacity-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {reprovisionMut.isPending ? 'Reprovisioning…' : 'Retry provisioning'}
            </button>
          )}
          {install?.state === 'provisioning' && (
            <span className="flex items-center gap-1.5 rounded-lg border border-tundra-aurora-200 bg-tundra-aurora-50 px-3 py-2 text-xs font-medium text-tundra-aurora-700">
              <span className="h-2 w-2 rounded-full bg-tundra-aurora animate-pulse" />
              Installing…
            </span>
          )}
          {install?.site_url && (
            <a href={`${install.site_url}/wp-admin`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#21759B] px-3 py-2 text-xs font-medium text-white hover:bg-[#1a6284] transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
              </svg>
              WP Admin
            </a>
          )}
          <a href={install?.site_url ?? '#'} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-2 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
            </svg>
            View Site
          </a>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-0.5 overflow-x-auto border-b border-tundra-ink-200">
        <Link
          to="/wordpress/$installId"
          params={{ installId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${TAB_LINK_BASE} ${TAB_ACTIVE}` }}
          inactiveProps={{ className: `${TAB_LINK_BASE} ${TAB_INACTIVE}` }}
        >
          Overview
        </Link>
        <Link
          to="/wordpress/$installId/plugins"
          params={{ installId }}
          activeProps={{ className: `${TAB_LINK_BASE} ${TAB_ACTIVE}` }}
          inactiveProps={{ className: `${TAB_LINK_BASE} ${TAB_INACTIVE}` }}
        >
          Plugins
          {plugins.length > 0 && (
            <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs text-tundra-ink-500">
              {plugins.length}
            </span>
          )}
        </Link>
        <Link
          to="/wordpress/$installId/themes"
          params={{ installId }}
          activeProps={{ className: `${TAB_LINK_BASE} ${TAB_ACTIVE}` }}
          inactiveProps={{ className: `${TAB_LINK_BASE} ${TAB_INACTIVE}` }}
        >
          Themes
          {themes.length > 0 && (
            <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs text-tundra-ink-500">
              {themes.length}
            </span>
          )}
        </Link>
        {(['database', 'security', 'users', 'backups', 'settings'] as const).map((slug) => (
          <Link
            key={slug}
            to={`/wordpress/$installId/${slug}` as '/wordpress/$installId/database'}
            params={{ installId }}
            activeProps={{ className: `${TAB_LINK_BASE} ${TAB_ACTIVE}` }}
            inactiveProps={{ className: `${TAB_LINK_BASE} ${TAB_INACTIVE}` }}
          >
            {slug.charAt(0).toUpperCase() + slug.slice(1)}
          </Link>
        ))}
        <Link
          to="/wordpress/$installId/danger"
          params={{ installId }}
          activeProps={{ className: `${TAB_LINK_BASE} ${TAB_DANGER_ACTIVE}` }}
          inactiveProps={{ className: `${TAB_LINK_BASE} ${TAB_DANGER_INACTIVE}` }}
        >
          Danger Zone
        </Link>
      </div>

      <Outlet />
    </div>
  )
}
