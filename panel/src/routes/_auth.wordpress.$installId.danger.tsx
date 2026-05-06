import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { type WpInstallation } from '@/lib/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/danger')({
  component: WpDangerTab,
})

function WpDangerTab() {
  const { installId } = Route.useParams()
  const [confirmed, setConfirmed] = useState('')

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
  })

  const removeMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.href = '/wordpress' },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  if (!install) return null

  return (
    <div className="max-w-2xl space-y-4">
      {/* Reset core */}
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
        <p className="mb-1 font-semibold text-yellow-800">Reset WordPress Core</p>
        <p className="mb-3 text-sm text-yellow-700">
          Reinstall WordPress core files without touching the database or uploads. Useful to recover from
          a corrupted or hacked core installation.
        </p>
        <button type="button" onClick={() => toast.info('Core reset coming soon')}
          className="rounded-lg border border-yellow-400 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 transition-colors">
          Reset WordPress Core
        </button>
      </div>

      {/* Remove installation */}
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
