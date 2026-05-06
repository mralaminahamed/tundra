import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/sites/$siteId/danger')({
  component: SiteDangerTab,
})

function SiteDangerTab() {
  const { siteId } = Route.useParams()
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const deleteMut = useMutation({
    mutationFn: () => api(`/sites/${siteId}`, { method: 'DELETE' }),
    onSuccess: () => { window.location.href = '/sites' },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  if (!site) return null

  return (
    <div className="max-w-xl space-y-4">
      {/* Archive */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
        <p className="mb-1 font-semibold text-tundra-ink">Archive site</p>
        <p className="mb-3 text-sm text-tundra-ink-400">
          Archives the site — it goes offline but all files, databases, and configuration are preserved.
          You can unarchive at any time.
        </p>
        <button type="button"
          onClick={() => { toast.info('Archive coming soon') }}
          className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
          Archive site
        </button>
      </div>

      {/* Reset */}
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
        <p className="mb-1 font-semibold text-yellow-800">Reset document root</p>
        <p className="mb-3 text-sm text-yellow-700">
          Deletes all files in <code className="rounded bg-yellow-100 px-1 font-mono">{site.document_root}</code> without
          removing the site record or its databases. Use to start a fresh deploy.
        </p>
        <button type="button"
          onClick={() => { toast.info('Document root reset coming soon') }}
          className="rounded-lg border border-yellow-400 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 transition-colors">
          Reset document root
        </button>
      </div>

      {/* Delete */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="mb-3 flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="font-semibold text-red-800">Delete site</p>
            <p className="mt-1 text-sm text-red-700">
              Permanently removes <strong>{site.primary_domain}</strong> and all its deployments, daemons,
              scheduled tasks, and document root files. Databases on the server are <strong>not</strong> dropped automatically.
              This cannot be undone.
            </p>
          </div>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-red-700">
          Type <code className="rounded bg-red-100 px-1 font-mono">{site.primary_domain}</code> to confirm
        </label>
        <input type="text" value={deleteConfirm}
          onChange={(e) => { setDeleteConfirm(e.target.value) }}
          placeholder={site.primary_domain}
          className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none" />
        <button type="button"
          onClick={() => { deleteMut.mutate() }}
          disabled={deleteConfirm !== site.primary_domain || deleteMut.isPending}
          className="mt-3 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
          {deleteMut.isPending ? 'Deleting…' : 'Delete site'}
        </button>
      </div>
    </div>
  )
}
