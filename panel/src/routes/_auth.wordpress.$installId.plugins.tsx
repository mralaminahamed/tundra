import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { UpdateBadge, type WpPlugin } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/plugins')({
  component: WpPluginsTab,
})

function WpPluginsTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [slugInput, setSlugInput] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'updates'>('all')

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
    onError: () => toast.info('Update coming soon'),
  })

  const updateAllMut = useMutation({
    mutationFn: () =>
      api(`/wordpress/installations/${installId}/plugins/update-all`, { method: 'POST' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); toast.success('All plugins updated') },
    onError: () => toast.info('Bulk update coming soon'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/plugins/${slug}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-plugins', installId] }); toast.success('Plugin removed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
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
        {hasUpdates && (
          <button type="button" onClick={() => { updateAllMut.mutate() }} disabled={updateAllMut.isPending}
            className="ml-auto rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50">
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
