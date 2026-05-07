import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { UpdateBadge, type WpPlugin } from '@/components/wp-shared'
import { SearchIcon, LoadingIcon, RefreshIcon } from '@/components/icons'

interface WpOrgPlugin {
  slug: string
  name: string
  version: string
  author: string
  short_description: string
  icons?: { '1x'?: string; '2x'?: string; svg?: string; default?: string }
  downloaded: number
  rating: number
}

export const Route = createFileRoute('/_auth/wordpress/$installId/plugins')({
  component: WpPluginsTab,
})

function PluginIcon({ slug }: { slug: string; name: string }) {
  const iconUrl = `https://ps.w.org/${slug}/assets/icon-128x128.png`
  return (
    <img
      src={iconUrl}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded-lg object-contain bg-tundra-ink-50 p-0.5"
      onError={(e) => {
        const el = e.currentTarget
        el.style.display = 'none'
        const next = el.nextElementSibling as HTMLElement | null
        if (next) next.style.display = 'flex'
      }}
    />
  )
}

function WpPluginsTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [slugInput, setSlugInput] = useState('')
  const [wpOrgQuery, setWpOrgQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'updates'>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounce the WP.org query
  useEffect(() => {
    const t = setTimeout(() => setWpOrgQuery(slugInput.trim()), 400)
    return () => clearTimeout(t)
  }, [slugInput])

  const { data: plugins = [], isLoading } = useQuery<WpPlugin[]>({
    queryKey: ['wp-plugins', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins`)
        .then((r) => r.json())
        .then((r: { data: WpPlugin[] }) => r.data),
  })

  const installMut = useMutation({
    mutationFn: (slug: string) =>
      api(`/wordpress/installations/${installId}/plugins`, { method: 'POST', body: { slug, activate: true } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); setSlugInput(''); toast.success('Plugin installed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Install failed'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ slug, active }: { slug: string; active: boolean }) =>
      api(`/wordpress/installations/${installId}/plugins/${slug}`, { method: 'PATCH', body: { active: !active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: (slug: string) =>
      api(`/wordpress/installations/${installId}/plugins/${slug}/update`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); toast.success('Plugin updated') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const updateAllMut = useMutation({
    mutationFn: () =>
      api(`/wordpress/installations/${installId}/plugins/update-all`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); toast.success('All plugins updated') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/${slug}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); toast.success('Plugin removed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const syncMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/sync`, { method: 'POST' }).then(async (r) => {
        if (!r.ok) throw new Error('Sync failed')
        return r.json() as Promise<{ synced: number }>
      }),
    onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); toast.success(`Synced ${d.synced} plugins`) },
    onError: () => toast.error('Sync failed'),
  })

  const { data: wpOrgResults, isFetching: wpOrgLoading } = useQuery<WpOrgPlugin[]>({
    queryKey: ['wporg-search', wpOrgQuery],
    enabled: wpOrgQuery.length >= 2,
    queryFn: async () => {
      const url = `https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[search]=${encodeURIComponent(wpOrgQuery)}&request[per_page]=8&request[fields][icons]=1&request[fields][short_description]=1&request[fields][rating]=1&request[fields][downloaded]=1`
      const res = await fetch(url)
      const data = await res.json()
      return (data.plugins ?? []) as WpOrgPlugin[]
    },
    staleTime: 30_000,
  })

  const q = search.toLowerCase()
  const filtered = plugins.filter((p) => {
    if (filter === 'active' && !p.active) return false
    if (filter === 'inactive' && p.active) return false
    if (filter === 'updates' && !p.update_available) return false
    if (q && !p.name.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q)) return false
    return true
  })
  const hasUpdates = plugins.some((p) => p.update_available)
  const updateCount = plugins.filter((p) => p.update_available).length

  return (
    <div className="space-y-4">
      {/* Install form with WP.org search */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tundra-ink-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search WordPress.org or paste slug — e.g. woocommerce"
            value={slugInput}
            onChange={(e) => { setSlugInput(e.target.value); setShowDropdown(true) }}
            onFocus={() => { if (slugInput.length >= 2) setShowDropdown(true) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && slugInput) { installMut.mutate(slugInput); setShowDropdown(false) }
              if (e.key === 'Escape') setShowDropdown(false)
            }}
            className="h-9 w-full rounded-lg border border-tundra-ink-200 pl-8 pr-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
          />
          {/* Dropdown */}
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
                wpOrgResults.map((p) => {
                  const icon = p.icons?.svg ?? p.icons?.['2x'] ?? p.icons?.['1x'] ?? p.icons?.default
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-tundra-ink-50 transition-colors border-b border-tundra-ink-100 last:border-0"
                      onClick={() => {
                        setSlugInput(p.slug)
                        setShowDropdown(false)
                        installMut.mutate(p.slug)
                      }}
                    >
                      {icon ? (
                        <img src={icon} alt="" className="mt-0.5 h-10 w-10 shrink-0 rounded-lg object-contain bg-tundra-ink-50 p-1" />
                      ) : (
                        <div className="mt-0.5 h-10 w-10 shrink-0 rounded-lg bg-tundra-ink-100 flex items-center justify-center text-tundra-ink-300 text-lg font-bold">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-sm text-tundra-ink-900">{p.name}</span>
                          <span className="shrink-0 text-xs text-tundra-ink-400">v{p.version}</span>
                          {p.rating > 0 && (
                            <span className="shrink-0 text-xs text-yellow-600">★ {(p.rating / 20).toFixed(1)}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-tundra-ink-500 line-clamp-2">{p.short_description}</p>
                        <p className="mt-0.5 text-xs text-tundra-ink-400">by {p.author.replace(/<[^>]+>/g, '')}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate(slugInput); setShowDropdown(false) }}
          className="shrink-0 rounded-lg bg-tundra-lichen px-4 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
        >
          {installMut.isPending ? <LoadingIcon size={14} className="animate-spin" /> : 'Install & Activate'}
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
          {(['all', 'active', 'inactive', 'updates'] as const).map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f) }}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? 'border-tundra-lichen bg-tundra-lichen text-white'
                  : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen hover:text-tundra-lichen-700'
              }`}>
              {f === 'updates' ? `Updates${updateCount > 0 ? ` (${updateCount})` : ''}` : f}
            </button>
          ))}
        </div>
        <span className="text-xs text-tundra-ink-400">{filtered.length} plugins</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            title="Sync from WordPress installation"
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50"
          >
            <RefreshIcon size={12} className={syncMut.isPending ? 'animate-spin' : ''} />
            {syncMut.isPending ? 'Syncing…' : 'Refresh'}
          </button>
          {hasUpdates && (
            <button type="button" onClick={() => { updateAllMut.mutate() }} disabled={updateAllMut.isPending}
              className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50">
              {updateAllMut.isPending ? 'Updating…' : 'Update All'}
            </button>
          )}
        </div>
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
                    <div className="flex items-center gap-3">
                      <PluginIcon slug={p.slug} name={p.name} />
                      <div>
                        <p className="font-medium text-tundra-ink">{p.name}</p>
                        <p className="font-mono text-xs text-tundra-ink-400">{p.slug}</p>
                      </div>
                    </div>
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
                        <button type="button" onClick={() => { updateMut.mutate(p.slug) }} disabled={updateMut.isPending}
                          className="rounded border border-yellow-300 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50">
                          Update
                        </button>
                      )}
                      <button type="button" onClick={() => { toggleMut.mutate({ slug: p.slug, active: p.active }) }} disabled={toggleMut.isPending}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          p.active
                            ? 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'
                            : 'border-tundra-lichen-300 text-tundra-lichen-700 hover:bg-tundra-lichen-50'
                        }`}>
                        {p.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button type="button" onClick={() => { removeMut.mutate(p.slug) }} disabled={removeMut.isPending}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
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
