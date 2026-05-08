import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { BackupJob, BackupSnapshot, BackupTarget, RestorePreview, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/backups')({
  component: SiteBackupsTab,
})

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const STATUS_CLS: Record<string, string> = {
  succeeded: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700',
  failed: 'border-red-200 bg-red-50 text-red-600',
  partial: 'border-yellow-200 bg-yellow-50 text-yellow-700',
}

const CRON_PRESETS = [
  { label: 'Daily at 2 am', value: '0 2 * * *' },
  { label: 'Weekly (Sunday 2 am)', value: '0 2 * * 0' },
  { label: 'Monthly (1st at 2 am)', value: '0 2 1 * *' },
]

const RETENTION_PRESETS = [
  { label: '7 days', keep_daily: 7, keep_weekly: 0 },
  { label: '30 days', keep_daily: 30, keep_weekly: 4 },
  { label: '90 days', keep_daily: 30, keep_weekly: 12 },
]

// ── Add Schedule form ─────────────────────────────────────────────────────────

interface AddScheduleFormProps {
  siteId: string
  targets: BackupTarget[]
  onClose: () => void
}

function AddScheduleForm({ siteId, targets, onClose }: AddScheduleFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [targetId, setTargetId] = useState(targets.find((t) => t.is_default)?.id ?? targets[0]?.id ?? '')
  const [cron, setCron] = useState(CRON_PRESETS[0].value)
  const [customCron, setCustomCron] = useState(false)
  const [retention, setRetention] = useState(RETENTION_PRESETS[0])

  const createMut = useMutation({
    mutationFn: () =>
      api('/backups/jobs', {
        method: 'POST',
        body: {
          name: name.trim() || `Site backup – ${siteId}`,
          scope_kind: 'site',
          scope_id: siteId,
          target_id: targetId,
          schedule_cron: cron || null,
          retention_policy: {
            keep_daily: retention.keep_daily,
            keep_weekly: retention.keep_weekly,
          },
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'backup-jobs'] })
      toast.success('Backup schedule created')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create schedule'),
  })

  return (
    <div className="border-t border-tundra-ink-100 bg-tundra-ink-50 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">New Schedule</p>

      {/* Name */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-tundra-ink-600">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value) }}
          placeholder={`Site backup – ${siteId}`}
          className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-1.5 text-sm focus:border-tundra-lichen focus:outline-none"
        />
      </label>

      {/* Target */}
      {targets.length > 0 && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-tundra-ink-600">Backup target</span>
          <select
            value={targetId}
            onChange={(e) => { setTargetId(e.target.value) }}
            className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-1.5 text-sm focus:border-tundra-lichen focus:outline-none"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.kind}){t.is_default ? ' — default' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Schedule */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-tundra-ink-600">Schedule</span>
        {!customCron ? (
          <div className="flex gap-1.5">
            <select
              value={cron}
              onChange={(e) => { setCron(e.target.value) }}
              className="flex-1 rounded-lg border border-tundra-ink-200 bg-white px-3 py-1.5 text-sm focus:border-tundra-lichen focus:outline-none"
            >
              {CRON_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { setCustomCron(true) }}
              className="rounded-lg border border-tundra-ink-200 bg-white px-2.5 py-1.5 text-xs text-tundra-ink-500 hover:bg-tundra-ink-100 transition-colors"
            >
              Custom
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={cron}
              onChange={(e) => { setCron(e.target.value) }}
              placeholder="0 2 * * *"
              className="flex-1 rounded-lg border border-tundra-ink-200 bg-white px-3 py-1.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none"
            />
            <button
              type="button"
              onClick={() => { setCron(CRON_PRESETS[0].value); setCustomCron(false) }}
              className="rounded-lg border border-tundra-ink-200 bg-white px-2.5 py-1.5 text-xs text-tundra-ink-500 hover:bg-tundra-ink-100 transition-colors"
            >
              Presets
            </button>
          </div>
        )}
      </label>

      {/* Retention */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-tundra-ink-600">Retention</span>
        <select
          value={retention.label}
          onChange={(e) => {
            const found = RETENTION_PRESETS.find((r) => r.label === e.target.value)
            if (found) setRetention(found)
          }}
          className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-1.5 text-sm focus:border-tundra-lichen focus:outline-none"
        >
          {RETENTION_PRESETS.map((r) => (
            <option key={r.label} value={r.label}>{r.label}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => { createMut.mutate() }}
          disabled={createMut.isPending || !targetId}
          className="flex-1 rounded-lg bg-tundra-lichen py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
        >
          {createMut.isPending ? 'Saving…' : 'Save schedule'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={createMut.isPending}
          className="rounded-lg border border-tundra-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Restore confirm dialog ────────────────────────────────────────────────────

interface RestoreDialogProps {
  preview: RestorePreview
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function RestoreDialog({ preview, onConfirm, onCancel, isPending }: RestoreDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-tundra-ink-200 bg-white shadow-xl">
        <div className="border-b border-tundra-ink-100 px-5 py-4">
          <p className="font-semibold text-tundra-ink">Confirm restore</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <strong>Warning:</strong> restoring this snapshot will overwrite the current site files and may cause downtime.
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-tundra-ink-400">Snapshot</dt>
            <dd className="font-mono text-xs text-tundra-ink truncate">{preview.preview.snapshot_id}</dd>
            <dt className="text-tundra-ink-400">Size</dt>
            <dd className="text-tundra-ink">{fmt(preview.preview.size_bytes)}</dd>
            <dt className="text-tundra-ink-400">Created</dt>
            <dd className="text-tundra-ink">{fmtDateTime(preview.preview.created_at)}</dd>
            <dt className="text-tundra-ink-400">Expires</dt>
            <dd className="text-tundra-ink-400 text-xs">{fmtDateTime(preview.expires_at)}</dd>
          </dl>
        </div>
        <div className="flex gap-2 border-t border-tundra-ink-100 px-5 py-4">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Restoring…' : 'Confirm restore'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Snapshot rows for one job ─────────────────────────────────────────────────

interface JobSnapshotsProps {
  job: BackupJob
  siteId: string
}

function JobSnapshots({ job, siteId }: JobSnapshotsProps) {
  const qc = useQueryClient()
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)

  const { data: snapsData, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'backup-snapshots', job.id],
    queryFn: () => api<ListResponse<BackupSnapshot>>(`/backups/snapshots?job_id=${job.id}`),
  })

  const initRestoreMut = useMutation({
    mutationFn: (snapId: string) =>
      api<RestorePreview>(`/backups/snapshots/${snapId}/restore`, { method: 'POST' }),
    onSuccess: (data) => { setRestorePreview(data) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to initiate restore'),
  })

  const confirmRestoreMut = useMutation({
    mutationFn: (restoreId: string) =>
      api(`/backups/restores/${restoreId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Restore confirmed — site files are being replaced. Expect brief downtime.', { duration: 6000 })
      setRestorePreview(null)
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'backup-snapshots', job.id] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Restore failed'),
  })

  const cancelRestoreMut = useMutation({
    mutationFn: (restoreId: string) =>
      api(`/backups/restores/${restoreId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.info('Restore cancelled')
      setRestorePreview(null)
    },
    onError: () => { setRestorePreview(null) },
  })

  const snaps = snapsData?.data ?? []

  if (isLoading) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-3">
          <div className="h-6 w-full animate-pulse rounded bg-tundra-ink-100" />
        </td>
      </tr>
    )
  }

  if (snaps.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-3 text-center text-xs text-tundra-ink-400 italic">
          No snapshots for this job yet.
        </td>
      </tr>
    )
  }

  return (
    <>
      {restorePreview && (
        <RestoreDialog
          preview={restorePreview}
          isPending={confirmRestoreMut.isPending}
          onConfirm={() => { confirmRestoreMut.mutate(restorePreview.restore_id) }}
          onCancel={() => {
            cancelRestoreMut.mutate(restorePreview.restore_id)
          }}
        />
      )}
      {snaps.map((s) => (
        <tr key={s.id} className="hover:bg-tundra-ink-50 transition-colors">
          <td className="px-4 py-3 pl-8 text-xs text-tundra-ink-500 whitespace-nowrap">
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
              <button
                type="button"
                disabled={s.status !== 'succeeded' || initRestoreMut.isPending}
                onClick={() => { initRestoreMut.mutate(s.id) }}
                className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {initRestoreMut.isPending ? 'Loading…' : 'Restore'}
              </button>
              <button
                type="button"
                onClick={() => { toast.info('Snapshot download is not yet available') }}
                className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
              >
                Download
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

function SiteBackupsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['sites', siteId, 'backup-jobs'],
    queryFn: () => api<ListResponse<BackupJob>>(`/backups/jobs?scope_kind=site&scope_id=${siteId}`),
  })

  const { data: targetsData } = useQuery({
    queryKey: ['backup-targets'],
    queryFn: () => api<ListResponse<BackupTarget>>('/backups/targets'),
  })

  const runNowMut = useMutation({
    mutationFn: (jobId: string) =>
      api(`/backups/jobs/${jobId}/run`, { method: 'POST' }),
    onSuccess: (_, jobId) => {
      toast.success('Backup queued')
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'backup-snapshots', jobId] })
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'backup-jobs'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to run backup'),
  })

  const deleteJobMut = useMutation({
    mutationFn: (jobId: string) =>
      api(`/backups/jobs/${jobId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'backup-jobs'] })
      toast.success('Backup job deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete job'),
  })

  function toggleJob(jobId: string) {
    setExpandedJobs((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      return next
    })
  }

  const jobs = jobsData?.data ?? []
  const targets = targetsData?.data ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left column — jobs / schedule */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Scheduled Jobs</span>
          </div>

          {jobsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-tundra-ink-100" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-4 text-center text-xs text-tundra-ink-400">No scheduled backup jobs.</div>
          ) : (
            <div className="divide-y divide-tundra-ink-100">
              {jobs.map((j) => (
                <div key={j.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-tundra-ink">{j.name}</p>
                      {j.schedule_cron && (
                        <code className="mt-0.5 block rounded bg-tundra-ink-50 px-1.5 py-0.5 text-xs font-mono text-tundra-ink-500">
                          {j.schedule_cron}
                        </code>
                      )}
                      {j.next_run_at && (
                        <p className="mt-0.5 text-xs text-tundra-ink-400">Next: {fmtDateTime(j.next_run_at)}</p>
                      )}
                      {j.last_status && (
                        <p className="mt-0.5 text-xs text-tundra-ink-400">
                          Last:{' '}
                          <span className={j.last_status === 'succeeded' ? 'text-tundra-lichen-700' : 'text-red-500'}>
                            {j.last_status}
                          </span>
                        </p>
                      )}
                    </div>
                    <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${j.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' : 'border-tundra-ink-200 text-tundra-ink-400'}`}>
                      {j.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { runNowMut.mutate(j.id) }}
                      disabled={runNowMut.isPending}
                      className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
                    >
                      Run now
                    </button>
                    <button
                      type="button"
                      onClick={() => { toggleJob(j.id) }}
                      className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                    >
                      {expandedJobs.has(j.id) ? 'Hide snapshots' : 'Snapshots'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete backup job "${j.name}"? Existing snapshots are not removed.`)) {
                          deleteJobMut.mutate(j.id)
                        }
                      }}
                      disabled={deleteJobMut.isPending}
                      className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add schedule form or button */}
          {showScheduleForm ? (
            <AddScheduleForm
              siteId={siteId}
              targets={targets}
              onClose={() => { setShowScheduleForm(false) }}
            />
          ) : (
            <div className="border-t border-tundra-ink-100 p-3">
              <button
                type="button"
                onClick={() => { setShowScheduleForm(true) }}
                className="w-full rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
              >
                + Add schedule
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right column — snapshots */}
      <div className="lg:col-span-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Backup History</p>

        {jobsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-tundra-ink-100" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState message="No backup jobs configured. Add a schedule to start taking snapshots." />
        ) : (
          <div className="space-y-4">
            {jobs.map((j) => (
              <div key={j.id} className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
                {/* Job header row */}
                <button
                  type="button"
                  onClick={() => { toggleJob(j.id) }}
                  className="flex w-full items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5 text-left hover:bg-tundra-ink-100 transition-colors"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-500">{j.name}</span>
                  <svg
                    className={`h-4 w-4 text-tundra-ink-400 transition-transform ${expandedJobs.has(j.id) ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {expandedJobs.has(j.id) && (
                  <table className="w-full text-sm">
                    <thead className="border-b border-tundra-ink-100 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
                      <tr>
                        <th className="px-4 py-2.5 pl-8 text-left">Date</th>
                        <th className="px-4 py-2.5 text-left">Size</th>
                        <th className="px-4 py-2.5 text-left">Duration</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tundra-ink-100">
                      <JobSnapshots job={j} siteId={siteId} />
                    </tbody>
                  </table>
                )}

                {!expandedJobs.has(j.id) && (
                  <div className="px-4 py-3 text-xs text-tundra-ink-400 italic">
                    Click to expand snapshots
                    {j.last_run_at && ` — last run ${fmtDateTime(j.last_run_at)}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
