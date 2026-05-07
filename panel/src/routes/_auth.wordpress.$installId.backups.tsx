import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { type WpBackup } from '@/components/wp-shared'
import { fmtBytes, fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/wordpress/$installId/backups')({
  component: WpBackupsTab,
})

type Schedule = { frequency: 'disabled' | 'daily' | 'weekly' | 'monthly'; retention: number }

function WpBackupsTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [schedule, setSchedule] = useState<Schedule>({ frequency: 'disabled', retention: 7 })

  const { data: backups = [], isLoading } = useQuery<WpBackup[]>({
    queryKey: ['wp-backups', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/backups`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((r: { data?: WpBackup[] }) => r.data ?? []),
    // Poll while any backup is running
    refetchInterval: (q) =>
      (q.state.data ?? []).some((b) => b.status === 'running') ? 3000 : false,
  })

  const { data: scheduleData } = useQuery<Schedule>({
    queryKey: ['wp-backup-schedule', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/backup-schedule`)
        .then((r) => r.ok ? r.json() as Promise<Schedule> : Promise.resolve<Schedule>({ frequency: 'disabled', retention: 7 })),
  })

  // Sync schedule state when API data loads
  useEffect(() => {
    if (scheduleData) setSchedule(scheduleData)
  }, [scheduleData])

  const createMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
        credentials: 'include',
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-backups', installId] })
      toast.success('Backup started')
      setNote('')
    },
    onError: () => toast.error('Backup failed to start'),
  })

  const restoreMut = useMutation({
    mutationFn: (backupId: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/backups/${backupId}/restore`, {
        method: 'POST', credentials: 'include',
      }).then((r) => { if (!r.ok) throw new Error('Restore failed'); return r.json() }),
    onSuccess: () => toast.success('Database restored'),
    onError: () => toast.error('Restore failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (backupId: string) =>
      fetch(`/api/v1/wordpress/installations/${installId}/backups/${backupId}`, {
        method: 'DELETE', credentials: 'include',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-backups', installId] })
      toast.success('Backup deleted')
    },
    onError: () => toast.error('Delete failed'),
  })

  const scheduleMut = useMutation({
    mutationFn: (s: Schedule) =>
      fetch(`/api/v1/wordpress/installations/${installId}/backup-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
        credentials: 'include',
      }).then((r) => r.json()),
    onSuccess: () => toast.success('Schedule saved'),
    onError: () => toast.error('Failed to save schedule'),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Controls */}
      <div className="space-y-4">
        {/* Create backup */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Create Backup</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-tundra-ink-400">Creates a full database backup using WP-CLI.</p>
            <textarea
              placeholder="Optional note…"
              rows={2}
              value={note}
              onChange={(e) => { setNote(e.target.value) }}
              className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none"
            />
            <button type="button"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors disabled:opacity-50">
              {createMut.isPending ? 'Starting…' : 'Create Backup Now'}
            </button>
          </div>
        </div>

        {/* Schedule */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Auto Backup Schedule</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-tundra-ink-500">Frequency</span>
              <select
                value={schedule.frequency}
                onChange={(e) => { setSchedule({ ...schedule, frequency: e.target.value as Schedule['frequency'] }) }}
                className="rounded-lg border border-tundra-ink-200 px-2 py-1 text-xs focus:outline-none">
                <option value="disabled">Disabled</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-tundra-ink-500">Retention</span>
              <select
                value={schedule.retention}
                onChange={(e) => { setSchedule({ ...schedule, retention: Number(e.target.value) }) }}
                className="rounded-lg border border-tundra-ink-200 px-2 py-1 text-xs focus:outline-none">
                {[7, 14, 30].map((n) => <option key={n} value={n}>{n} backups</option>)}
              </select>
            </div>
            <button type="button"
              disabled={scheduleMut.isPending}
              onClick={() => scheduleMut.mutate(schedule)}
              className="w-full rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
              {scheduleMut.isPending ? 'Saving…' : 'Save Schedule'}
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
                    <td className="px-4 py-3">
                      <p className="text-xs text-tundra-ink-500">{fmtDateTime(b.created_at)}</p>
                      {b.note && <p className="mt-0.5 text-[11px] text-tundra-ink-400 italic">{b.note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-tundra-ink-200 px-2 py-0.5 text-xs capitalize text-tundra-ink-500">{b.type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{fmtBytes(b.size_bytes)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        b.status === 'complete' ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' :
                        b.status === 'running'  ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                                                  'border-red-200 bg-red-50 text-red-600'
                      }`}>
                        {b.status === 'running' ? (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                            running
                          </span>
                        ) : b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {b.status === 'complete' && (
                          <>
                            <button type="button"
                              disabled={restoreMut.isPending}
                              onClick={() => { if (confirm('Restore this backup? Current database will be replaced.')) restoreMut.mutate(b.id) }}
                              className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
                              Restore
                            </button>
                            <a
                              href={`/api/v1/wordpress/installations/${installId}/backups/${b.id}/download`}
                              className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                              Download
                            </a>
                          </>
                        )}
                        <button type="button"
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(b.id)}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                          Delete
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
