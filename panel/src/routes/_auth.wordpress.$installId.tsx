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
  wp_path: string
  db_name: string | null
  db_host: string | null
  admin_email: string | null
  site_title: string | null
  site_url: string | null
  multisite: boolean
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

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ install, plugins, themes }: {
  install: WpInstallation
  plugins: WpPlugin[]
  themes: WpTheme[]
}) {
  const activeTheme = themes.find((t) => t.active)
  const activeCount = plugins.filter((p) => p.active).length
  const updateCount = [...plugins, ...themes].filter((x) => x.update_available).length

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Stats */}
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Plugins',        value: plugins.length,  color: 'text-tundra-ink' },
            { label: 'Active',         value: activeCount,     color: 'text-tundra-lichen-700' },
            { label: 'Inactive',       value: plugins.length - activeCount, color: 'text-tundra-ink-400' },
            { label: 'Updates',        value: updateCount,     color: updateCount > 0 ? 'text-yellow-600' : 'text-tundra-ink-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-tundra-ink-200 bg-white p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="mt-0.5 text-xs text-tundra-ink-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Installation details */}
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Installation Details</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'WP Version',   value: install.wp_version ?? '—' },
              { label: 'Path',         value: install.wp_path, mono: true },
              { label: 'Database',     value: install.db_name ?? '—', mono: true },
              { label: 'DB Host',      value: install.db_host ?? 'localhost', mono: true },
              { label: 'Admin Email',  value: install.admin_email ?? '—' },
              { label: 'Multisite',    value: install.multisite ? 'Yes' : 'No' },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
                <span className={mono ? 'font-mono text-tundra-ink' : 'text-tundra-ink'}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plugins needing updates */}
        {updateCount > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="mb-2 text-sm font-semibold text-yellow-800">
              {updateCount} update{updateCount !== 1 ? 's' : ''} available
            </p>
            <div className="space-y-1">
              {[...plugins, ...themes]
                .filter((x) => x.update_available)
                .map((x) => (
                  <div key={x.slug} className="flex items-center justify-between text-xs text-yellow-700">
                    <span>{x.name}</span>
                    <span className="font-mono">{x.new_version}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Active theme */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Active Theme</p>
        {activeTheme ? (
          <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
            {activeTheme.screenshot_url ? (
              <img
                src={activeTheme.screenshot_url}
                alt={activeTheme.name}
                className="w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="flex h-36 items-center justify-center bg-tundra-ink-50">
                <svg className="h-10 w-10 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                </svg>
              </div>
            )}
            <div className="p-4">
              <p className="font-semibold text-tundra-ink">{activeTheme.name}</p>
              <p className="mt-0.5 text-xs text-tundra-ink-400">
                v{activeTheme.version ?? '—'}{activeTheme.author ? ` · ${activeTheme.author}` : ''}
              </p>
              {activeTheme.update_available && activeTheme.new_version && (
                <div className="mt-2">
                  <UpdateBadge newVersion={activeTheme.new_version} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-tundra-ink-200 p-6 text-center text-sm text-tundra-ink-400">
            No active theme
          </div>
        )}
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
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      toast.success('Plugin updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/${slug}`, {
        method: 'DELETE',
      }),
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
    if (q && !p.name.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q)) return false
    return true
  })

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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search plugins…"
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="h-8 w-48 rounded-lg border border-tundra-ink-200 px-3 text-xs focus:border-tundra-lichen focus:outline-none"
        />
        <div className="flex gap-1">
          {(['all', 'active', 'inactive'] as const).map((f) => (
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
              {f}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-tundra-ink-400">{filtered.length} plugins</span>
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
                      <div className="mt-0.5">
                        <UpdateBadge newVersion={p.new_version} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500 text-xs">{p.author ?? '—'}</td>
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
      {/* Install form */}
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
              {/* Screenshot */}
              {t.screenshot_url ? (
                <div className="relative h-36 overflow-hidden bg-tundra-ink-50">
                  <img
                    src={t.screenshot_url}
                    alt={t.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      img.style.display = 'none'
                      img.parentElement!.classList.add('flex', 'items-center', 'justify-center')
                    }}
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
                  {t.version ? `v${t.version}` : '—'}
                  {t.author ? ` · ${t.author}` : ''}
                </p>
                {t.update_available && t.new_version && (
                  <div className="mt-2">
                    <UpdateBadge newVersion={t.new_version} />
                  </div>
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

// ── Danger Zone tab ───────────────────────────────────────────────────────────

function DangerTab({ install }: { install: WpInstallation }) {
  const [confirmed, setConfirmed] = useState('')

  const removeMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${install.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      window.location.href = '/wordpress'
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="mb-3 flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="font-semibold text-red-800">Remove WordPress Installation</p>
            <p className="mt-1 text-sm text-red-700">
              On the next agent sync, all WordPress files at{' '}
              <code className="rounded bg-red-100 px-1 font-mono">{install.wp_path}</code>{' '}
              will be deleted and the database{' '}
              <code className="rounded bg-red-100 px-1 font-mono">{install.db_name ?? 'unknown'}</code>{' '}
              will be dropped. This action is irreversible.
            </p>
          </div>
        </div>

        <div className="mt-4">
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
        </div>

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

type Tab = 'overview' | 'plugins' | 'themes' | 'danger'

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

  const TABS: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'plugins',  label: 'Plugins',  badge: plugins.length || undefined },
    { id: 'themes',   label: 'Themes',   badge: themes.length || undefined },
    { id: 'danger',   label: 'Danger Zone' },
  ]

  return (
    <div>
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tundra-ink-400">
            {install?.wp_version && <span>WordPress {install.wp_version}</span>}
            {install?.admin_email && <><span className="text-tundra-ink-200">·</span><span>{install.admin_email}</span></>}
          </div>
          {install?.error_message && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {install.error_message}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-0.5 border-b border-tundra-ink-200">
        {TABS.map(({ id, label, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              id === 'danger'
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

      {tab === 'overview' && install && (
        <OverviewTab install={install} plugins={plugins} themes={themes} />
      )}
      {tab === 'plugins' && (
        <PluginsTab installId={installId} plugins={plugins} isLoading={pluginsLoading} />
      )}
      {tab === 'themes' && (
        <ThemesTab installId={installId} themes={themes} isLoading={themesLoading} />
      )}
      {tab === 'danger' && install && (
        <DangerTab install={install} />
      )}
    </div>
  )
}
