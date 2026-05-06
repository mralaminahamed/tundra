import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { UpdateBadge, type WpTheme } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/themes')({
  component: WpThemesTab,
})

function WpThemesTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [slugInput, setSlugInput] = useState('')

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
    onError: () => toast.info('Update coming soon'),
  })

  const removeMut = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/themes/${slug}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wp-themes', installId] }); toast.success('Theme removed') },
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
        <button type="button" disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate({ slug: slugInput, activate: false }) }}
          className="rounded-lg border border-tundra-ink-200 px-4 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors">
          Install
        </button>
        <button type="button" disabled={!slugInput || installMut.isPending}
          onClick={() => { installMut.mutate({ slug: slugInput, activate: true }) }}
          className="rounded-lg bg-tundra-lichen px-4 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
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
                  <img src={t.screenshot_url} alt={t.name} className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
                    <button type="button" onClick={() => { activateMut.mutate(t.slug) }} disabled={activateMut.isPending}
                      className="flex-1 rounded-lg bg-tundra-lichen py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
                      Activate
                    </button>
                  )}
                  {t.update_available && (
                    <button type="button" onClick={() => { updateMut.mutate(t.slug) }} disabled={updateMut.isPending}
                      className="flex-1 rounded-lg border border-yellow-300 bg-yellow-50 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 transition-colors">
                      Update
                    </button>
                  )}
                  {!t.active && (
                    <button type="button" onClick={() => { removeMut.mutate(t.slug) }} disabled={removeMut.isPending}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
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
