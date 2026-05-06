import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { type WpBackup } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/backups')({
  component: WpBackupsTab,
})

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function WpBackupsTab() {
  const { installId } = Route.useParams()
  const [note, setNote] = useState('')

  const { data: backups = [], isLoading } = useQuery<WpBackup[]>({
    queryKey: ['wp-backups', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/backups`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((r: { data?: WpBackup[] }) => r.data ?? []),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Controls */}
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
              value={note}
              onChange={(e) => { setNote(e.target.value) }}
              className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
            />
            <button type="button" onClick={() => toast.info('Backup creation coming soon')}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
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
              { label: 'Frequency', options: ['Daily', 'Weekly', 'Monthly', 'Disabled'] },
              { label: 'Retention', options: ['7 backups', '14 backups', '30 backups'] },
            ].map(({ label, options }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-tundra-ink-500">{label}</span>
                <select className="rounded-lg border border-tundra-ink-200 px-2 py-1 text-xs focus:outline-none">
                  {options.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <button type="button" onClick={() => toast.info('Schedule save coming soon')}
              className="w-full rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
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
                      }`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => toast.info('Restore coming soon')}
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                          Restore
                        </button>
                        <button type="button" onClick={() => toast.info('Download coming soon')}
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
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
