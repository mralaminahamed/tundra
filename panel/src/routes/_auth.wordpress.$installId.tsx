import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export const Route = createFileRoute('/_auth/wordpress/$installId')({
  component: WpInstallDetailPage,
})

interface WpPlugin {
  id: number
  slug: string
  name: string
  version: string | null
  author: string | null
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
  active: boolean
  update_available: boolean
  new_version: string | null
  screenshot_url: string | null
}

interface WpInstallation {
  id: string
  site_title: string | null
  site_url: string | null
  wp_version: string | null
  wp_path: string
  state: string
}

function WpInstallDetailPage() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'plugins' | 'themes' | 'danger'>('plugins')
  const [pluginSlug, setPluginSlug] = useState('')
  const [themeSlug, setThemeSlug] = useState('')

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
  })

  const { data: plugins = [], isLoading: pluginsLoading } = useQuery<WpPlugin[]>({
    queryKey: ['wp-plugins', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins`)
        .then((r) => r.json())
        .then((r: { data: WpPlugin[] }) => r.data),
    enabled: tab === 'plugins',
  })

  const { data: themes = [], isLoading: themesLoading } = useQuery<WpTheme[]>({
    queryKey: ['wp-themes', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes`)
        .then((r) => r.json())
        .then((r: { data: WpTheme[] }) => r.data),
    enabled: tab === 'themes',
  })

  const installPluginMutation = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, activate: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
      setPluginSlug('')
    },
  })

  const removePluginMutation = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/${slug}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] })
    },
  })

  const installThemeMutation = useMutation({
    mutationFn: ({ slug, activate }: { slug: string; activate: boolean }) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, activate }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
      setThemeSlug('')
    },
  })

  const activateThemeMutation = useMutation({
    mutationFn: (slug: string) =>
      fetch(
        `/api/v1/wordpress/installations/${installId}/themes/${slug}/activate`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
    },
  })

  const removeThemeMutation = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/${slug}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-themes', installId] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      window.location.href = '/wordpress'
    },
  })

  const tabs = ['plugins', 'themes', 'danger'] as const

  return (
    <div className="p-6">
      <div className="mb-6">
        <a href="/wordpress" className="text-sm text-stone-500 hover:text-stone-700">
          ← WordPress
        </a>
        <h1 className="mt-2 text-2xl font-bold text-stone-900">
          {install?.site_title ?? installId}
        </h1>
        {install?.site_url && (
          <p className="mt-1 text-sm text-stone-500">{install.site_url}</p>
        )}
      </div>

      <div className="mb-6 flex gap-1 border-b border-stone-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-stone-900 text-stone-900'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t === 'plugins'
              ? `Plugins (${String(plugins.length)})`
              : t === 'themes'
                ? `Themes (${String(themes.length)})`
                : 'Danger Zone'}
          </button>
        ))}
      </div>

      {tab === 'plugins' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Plugin slug (e.g. woocommerce, yoast-seo)"
              value={pluginSlug}
              onChange={(e) => { setPluginSlug(e.target.value); }}
              className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
            <button
              disabled={!pluginSlug}
              onClick={() => { installPluginMutation.mutate(pluginSlug); }}
              className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-40"
            >
              Install
            </button>
          </div>

          {pluginsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-stone-100" />
              ))}
            </div>
          ) : plugins.length === 0 ? (
            <p className="text-sm text-stone-400">No plugins installed.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Plugin</th>
                    <th className="px-4 py-3 text-left">Version</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {plugins.map((p) => (
                    <tr key={p.slug} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-stone-400">{p.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {p.version ?? '—'}
                        {p.update_available && (
                          <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
                            {p.new_version} available
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            p.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {p.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { removePluginMutation.mutate(p.slug); }}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'themes' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Theme slug (e.g. astra, twentytwentyfour)"
              value={themeSlug}
              onChange={(e) => { setThemeSlug(e.target.value); }}
              className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
            <button
              disabled={!themeSlug}
              onClick={() =>
                { installThemeMutation.mutate({ slug: themeSlug, activate: false }); }
              }
              className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50 disabled:opacity-40"
            >
              Install
            </button>
            <button
              disabled={!themeSlug}
              onClick={() =>
                { installThemeMutation.mutate({ slug: themeSlug, activate: true }); }
              }
              className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:opacity-40"
            >
              Install &amp; Activate
            </button>
          </div>

          {themesLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-stone-100" />
              ))}
            </div>
          ) : themes.length === 0 ? (
            <p className="text-sm text-stone-400">No themes installed.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Theme</th>
                    <th className="px-4 py-3 text-left">Version</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {themes.map((t) => (
                    <tr key={t.slug} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-stone-400">{t.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {t.version ?? '—'}
                        {t.update_available && (
                          <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
                            {t.new_version} available
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            t.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {t.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {!t.active && (
                            <button
                              onClick={() => { activateThemeMutation.mutate(t.slug); }}
                              className="rounded border border-stone-200 px-2 py-1 text-xs hover:bg-stone-100"
                            >
                              Activate
                            </button>
                          )}
                          {!t.active && (
                            <button
                              onClick={() => { removeThemeMutation.mutate(t.slug); }}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'danger' && (
        <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="mb-2 font-semibold text-red-800">Remove WordPress</h2>
          <p className="mb-4 text-sm text-red-700">
            This will mark the WordPress installation for removal. On the next agent
            sync, all WordPress files in{' '}
            <code className="rounded bg-red-100 px-1">{install?.wp_path}</code> will
            be deleted and the database dropped. This action cannot be undone.
          </p>
          <button
            onClick={() => {
              if (
                confirm(
                  'Permanently remove this WordPress installation? All files and database will be deleted.',
                )
              ) {
                removeMutation.mutate()
              }
            }}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Remove WordPress Installation
          </button>
        </div>
      )}
    </div>
  )
}
