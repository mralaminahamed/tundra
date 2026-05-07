import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { UpdateBadge, type WpTheme } from '@/components/wp-shared'
import { RefreshIcon, SearchIcon, LoadingIcon } from '@/components/icons'

interface WpOrgTheme {
  slug: string
  name: string
  version: string
  author: { display_name: string } | string
  screenshot_url: string
  description: string
  rating: number
}

export const Route = createFileRoute('/_auth/wordpress/$installId/themes')({
  component: WpThemesTab,
})

function WpThemesTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [slugInput, setSlugInput] = useState('')
  const [wpOrgQuery, setWpOrgQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setWpOrgQuery(slugInput.trim()), 400)
    return () => clearTimeout(t)
  }, [slugInput])

  const { data: themes = [], isLoading } = useQuery<WpTheme[]>({
    queryKey: ['wp-themes', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes`)
        .then((r) => r.json())
        .then((r: { data: WpTheme[] }) => r.data),
  })

  const installMut = useMutation({
    mutationFn: ({ slug, activate }: { slug: string; activate: boolean }) =>
      api(`/wordpress/installations/${installId}/themes`, { method: 'POST', body: { slug, activate } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-themes', installId] }); setSlugInput(''); toast.success('Theme installed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Install failed'),
  })

  const activateMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/${slug}/activate`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-themes', installId] }); toast.success('Theme activated') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: (slug: string) =>
      api(`/wordpress/installations/${installId}/themes/${slug}/update`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-themes', installId] }); toast.success('Theme updated') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/${slug}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-themes', installId] }); toast.success('Theme removed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const syncMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/sync`, { method: 'POST' }).then(async (r) => {
        if (!r.ok) throw new Error('Sync failed')
        return r.json() as Promise<{ synced: number }>
      }),
    onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['wp-themes', installId] }); toast.success(`Synced ${d.synced} themes`) },
    onError: () => toast.error('Sync failed'),
  })

  const { data: wpOrgResults, isFetching: wpOrgLoading } = useQuery<WpOrgTheme[]>({
    queryKey: ['wporg-theme-search', wpOrgQuery],
    enabled: wpOrgQuery.length >= 2,
    queryFn: async () => {
      const url = `https://api.wordpress.org/themes/info/1.2/?action=query_themes&request[search]=${encodeURIComponent(wpOrgQuery)}&request[per_page]=8&request[fields][screenshot_url]=1&request[fields][description]=1&request[fields][rating]=1`
      const res = await fetch(url)
      const data = await res.json()
      return (data.themes ?? []) as WpOrgTheme[]
    },
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tundra-ink-400" />
          <input
            ref={inputRef}
            type="text"
          value={slugInput}
          onChange={(e) => { setSlugInput(e.target.value); setShowDropdown(true) }}
          onFocus={() => { if (slugInput.length >= 2) setShowDropdown(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && slugInput) { installMut.mutate({ slug: slugInput, activate: true }); setShowDropdown(false) }
            if (e.key === 'Escape') setShowDropdown(false)
          }}
          placeholder="Search WordPress.org or paste slug — e.g. astra, generatepress"
          className="h-9 w-full rounded-lg border border-tundra-ink-200 pl-8 pr-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
        />
          {/* WP.org dropdown */}
          {showDropdown && slugInput.length >= 2 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-tundra-ink-200 bg-white shadow-lg"
            >
              {wpOrgLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-tundra-ink-400">
                  <LoadingIcon size={14} className="animate-spin" /> Searching WordPress.org…
                </div>
              ) : !wpOrgResults || wpOrgResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-tundra-ink-400">
                  No results. Will try to install <strong>{slugInput}</strong> directly.
                </div>
              ) : (
                wpOrgResults.map((t) => {
                  const authorName = typeof t.author === 'string' ? t.author : t.author?.display_name ?? ''
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-tundra-ink-50 transition-colors border-b border-tundra-ink-100 last:border-0"
                      onClick={() => {
                        setSlugInput(t.slug)
                        setShowDropdown(false)
                        installMut.mutate({ slug: t.slug, activate: true })
                      }}
                    >
                      {t.screenshot_url ? (
                        <img src={t.screenshot_url} alt="" className="mt-0.5 h-12 w-20 shrink-0 rounded-lg object-cover bg-tundra-ink-50" />
                      ) : (
                        <div className="mt-0.5 h-12 w-20 shrink-0 rounded-lg bg-tundra-ink-100 flex items-center justify-center text-tundra-ink-300 text-xs font-bold">
                          {t.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-sm text-tundra-ink-900">{t.name}</span>
                          <span className="shrink-0 text-xs text-tundra-ink-400">v{t.version}</span>
                          {t.rating > 0 && <span className="shrink-0 text-xs text-yellow-600">★ {(t.rating / 20).toFixed(1)}</span>}
                        </div>
                        <p className="mt-0.5 text-xs text-tundra-ink-500 line-clamp-2">{t.description?.replace(/<[^>]+>/g, '')}</p>
                        <p className="mt-0.5 text-xs text-tundra-ink-400">by {authorName.replace(/<[^>]+>/g, '')}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
        <button type="button" disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate({ slug: slugInput, activate: false }); setShowDropdown(false) }}
          className="shrink-0 rounded-lg border border-tundra-ink-200 px-4 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors">
          Install
        </button>
        <button type="button" disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate({ slug: slugInput, activate: true }); setShowDropdown(false) }}
          className="shrink-0 rounded-lg bg-tundra-lichen px-4 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
          {installMut.isPending ? <LoadingIcon size={14} className="animate-spin" /> : 'Install & Activate'}
        </button>
        <button
          type="button"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          title="Sync from WordPress installation"
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50"
        >
          <RefreshIcon size={13} className={syncMut.isPending ? 'animate-spin' : ''} />
          {syncMut.isPending ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : themes.length === 0 ? (
        <div className="rounded-xl border border-tundra-ink-200 py-12 text-center text-sm text-tundra-ink-400">
          No themes installed.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50">
              <tr>
                {['THEME', 'VERSION', 'AUTHOR', 'STATUS', 'ACTIONS'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {themes.map((t) => (
                <tr key={t.slug} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {t.screenshot_url ? (
                        <img src={t.screenshot_url} alt={t.name}
                          className="h-10 w-16 shrink-0 rounded-lg object-cover bg-tundra-ink-50"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="h-10 w-16 shrink-0 rounded-lg bg-tundra-ink-100 flex items-center justify-center">
                          <svg className="h-5 w-5 text-tundra-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12-1a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                          </svg>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-tundra-ink">{t.name}</p>
                        <p className="font-mono text-xs text-tundra-ink-400">{t.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-tundra-ink-500">{t.version ?? '—'}</span>
                    {t.update_available && t.new_version && (
                      <div className="mt-0.5"><UpdateBadge newVersion={t.new_version} /></div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-500">{t.author ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      t.active
                        ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700'
                        : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
                    }`}>
                      {t.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {t.update_available && (
                        <button type="button" onClick={() => updateMut.mutate(t.slug)} disabled={updateMut.isPending}
                          className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 transition-colors">
                          Update
                        </button>
                      )}
                      {!t.active && (
                        <button type="button" onClick={() => activateMut.mutate(t.slug)} disabled={activateMut.isPending}
                          className="rounded-lg bg-tundra-lichen px-3 py-1 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
                          Activate
                        </button>
                      )}
                      {!t.active && (
                        <button type="button" onClick={() => removeMut.mutate(t.slug)} disabled={removeMut.isPending}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
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
  )
}
