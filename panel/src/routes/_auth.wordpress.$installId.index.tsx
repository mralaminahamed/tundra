import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  SitePreview, UpdateBadge,
  type WpInstallation, type WpPlugin, type WpTheme,
} from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/')({
  component: WpOverviewTab,
})

function QuickActionBtn({
  icon, label, href, onClick, variant = 'default',
}: {
  icon: React.ReactNode
  label: string
  href?: string
  onClick?: () => void
  variant?: 'default' | 'primary'
}) {
  const cls = `flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 text-xs font-medium transition-colors ${
    variant === 'primary'
      ? 'border-tundra-lichen bg-tundra-lichen text-white hover:bg-tundra-lichen-600'
      : 'border-tundra-ink-200 bg-white text-tundra-ink-600 hover:bg-tundra-ink-50 hover:text-tundra-ink'
  }`
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {icon}{label}
      </a>
    )
  }
  return <button type="button" onClick={onClick} className={cls}>{icon}{label}</button>
}

function WpOverviewTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const updateAllMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/update-all`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
      toast.success('All plugins updated')
    },
    onError: () => toast.error('Update failed'),
  })

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
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

  if (!install) return null

  const activeTheme = themes.find((t) => t.active)
  const activePlugins = plugins.filter((p) => p.active).length
  const pluginUpdates = plugins.filter((p) => p.update_available).length
  const themeUpdates = themes.filter((t) => t.update_available).length
  const totalUpdates = pluginUpdates + themeUpdates
  const wpAdminUrl = install.site_url ? `${install.site_url}/wp-admin` : null
  const phpMyAdminUrl = `/tools/phpmyadmin?installId=${installId}`

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <QuickActionBtn variant="primary" href={wpAdminUrl ?? '#'} label="WP Admin"
          icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>}
        />
        <QuickActionBtn href={phpMyAdminUrl} label="phpMyAdmin"
          icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/><path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/></svg>}
        />
        <Link
          to="/files/$siteId"
          params={{ siteId: install.site_id }}
          search={{ path: '/' }}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-tundra-ink-200 bg-white py-3 px-2 text-xs font-medium text-tundra-ink-600 transition-colors hover:bg-tundra-ink-50 hover:text-tundra-ink"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          File Manager
        </Link>
        <QuickActionBtn href={install.site_url ?? '#'} label="View Site"
          icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>}
        />
        <QuickActionBtn label="Clone" onClick={() => toast.info('Clone coming soon')}
          icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
        />
        <QuickActionBtn label="Staging" onClick={() => toast.info('Staging coming soon')}
          icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: preview + environment */}
        <div className="space-y-4 lg:col-span-2">
          <SitePreview url={install.site_url} />

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Plugins', value: plugins.length, color: 'text-tundra-ink' },
              { label: 'Active',  value: activePlugins, color: 'text-tundra-lichen-700' },
              { label: 'Themes',  value: themes.length, color: 'text-tundra-ink' },
              { label: 'Updates', value: totalUpdates, color: totalUpdates > 0 ? 'text-yellow-600' : 'text-tundra-ink-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-tundra-ink-200 bg-white p-4">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="mt-0.5 text-xs text-tundra-ink-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Environment table */}
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Environment</span>
            </div>
            <div className="divide-y divide-tundra-ink-100">
              {[
                { label: 'WordPress',    value: install.wp_version ?? '—' },
                { label: 'PHP',          value: install.php_version ?? '—' },
                { label: 'Path',         value: install.install_path ?? install.wp_path, mono: true },
                { label: 'Database',     value: install.db_name ?? '—', mono: true },
                { label: 'DB Host',      value: install.db_host ?? 'localhost', mono: true },
                { label: 'DB User',      value: install.db_user ?? '—', mono: true },
                { label: 'Table Prefix', value: install.db_prefix ?? 'wp_', mono: true },
                { label: 'Admin Email',  value: install.admin_email ?? '—' },
                { label: 'Multisite',    value: install.multisite ? 'Enabled' : 'Disabled' },
                { label: 'SSL',          value: install.ssl_active ? 'Active' : 'Not configured', highlight: install.ssl_active ? 'ok' : 'warn' as 'warn' | 'ok' },
                { label: 'Disk Usage',   value: install.disk_usage_mb != null ? `${install.disk_usage_mb} MB` : '—' },
              ].map(({ label, value, mono, highlight }) => (
                <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
                  <span className={[
                    mono ? 'font-mono text-xs' : '',
                    highlight === 'warn' ? 'text-yellow-600' : '',
                    highlight === 'ok' ? 'text-tundra-lichen-700' : '',
                    !highlight ? 'text-tundra-ink' : '',
                  ].join(' ')}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: theme + updates + ssl */}
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Active Theme</p>
            {activeTheme ? (
              <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
                {activeTheme.screenshot_url ? (
                  <img src={activeTheme.screenshot_url} alt={activeTheme.name} className="w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-tundra-ink-50">
                    <svg className="h-8 w-8 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                    </svg>
                  </div>
                )}
                <div className="p-3">
                  <p className="font-semibold text-tundra-ink">{activeTheme.name}</p>
                  <p className="mt-0.5 text-xs text-tundra-ink-400">
                    v{activeTheme.version ?? '—'}{activeTheme.author ? ` · ${activeTheme.author}` : ''}
                  </p>
                  {activeTheme.update_available && activeTheme.new_version && (
                    <div className="mt-2"><UpdateBadge newVersion={activeTheme.new_version} /></div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-tundra-ink-200 p-6 text-center text-sm text-tundra-ink-400">
                No active theme
              </div>
            )}
          </div>

          {totalUpdates > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-semibold text-yellow-800">
                {totalUpdates} update{totalUpdates !== 1 ? 's' : ''} available
              </p>
              <div className="space-y-1.5">
                {[...plugins, ...themes].filter((x) => x.update_available).map((x) => (
                  <div key={x.slug} className="flex items-center justify-between text-xs text-yellow-700">
                    <span>{x.name}</span>
                    <span className="font-mono">{x.new_version}</span>
                  </div>
                ))}
              </div>
              <button type="button"
                disabled={updateAllMut.isPending}
                onClick={() => updateAllMut.mutate()}
                className="mt-3 w-full rounded-lg border border-yellow-400 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50">
                {updateAllMut.isPending ? 'Updating…' : 'Update All'}
              </button>
            </div>
          )}

          <div className={`rounded-xl border p-4 ${
            !install.ssl_active ? 'border-yellow-200 bg-yellow-50' : 'border-tundra-lichen-200 bg-tundra-lichen-50'
          }`}>
            <div className="flex items-center gap-2">
              {!install.ssl_active ? (
                <svg className="h-4 w-4 text-yellow-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              ) : (
                <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              )}
              <span className={`text-sm font-semibold ${!install.ssl_active ? 'text-yellow-800' : 'text-tundra-lichen-800'}`}>
                {!install.ssl_active ? 'SSL not configured' : 'SSL / HTTPS active'}
              </span>
            </div>
            {!install.ssl_active && (
              <button type="button"
                onClick={() => { void navigate({ to: '/sites/$siteId/ssl', params: { siteId: install.site_id } }) }}
                className="mt-2 text-xs font-medium text-yellow-700 underline">
                Install SSL certificate →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
