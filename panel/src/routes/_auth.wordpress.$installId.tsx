import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/wordpress/$installId')({
  component: WpInstallDetailPage,
})

// ── Types ──────────────────────────────────────────────────────────────────────

interface WpInstallation {
  id: string
  site_id: string
  wp_version: string | null
  php_version: string | null
  wp_path: string
  db_name: string | null
  db_user: string | null
  db_host: string | null
  db_prefix: string | null
  admin_email: string | null
  site_title: string | null
  site_url: string | null
  multisite: boolean
  ssl_active: boolean | null
  disk_usage_mb: number | null
  state: 'provisioning' | 'active' | 'error' | 'removing'
  error_message: string | null
  created_at: string
  updated_at: string
}

interface WpPlugin {
  id: number
  slug: string
  name: string
  version: string | null
  author: string | null
  description: string | null
  active: boolean
  update_available: boolean
  new_version: string | null
}

interface WpTheme {
  id: number
  slug: string
  name: string
  version: string | null
  author: string | null
  description: string | null
  active: boolean
  update_available: boolean
  new_version: string | null
  screenshot_url: string | null
}

interface WpUser {
  id: number
  login: string
  email: string
  display_name: string
  role: string
  registered: string
}

interface WpBackup {
  id: string
  created_at: string
  size_bytes: number
  type: 'manual' | 'scheduled'
  status: 'complete' | 'running' | 'failed'
  note: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatePill({ state }: { state: WpInstallation['state'] }) {
  const map: Record<string, string> = {
    provisioning: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
    active:       'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
    error:        'border-red-300 bg-red-50 text-red-800',
    removing:     'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',
  }
  const dot: Record<string, string> = {
    provisioning: 'bg-tundra-aurora animate-pulse',
    active:       'bg-tundra-lichen',
    error:        'bg-red-500',
    removing:     'bg-tundra-ink-300',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[state] ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[state] ?? ''}`} />
      {state}
    </span>
  )
}

function UpdateBadge({ newVersion }: { newVersion: string }) {
  return (
    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
      {newVersion} available
    </span>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs text-tundra-ink-400">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
          checked ? 'border-tundra-lichen bg-tundra-lichen' : 'border-tundra-ink-300 bg-tundra-ink-100'
        }`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function QuickActionBtn({
  icon,
  label,
  href,
  onClick,
  variant = 'default',
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
        {icon}
        {label}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  )
}

function SitePreview({ url }: { url: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 truncate rounded-md border border-tundra-ink-200 bg-white px-3 py-1 text-xs text-tundra-ink-500">
          {url ?? 'https://example.com'}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-tundra-aurora hover:underline"
          >
            Open ↗
          </a>
        )}
      </div>
      {/* Preview area */}
      <div className="relative flex h-52 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* Simulated WP top bar */}
        <div className="flex items-center gap-2 bg-[#23282d] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#00b9eb">
              <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5c.5.1.9.1 1.3.1.5 0 1-.05 1-.05l1.2 3.5 1.3-3.6c.5.05.9.1 1.4.1.1 0 .2 0 .3-.01l-3 8.5-1.5-.05z"/>
            </svg>
            <span className="text-[10px] text-gray-400">WordPress</span>
          </div>
          <div className="ml-2 flex gap-3">
            {['Dashboard', 'Posts', 'Pages', 'Appearance', 'Plugins'].map((item) => (
              <span key={item} className="text-[10px] text-gray-500">{item}</span>
            ))}
          </div>
        </div>
        {/* Simulated content */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white/60">
          <div className="text-center">
            <div className="mx-auto mb-2 h-6 w-36 rounded bg-tundra-ink-100" />
            <div className="mx-auto h-3 w-24 rounded bg-tundra-ink-50" />
          </div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#21759B] px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#1a6284]"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Website
            </a>
          ) : (
            <span className="text-xs text-tundra-ink-400">No site URL configured</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  install,
  plugins,
  themes,
}: {
  install: WpInstallation
  plugins: WpPlugin[]
  themes: WpTheme[]
}) {
  const activeTheme = themes.find((t) => t.active)
  const activePlugins = plugins.filter((p) => p.active).length
  const pluginUpdates = plugins.filter((p) => p.update_available).length
  const themeUpdates = themes.filter((t) => t.update_available).length
  const totalUpdates = pluginUpdates + themeUpdates
  const wpAdminUrl = install.site_url ? `${install.site_url}/wp-admin` : null
  const phpMyAdminUrl = install.db_name ? `/tools/phpmyadmin?db=${install.db_name}` : '/tools/phpmyadmin'
  const fileManagerUrl = `/sites/${install.site_id}/files`

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <QuickActionBtn
          variant="primary"
          href={wpAdminUrl ?? '#'}
          label="WP Admin"
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
            </svg>
          }
        />
        <QuickActionBtn
          href={phpMyAdminUrl}
          label="phpMyAdmin"
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
              <path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/>
            </svg>
          }
        />
        <QuickActionBtn
          href={fileManagerUrl}
          label="File Manager"
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
          }
        />
        <QuickActionBtn
          href={install.site_url ?? '#'}
          label="View Site"
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
            </svg>
          }
        />
        <QuickActionBtn
          label="Clone"
          onClick={() => toast.info('Clone coming soon')}
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          }
        />
        <QuickActionBtn
          label="Staging"
          onClick={() => toast.info('Staging coming soon')}
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            </svg>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left col: preview + environment */}
        <div className="space-y-4 lg:col-span-2">
          <SitePreview url={install.site_url} />

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Plugins',  value: plugins.length, color: 'text-tundra-ink' },
              { label: 'Active',   value: activePlugins, color: 'text-tundra-lichen-700' },
              { label: 'Themes',   value: themes.length, color: 'text-tundra-ink' },
              { label: 'Updates',  value: totalUpdates, color: totalUpdates > 0 ? 'text-yellow-600' : 'text-tundra-ink-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-tundra-ink-200 bg-white p-4">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="mt-0.5 text-xs text-tundra-ink-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Environment */}
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Environment</span>
            </div>
            <div className="divide-y divide-tundra-ink-100">
              {[
                { label: 'WordPress',    value: install.wp_version ? `${install.wp_version}` : '—' },
                { label: 'PHP',          value: install.php_version ?? '8.2' },
                { label: 'Path',         value: install.wp_path, mono: true },
                { label: 'Database',     value: install.db_name ?? '—', mono: true },
                { label: 'DB Host',      value: install.db_host ?? 'localhost', mono: true },
                { label: 'DB User',      value: install.db_user ?? '—', mono: true },
                { label: 'Table Prefix', value: install.db_prefix ?? 'wp_', mono: true },
                { label: 'Admin Email',  value: install.admin_email ?? '—' },
                { label: 'Multisite',    value: install.multisite ? 'Enabled' : 'Disabled' },
                { label: 'SSL',          value: install.ssl_active === false ? 'Not configured' : 'Active', highlight: install.ssl_active === false ? 'warn' : 'ok' },
                { label: 'Disk Usage',   value: install.disk_usage_mb != null ? `${install.disk_usage_mb} MB` : '—' },
              ].map(({ label, value, mono, highlight }) => (
                <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
                  <span className={[
                    mono ? 'font-mono' : '',
                    highlight === 'warn' ? 'text-yellow-600' : '',
                    highlight === 'ok' ? 'text-tundra-lichen-700' : '',
                    !highlight ? 'text-tundra-ink' : '',
                  ].join(' ')}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right col: active theme + updates */}
        <div className="space-y-4">
          {/* Active theme */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Active Theme</p>
            {activeTheme ? (
              <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
                {activeTheme.screenshot_url ? (
                  <img
                    src={activeTheme.screenshot_url}
                    alt={activeTheme.name}
                    className="w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
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

          {/* Updates panel */}
          {totalUpdates > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-semibold text-yellow-800">
                {totalUpdates} update{totalUpdates !== 1 ? 's' : ''} available
              </p>
              <div className="space-y-1.5">
                {[...plugins, ...themes]
                  .filter((x) => x.update_available)
                  .map((x) => (
                    <div key={x.slug} className="flex items-center justify-between text-xs text-yellow-700">
                      <span>{x.name}</span>
                      <span className="font-mono">{x.new_version}</span>
                    </div>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => toast.info('Bulk update coming soon')}
                className="mt-3 w-full rounded-lg border border-yellow-400 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors"
              >
                Update All
              </button>
            </div>
          )}

          {/* SSL status card */}
          <div className={`rounded-xl border p-4 ${
            install.ssl_active === false
              ? 'border-yellow-200 bg-yellow-50'
              : 'border-tundra-lichen-200 bg-tundra-lichen-50'
          }`}>
            <div className="flex items-center gap-2">
              {install.ssl_active === false ? (
                <svg className="h-4 w-4 text-yellow-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              ) : (
                <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              )}
              <span className={`text-sm font-semibold ${install.ssl_active === false ? 'text-yellow-800' : 'text-tundra-lichen-800'}`}>
                {install.ssl_active === false ? 'SSL not configured' : 'SSL / HTTPS active'}
              </span>
            </div>
            {install.ssl_active === false && (
              <button
                type="button"
                onClick={() => toast.info('SSL setup coming soon')}
                className="mt-2 text-xs font-medium text-yellow-700 underline"
              >
                Install SSL certificate →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Plugins tab ───────────────────────────────────────────────────────────────

function PluginsTab({ installId, plugins, isLoading }: {
  installId: string
  plugins: WpPlugin[]
  isLoading: boolean
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [slugInput, setSlugInput] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive' | 'updates'>('all')

  const installMut = useMutation({
    mutationFn: (slug: string) =>
      api(`/wordpress/installations/${installId}/plugins`, {
        method: 'POST',
        body: { slug, activate: true },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      setSlugInput('')
      toast.success('Plugin installed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Install failed'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ slug, active }: { slug: string; active: boolean }) =>
      api(`/wordpress/installations/${installId}/plugins/${slug}`, {
        method: 'PATCH',
        body: { active: !active },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: (slug: string) =>
      api(`/wordpress/installations/${installId}/plugins/${slug}/update`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      toast.success('Plugin updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const updateAllMut = useMutation({
    mutationFn: () =>
      api(`/wordpress/installations/${installId}/plugins/update-all`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      toast.success('All plugins updated')
    },
    onError: () => toast.info('Bulk update coming soon'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      toast.success('Plugin removed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const q = search.toLowerCase()
  const filtered = plugins.filter((p) => {
    if (filterActive === 'active' && !p.active) return false
    if (filterActive === 'inactive' && p.active) return false
    if (filterActive === 'updates' && !p.update_available) return false
    if (q && !p.name.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q)) return false
    return true
  })
  const hasUpdates = plugins.some((p) => p.update_available)

  return (
    <div className="space-y-4">
      {/* Install form */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Plugin slug — e.g. woocommerce, yoast-seo"
          value={slugInput}
          onChange={(e) => { setSlugInput(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && slugInput) installMut.mutate(slugInput) }}
          className="h-9 flex-1 rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
        />
        <button
          type="button"
          disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate(slugInput) }}
          className="rounded-lg bg-tundra-lichen px-4 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
        >
          {installMut.isPending ? 'Installing…' : 'Install & Activate'}
        </button>
      </div>

      {/* Filters + bulk update */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search plugins…"
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="h-8 w-48 rounded-lg border border-tundra-ink-200 px-3 text-xs focus:border-tundra-lichen focus:outline-none"
        />
        <div className="flex gap-1">
          {(['all', 'active', 'inactive', 'updates'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setFilterActive(f) }}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filterActive === f
                  ? 'border-tundra-lichen bg-tundra-lichen text-white'
                  : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen hover:text-tundra-lichen-700'
              }`}
            >
              {f === 'updates' ? 'Updates' : f}
              {f === 'updates' && hasUpdates && (
                <span className="ml-1 rounded-full bg-yellow-200 px-1 text-yellow-700">
                  {plugins.filter((p) => p.update_available).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="text-xs text-tundra-ink-400">{filtered.length} plugins</span>
        {hasUpdates && (
          <button
            type="button"
            onClick={() => { updateAllMut.mutate() }}
            disabled={updateAllMut.isPending}
            className="ml-auto rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
          >
            {updateAllMut.isPending ? 'Updating…' : 'Update All'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-tundra-ink-200 py-12 text-center text-sm text-tundra-ink-400">
          {plugins.length === 0 ? 'No plugins installed.' : 'No plugins match the filter.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Plugin</th>
                <th className="px-4 py-3 text-left">Version</th>
                <th className="px-4 py-3 text-left">Author</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {filtered.map((p) => (
                <tr key={p.slug} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-tundra-ink">{p.name}</p>
                    <p className="font-mono text-xs text-tundra-ink-400">{p.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-tundra-ink-500">{p.version ?? '—'}</span>
                    {p.update_available && p.new_version && (
                      <div className="mt-0.5"><UpdateBadge newVersion={p.new_version} /></div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-500">{p.author ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      p.active
                        ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700'
                        : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
                    }`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.update_available && (
                        <button
                          type="button"
                          onClick={() => { updateMut.mutate(p.slug) }}
                          disabled={updateMut.isPending}
                          className="rounded border border-yellow-300 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
                        >
                          Update
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { toggleMut.mutate({ slug: p.slug, active: p.active }) }}
                        disabled={toggleMut.isPending}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          p.active
                            ? 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'
                            : 'border-tundra-lichen-300 text-tundra-lichen-700 hover:bg-tundra-lichen-50'
                        }`}
                      >
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { removeMut.mutate(p.slug) }}
                        disabled={removeMut.isPending}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Themes tab ────────────────────────────────────────────────────────────────

function ThemesTab({ installId, themes, isLoading }: {
  installId: string
  themes: WpTheme[]
  isLoading: boolean
}) {
  const qc = useQueryClient()
  const [slugInput, setSlugInput] = useState('')

  const installMut = useMutation({
    mutationFn: ({ slug, activate }: { slug: string; activate: boolean }) =>
      api(`/wordpress/installations/${installId}/themes`, {
        method: 'POST',
        body: { slug, activate },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
      setSlugInput('')
      toast.success('Theme installed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Install failed'),
  })

  const activateMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/${slug}/activate`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
      toast.success('Theme activated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: (slug: string) =>
      api(`/wordpress/installations/${installId}/themes/${slug}/update`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
      toast.success('Theme updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
      toast.success('Theme removed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Theme slug — e.g. astra, generatepress, twentytwentyfour"
          value={slugInput}
          onChange={(e) => { setSlugInput(e.target.value) }}
          className="h-9 flex-1 rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
        />
        <button
          type="button"
          disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate({ slug: slugInput, activate: false }) }}
          className="rounded-lg border border-tundra-ink-200 px-4 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
        >
          Install
        </button>
        <button
          type="button"
          disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate({ slug: slugInput, activate: true }) }}
          className="rounded-lg bg-tundra-lichen px-4 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
        >
          Install &amp; Activate
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : themes.length === 0 ? (
        <div className="rounded-xl border border-tundra-ink-200 py-12 text-center text-sm text-tundra-ink-400">
          No themes installed.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => (
            <div key={t.slug} className={`relative overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md ${
              t.active ? 'border-tundra-lichen-300' : 'border-tundra-ink-200'
            }`}>
              {t.active && (
                <div className="absolute left-3 top-3 z-10 rounded-full bg-tundra-lichen px-2 py-0.5 text-xs font-semibold text-white shadow">
                  Active
                </div>
              )}
              {t.screenshot_url ? (
                <div className="relative h-36 overflow-hidden bg-tundra-ink-50">
                  <img
                    src={t.screenshot_url}
                    alt={t.name}
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              ) : (
                <div className="flex h-36 items-center justify-center bg-tundra-ink-50">
                  <svg className="h-10 w-10 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                  </svg>
                </div>
              )}
              <div className="p-4">
                <p className="font-semibold text-tundra-ink">{t.name}</p>
                <p className="mt-0.5 text-xs text-tundra-ink-400">
                  {t.version ? `v${t.version}` : '—'}{t.author ? ` · ${t.author}` : ''}
                </p>
                {t.update_available && t.new_version && (
                  <div className="mt-2"><UpdateBadge newVersion={t.new_version} /></div>
                )}
                <div className="mt-3 flex gap-1.5">
                  {!t.active && (
                    <button
                      type="button"
                      onClick={() => { activateMut.mutate(t.slug) }}
                      disabled={activateMut.isPending}
                      className="flex-1 rounded-lg bg-tundra-lichen py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  {t.update_available && (
                    <button
                      type="button"
                      onClick={() => { updateMut.mutate(t.slug) }}
                      disabled={updateMut.isPending}
                      className="flex-1 rounded-lg border border-yellow-300 bg-yellow-50 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 transition-colors"
                    >
                      Update
                    </button>
                  )}
                  {!t.active && (
                    <button
                      type="button"
                      onClick={() => { removeMut.mutate(t.slug) }}
                      disabled={removeMut.isPending}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Database tab ──────────────────────────────────────────────────────────────

function DatabaseTab({ install }: { install: WpInstallation }) {
  const [showPassword, setShowPassword] = useState(false)
  const [searchFrom, setSearchFrom] = useState('')
  const [searchTo, setSearchTo] = useState('')

  const phpMyAdminUrl = install.db_name
    ? `/tools/phpmyadmin?db=${install.db_name}&user=${install.db_user ?? ''}`
    : '/tools/phpmyadmin'

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Credentials */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Database Credentials</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'Database Name', value: install.db_name ?? '—' },
              { label: 'DB Username',   value: install.db_user ?? '—' },
              { label: 'DB Host',       value: install.db_host ?? 'localhost' },
              { label: 'Table Prefix',  value: install.db_prefix ?? 'wp_' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 text-tundra-ink-400">{label}</span>
                <span className="flex-1 font-mono text-tundra-ink">{value}</span>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(value); toast.success('Copied') }}
                  className="text-tundra-ink-300 hover:text-tundra-ink-500 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                </button>
              </div>
            ))}
            {/* Password row */}
            <div className="flex items-center gap-4 px-4 py-2.5 text-sm">
              <span className="w-32 shrink-0 text-tundra-ink-400">DB Password</span>
              <span className="flex-1 font-mono text-tundra-ink">
                {showPassword ? '••••••••' : '••••••••'}
              </span>
              <button
                type="button"
                onClick={() => { setShowPassword(!showPassword); toast.info('Password reveal requires re-auth') }}
                className="text-xs text-tundra-aurora hover:underline"
              >
                {showPassword ? 'Hide' : 'Reveal'}
              </button>
            </div>
          </div>
        </div>

        {/* phpMyAdmin */}
        <a
          href={phpMyAdminUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
            <path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3"/>
          </svg>
          Open phpMyAdmin
          <svg className="h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
          </svg>
        </a>
      </div>

      {/* Search & Replace */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Search &amp; Replace in Database</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-tundra-ink-400">
              Safely find and replace text across all database tables. Useful for URL migration or domain changes.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Search for</label>
              <input
                type="text"
                placeholder="https://old-domain.com"
                value={searchFrom}
                onChange={(e) => { setSearchFrom(e.target.value) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Replace with</label>
              <input
                type="text"
                placeholder="https://new-domain.com"
                value={searchTo}
                onChange={(e) => { setSearchTo(e.target.value) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toast.info('Dry-run preview coming soon')}
                className="flex-1 rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
              >
                Preview Changes
              </button>
              <button
                type="button"
                disabled={!searchFrom || !searchTo}
                onClick={() => toast.info('Search & replace coming soon')}
                className="flex-1 rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
              >
                Run Replace
              </button>
            </div>
          </div>
        </div>

        {/* DB Actions */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Actions</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'Optimize Tables',       desc: 'Reclaim space and improve performance', action: 'Optimize' },
              { label: 'Repair Tables',         desc: 'Fix corrupted or crashed tables',        action: 'Repair' },
              { label: 'Export Database',       desc: 'Download a full SQL dump',               action: 'Export' },
              { label: 'Change DB Password',    desc: 'Rotate the database user password',      action: 'Change' },
            ].map(({ label, desc, action }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-tundra-ink">{label}</p>
                  <p className="text-xs text-tundra-ink-400">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toast.info(`${label} coming soon`)}
                  className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                >
                  {action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab({ installId }: { installId: string }) {
  const [maintenance, setMaintenance] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [searchIndexing, setSearchIndexing] = useState(true)
  const [hotlinkProtection, setHotlinkProtection] = useState(false)
  const [passwordProtection, setPasswordProtection] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)

  const patchSetting = (key: string, value: boolean) => {
    void api(`/wordpress/installations/${installId}/settings`, {
      method: 'PATCH',
      body: { [key]: value },
    }).catch(() => null)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Toggles */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Site Visibility &amp; Access</span>
          </div>
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle
              label="Search Engine Indexing"
              description="Allow search engines to crawl and index this site"
              checked={searchIndexing}
              onChange={(v) => { setSearchIndexing(v); patchSetting('search_indexing', v) }}
            />
            <Toggle
              label="Maintenance Mode"
              description="Show a maintenance page to visitors while you work"
              checked={maintenance}
              onChange={(v) => { setMaintenance(v); patchSetting('maintenance_mode', v) }}
            />
            <Toggle
              label="Password Protection"
              description="Require a password to view the site (HTTP basic auth)"
              checked={passwordProtection}
              onChange={(v) => { setPasswordProtection(v); patchSetting('password_protection', v) }}
            />
            <Toggle
              label="Hotlink Protection"
              description="Prevent other sites from embedding your images"
              checked={hotlinkProtection}
              onChange={(v) => { setHotlinkProtection(v); patchSetting('hotlink_protection', v) }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Developer Settings</span>
          </div>
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle
              label="WordPress Debug Mode"
              description="Enable WP_DEBUG — only for development environments"
              checked={debugMode}
              onChange={(v) => { setDebugMode(v); patchSetting('debug_mode', v) }}
            />
            <Toggle
              label="Two-Factor Authentication"
              description="Require 2FA for all WordPress admin accounts"
              checked={twoFactor}
              onChange={(v) => { setTwoFactor(v); patchSetting('two_factor', v) }}
            />
          </div>
        </div>
      </div>

      {/* Security checks */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Security Scans</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              {
                label: 'File Integrity Check',
                desc: 'Verify core files against WordPress.org checksums',
                action: 'Scan',
                icon: (
                  <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                ),
              },
              {
                label: 'Malware Scan',
                desc: 'Scan all PHP files for malicious code',
                action: 'Scan',
                icon: (
                  <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                ),
              },
              {
                label: 'Check User Permissions',
                desc: 'Detect accounts with unexpected admin privileges',
                action: 'Check',
                icon: (
                  <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                ),
              },
              {
                label: 'Brute Force Log',
                desc: 'Review failed login attempts and blocked IPs',
                action: 'View',
                icon: (
                  <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                ),
              },
            ].map(({ label, desc, action, icon }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-start gap-3">
                  {icon}
                  <div>
                    <p className="text-sm font-medium text-tundra-ink">{label}</p>
                    <p className="text-xs text-tundra-ink-400">{desc}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toast.info(`${label} coming soon`)}
                  className="shrink-0 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                >
                  {action}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* SSL card */}
        <div className="overflow-hidden rounded-xl border border-tundra-lichen-200 bg-tundra-lichen-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="h-4 w-4 text-tundra-lichen-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-sm font-semibold text-tundra-lichen-800">SSL Certificate</span>
          </div>
          <p className="text-xs text-tundra-lichen-700 mb-3">
            Force HTTPS redirects and manage your TLS certificate from here.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toast.info('Force HTTPS coming soon')}
              className="flex-1 rounded-lg border border-tundra-lichen-300 bg-white py-1.5 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 transition-colors"
            >
              Force HTTPS
            </button>
            <button
              type="button"
              onClick={() => toast.info('SSL renewal coming soon')}
              className="flex-1 rounded-lg bg-tundra-lichen py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
            >
              Renew Certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ installId }: { installId: string }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ login: '', email: '', role: 'editor', password: '' })

  const { data: users = [], isLoading } = useQuery<WpUser[]>({
    queryKey: ['wp-users', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/users`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((r: { data: WpUser[] }) => r.data ?? []),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => { setShowAddForm(!showAddForm) }}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
        >
          + Add User
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
          <p className="mb-4 font-semibold text-tundra-ink">Add WordPress User</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Username</label>
              <input
                type="text"
                value={newUser.login}
                onChange={(e) => { setNewUser((u) => ({ ...u, login: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => { setNewUser((u) => ({ ...u, email: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Password</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => { setNewUser((u) => ({ ...u, password: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => { setNewUser((u) => ({ ...u, role: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
              >
                {['administrator', 'editor', 'author', 'contributor', 'subscriber'].map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(false) }}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => toast.info('User creation coming soon')}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
            >
              Create User
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tundra-ink-200 py-16 text-center">
          <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <p className="text-sm text-tundra-ink-400">No WordPress users found.</p>
          <p className="mt-1 text-xs text-tundra-ink-300">User sync requires WP-CLI on the target server.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Registered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-tundra-ink">{u.display_name}</p>
                    <p className="text-xs text-tundra-ink-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                      u.role === 'administrator'
                        ? 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700'
                        : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-400">{u.registered}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toast.info('Password change coming soon')}
                        className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                      >
                        Change Password
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.info('User delete coming soon')}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Backups tab ───────────────────────────────────────────────────────────────

function BackupsTab({ installId }: { installId: string }) {
  const { data: backups = [], isLoading } = useQuery<WpBackup[]>({
    queryKey: ['wp-backups', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/backups`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((r: { data: WpBackup[] }) => r.data ?? []),
  })

  const fmtSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Backup actions + schedule */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Create Backup</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-tundra-ink-400">Create a full backup including files and database.</p>
            <textarea
              placeholder="Optional note…"
              rows={2}
              className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
            />
            <button
              type="button"
              onClick={() => toast.info('Backup creation coming soon')}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
            >
              Create Backup Now
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Auto Backup Schedule</span>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: 'Frequency', control: (
                <select className="rounded-lg border border-tundra-ink-200 px-2 py-1 text-xs focus:outline-none">
                  {['Daily', 'Weekly', 'Monthly', 'Disabled'].map((o) => <option key={o}>{o}</option>)}
                </select>
              )},
              { label: 'Retention', control: (
                <select className="rounded-lg border border-tundra-ink-200 px-2 py-1 text-xs focus:outline-none">
                  {['7 backups', '14 backups', '30 backups'].map((o) => <option key={o}>{o}</option>)}
                </select>
              )},
            ].map(({ label, control }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-tundra-ink-500">{label}</span>
                {control}
              </div>
            ))}
            <button
              type="button"
              onClick={() => toast.info('Schedule save coming soon')}
              className="w-full rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
            >
              Save Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Backup history */}
      <div className="lg:col-span-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Backup History</p>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-tundra-ink-100" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-tundra-ink-200 py-16 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            <p className="text-sm text-tundra-ink-400">No backups yet.</p>
            <p className="mt-1 text-xs text-tundra-ink-300">Create your first backup to enable restore points.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-tundra-ink-500">{b.created_at}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-tundra-ink-200 px-2 py-0.5 text-xs capitalize text-tundra-ink-500">{b.type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{fmtSize(b.size_bytes)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        b.status === 'complete' ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' :
                        b.status === 'running'  ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                                                  'border-red-200 bg-red-50 text-red-600'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => toast.info('Restore coming soon')}
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => toast.info('Download coming soon')}
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ install, installId }: { install: WpInstallation; installId: string }) {
  const [coreUpdates, setCoreUpdates] = useState<'disabled' | 'minor' | 'all'>('minor')
  const [pluginUpdates, setPluginUpdates] = useState(false)
  const [themeUpdates, setThemeUpdates] = useState(false)
  const [wpCron, setWpCron] = useState(true)
  const [phpVersion, setPhpVersion] = useState(install.php_version ?? '8.2')

  const patchSetting = (key: string, value: unknown) => {
    void api(`/wordpress/installations/${installId}/settings`, {
      method: 'PATCH',
      body: { [key]: value },
    }).catch(() => null)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Auto-updates */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Auto-Update Configuration</span>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-tundra-ink">WordPress Core</p>
              <div className="flex gap-1">
                {(['disabled', 'minor', 'all'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setCoreUpdates(v); patchSetting('core_auto_update', v) }}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors ${
                      coreUpdates === v
                        ? 'border-tundra-lichen bg-tundra-lichen text-white'
                        : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
                    }`}
                  >
                    {v === 'minor' ? 'Minor only' : v}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-tundra-ink-100">
              <Toggle
                label="Plugin Auto-Updates"
                description="Automatically update all plugins"
                checked={pluginUpdates}
                onChange={(v) => { setPluginUpdates(v); patchSetting('plugin_auto_update', v) }}
              />
              <Toggle
                label="Theme Auto-Updates"
                description="Automatically update all themes"
                checked={themeUpdates}
                onChange={(v) => { setThemeUpdates(v); patchSetting('theme_auto_update', v) }}
              />
              <Toggle
                label="WP-Cron (built-in scheduler)"
                description="Disable if using real system cron"
                checked={wpCron}
                onChange={(v) => { setWpCron(v); patchSetting('wp_cron', v) }}
              />
            </div>
          </div>
        </div>

        {/* PHP version */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Version</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-1">
              {['8.0', '8.1', '8.2', '8.3'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setPhpVersion(v) }}
                  className={`rounded-lg border py-2 text-sm font-mono font-medium transition-colors ${
                    phpVersion === v
                      ? 'border-tundra-lichen bg-tundra-lichen text-white'
                      : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
                  }`}
                >
                  PHP {v}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { patchSetting('php_version', phpVersion); toast.success('PHP version queued for update') }}
              className="w-full rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
            >
              Apply PHP {phpVersion}
            </button>
          </div>
        </div>
      </div>

      {/* WP settings */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">WordPress Settings</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'Site URL',     value: install.site_url ?? '—' },
              { label: 'WP Version',   value: install.wp_version ?? '—' },
              { label: 'PHP Version',  value: phpVersion },
              { label: 'Install Path', value: install.wp_path, mono: true },
              { label: 'Multisite',    value: install.multisite ? 'Enabled' : 'Disabled' },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
                <span className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-tundra-ink`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Tools</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'WP-CLI Console',     desc: 'Run WP-CLI commands interactively', action: 'Open' },
              { label: 'Regenerate Salts',   desc: 'Refresh wp-config.php auth keys and salts', action: 'Regenerate' },
              { label: 'Flush Rewrite Rules', desc: 'Rebuild permalink structure', action: 'Flush' },
              { label: 'Clear Object Cache', desc: 'Flush Redis / Memcached object cache', action: 'Clear' },
              { label: 'Export wp-config.php', desc: 'Download a sanitized copy', action: 'Export' },
            ].map(({ label, desc, action }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-tundra-ink">{label}</p>
                  <p className="text-xs text-tundra-ink-400">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toast.info(`${label} coming soon`)}
                  className="shrink-0 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                >
                  {action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Danger Zone tab ───────────────────────────────────────────────────────────

function DangerTab({ install }: { install: WpInstallation }) {
  const [confirmed, setConfirmed] = useState('')

  const removeMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${install.id}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.href = '/wordpress' },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  return (
    <div className="space-y-4">
      {/* Reset */}
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
        <p className="mb-1 font-semibold text-yellow-800">Reset WordPress</p>
        <p className="mb-3 text-sm text-yellow-700">
          Reinstall WordPress core files without touching the database or uploads. Useful to recover from
          a corrupted core.
        </p>
        <button
          type="button"
          onClick={() => toast.info('Reset coming soon')}
          className="rounded-lg border border-yellow-400 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 transition-colors"
        >
          Reset WordPress Core
        </button>
      </div>

      {/* Remove */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="mb-3 flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="font-semibold text-red-800">Remove WordPress Installation</p>
            <p className="mt-1 text-sm text-red-700">
              All WordPress files at{' '}
              <code className="rounded bg-red-100 px-1 font-mono">{install.wp_path}</code>{' '}
              and the database{' '}
              <code className="rounded bg-red-100 px-1 font-mono">{install.db_name ?? 'unknown'}</code>{' '}
              will be permanently deleted on the next agent sync. This cannot be undone.
            </p>
          </div>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-red-700">
          Type <code className="rounded bg-red-100 px-1 font-mono">remove</code> to confirm
        </label>
        <input
          type="text"
          value={confirmed}
          onChange={(e) => { setConfirmed(e.target.value) }}
          placeholder="remove"
          className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={confirmed !== 'remove' || removeMut.isPending}
          onClick={() => { removeMut.mutate() }}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {removeMut.isPending ? 'Removing…' : 'Remove WordPress Installation'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'plugins' | 'themes' | 'database' | 'security' | 'users' | 'backups' | 'settings' | 'danger'

function WpInstallDetailPage() {
  const { installId } = Route.useParams()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`)
        .then((r) => r.json()),
  })

  const { data: plugins = [], isLoading: pluginsLoading } = useQuery<WpPlugin[]>({
    queryKey: ['wp-plugins', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins`)
        .then((r) => r.json())
        .then((r: { data: WpPlugin[] }) => r.data),
  })

  const { data: themes = [], isLoading: themesLoading } = useQuery<WpTheme[]>({
    queryKey: ['wp-themes', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes`)
        .then((r) => r.json())
        .then((r: { data: WpTheme[] }) => r.data),
  })

  const updateCount = [...plugins, ...themes].filter((x) => x.update_available).length

  const TABS: Array<{ id: Tab; label: string; badge?: number | string; danger?: boolean }> = [
    { id: 'overview',  label: 'Overview' },
    { id: 'plugins',   label: 'Plugins',  badge: plugins.length || undefined },
    { id: 'themes',    label: 'Themes',   badge: themes.length || undefined },
    { id: 'database',  label: 'Database' },
    { id: 'security',  label: 'Security' },
    { id: 'users',     label: 'Users' },
    { id: 'backups',   label: 'Backups' },
    { id: 'settings',  label: 'Settings' },
    { id: 'danger',    label: 'Danger Zone', danger: true },
  ]

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
            <a
              href={install.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-tundra-aurora hover:underline"
            >
              {install.site_url} ↗
            </a>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tundra-ink-400">
            {install?.wp_version && <span>WordPress {install.wp_version}</span>}
            {(install?.php_version ?? '8.2') && (
              <><span className="text-tundra-ink-200">·</span><span>PHP {install?.php_version ?? '8.2'}</span></>
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
        {/* Top-right quick actions */}
        <div className="flex shrink-0 gap-2">
          {install?.site_url && (
            <a
              href={`${install.site_url}/wp-admin`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#21759B] px-3 py-2 text-xs font-medium text-white hover:bg-[#1a6284] transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
              </svg>
              WP Admin
            </a>
          )}
          <a
            href={install?.site_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-2 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
            </svg>
            View Site
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0.5 overflow-x-auto border-b border-tundra-ink-200">
        {TABS.map(({ id, label, badge, danger }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id) }}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium -mb-px transition-colors ${
              danger
                ? tab === id
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-tundra-ink-400 hover:text-red-500'
                : tab === id
                  ? 'border-tundra-lichen text-tundra-lichen-700'
                  : 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
            }`}
          >
            {label}
            {badge !== undefined && (
              <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs text-tundra-ink-500">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview'  && install && <OverviewTab install={install} plugins={plugins} themes={themes} />}
      {tab === 'plugins'   && <PluginsTab  installId={installId} plugins={plugins} isLoading={pluginsLoading} />}
      {tab === 'themes'    && <ThemesTab   installId={installId} themes={themes}   isLoading={themesLoading} />}
      {tab === 'database'  && install && <DatabaseTab  install={install} />}
      {tab === 'security'  && <SecurityTab  installId={installId} />}
      {tab === 'users'     && <UsersTab     installId={installId} />}
      {tab === 'backups'   && <BackupsTab   installId={installId} />}
      {tab === 'settings'  && install && <SettingsTab  install={install} installId={installId} />}
      {tab === 'danger'    && install && <DangerTab    install={install} />}
    </div>
  )
}
