import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { BackupJob, BackupSnapshot, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/backups')({
  component: SiteBackupsTab,
})

function fmt(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function SiteBackupsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()
  const [note, setNote] = useState('')

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['sites', siteId, 'backup-jobs'],
    queryFn: () => api<ListResponse<BackupJob>>(`/backups/jobs?scope_kind=site&scope_id=${siteId}`),
  })

  const { data: snapsData, isLoading: snapsLoading } = useQuery({
    queryKey: ['sites', siteId, 'backup-snapshots'],
    queryFn: () => api<ListResponse<BackupSnapshot>>(`/backups/snapshots?scope_kind=site&scope_id=${siteId}`),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api('/backups/jobs', {
        method: 'POST',
        body: { scope_kind: 'site', scope_id: siteId, name: note || `Manual backup – ${new Date().toLocaleString()}` },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'backup-jobs'] })
      toast.success('Backup job created')
      setNote('')
    },
    onError: () => toast.info('Backup creation coming soon'),
  })

  const STATUS_CLS: Record<string, string> = {
    succeeded: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700',
    failed:    'border-red-200 bg-red-50 text-red-600',
    partial:   'border-yellow-200 bg-yellow-50 text-yellow-700',
  }

  const jobs = jobsData?.data ?? []
  const snaps = snapsData?.data ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Controls */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Create Backup</span>
          </div>
          <div className="p-4 space-y-3">
            <textarea rows={2} placeholder="Optional note…" value={note}
              onChange={(e) => { setNote(e.target.value) }}
              className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none" />
            <button type="button" onClick={() => { createMut.mutate() }} disabled={createMut.isPending}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {createMut.isPending ? 'Creating…' : 'Create Backup Now'}
            </button>
          </div>
        </div>

        {/* Backup jobs (schedules) */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Scheduled Jobs</span>
          </div>
          {jobsLoading ? (
            <div className="p-4 space-y-2">{[1,2].map((i)=><div key={i} className="h-10 animate-pulse rounded bg-tundra-ink-100"/>)}</div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-center text-xs text-tundra-ink-400">No scheduled backup jobs.</div>
          ) : (
            <div className="divide-y divide-tundra-ink-100">
              {jobs.map((j) => (
                <div key={j.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-tundra-ink truncate">{j.name}</p>
                    <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${j.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' : 'border-tundra-ink-200 text-tundra-ink-400'}`}>
                      {j.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  {j.schedule_cron && (
                    <code className="mt-1 block rounded bg-tundra-ink-50 px-1.5 py-0.5 text-xs font-mono text-tundra-ink-500">{j.schedule_cron}</code>
                  )}
                  {j.next_run_at && (
                    <p className="mt-0.5 text-xs text-tundra-ink-400">Next: {fmtDateTime(j.next_run_at)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-tundra-ink-100 p-3">
            <button type="button" onClick={() => toast.info('Schedule coming soon')}
              className="w-full rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              + Add schedule
            </button>
          </div>
        </div>
      </div>

      {/* Snapshot history */}
      <div className="lg:col-span-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Backup History</p>
        {snapsLoading ? (
          <div className="space-y-2">{[1,2,3].map((i)=><div key={i} className="h-14 animate-pulse rounded-xl bg-tundra-ink-100"/>)}</div>
        ) : snaps.length === 0 ? (
          <EmptyState message="No backups yet. Create your first backup." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {snaps.map((s) => (
                  <tr key={s.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-tundra-ink-500 whitespace-nowrap">
                      {fmtDateTime(s.created_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{fmt(s.size_bytes)}</td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-400">{fmtMs(s.duration_ms)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLS[s.status] ?? ''}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => toast.info('Restore preview coming soon')}
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
