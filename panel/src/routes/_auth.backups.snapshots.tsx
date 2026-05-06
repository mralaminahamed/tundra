import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { BackupSnapshot, ListResponse, RestorePreview } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export const Route = createFileRoute('/_auth/backups/snapshots')({
  component: BackupSnapshotsPage,
})

function statusBadge(status: BackupSnapshot['status']) {
  const map: Record<string, string> = {
    succeeded: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    failed: 'bg-tundra-rust text-white',
    partial: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}
    >
      {status}
    </span>
  )
}

function formatMB(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024))) + ' MB'
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1) + 's'
}

function RestoreDialog({
  preview,
  onConfirm,
  onCancel,
  confirming,
}: {
  preview: RestorePreview
  onConfirm: () => void
  onCancel: () => void
  confirming: boolean
}) {
  return (
    <Dialog open onClose={onCancel}>
      <DialogHeader>
        <DialogTitle>Confirm restore</DialogTitle>
      </DialogHeader>
      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm rounded-lg border border-tundra-ink-100 p-4">
        <dt className="font-medium text-tundra-ink-500">Snapshot ID</dt>
        <dd>{preview.preview.snapshot_id.slice(0, 12)}</dd>
        <dt className="font-medium text-tundra-ink-500">Job ID</dt>
        <dd>{preview.preview.job_id.slice(0, 12)}</dd>
        <dt className="font-medium text-tundra-ink-500">Size</dt>
        <dd>{formatMB(preview.preview.size_bytes)}</dd>
        <dt className="font-medium text-tundra-ink-500">Created</dt>
        <dd>{new Date(preview.preview.created_at).toLocaleString()}</dd>
        <dt className="font-medium text-tundra-ink-500">Expires</dt>
        <dd>{new Date(preview.expires_at).toLocaleString()}</dd>
      </dl>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={confirming}>
          Confirm restore
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function BackupSnapshotsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['backup-snapshots'],
    queryFn: () => api<ListResponse<BackupSnapshot>>('/backups/snapshots'),
  })

  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  function handleRestore(id: string): void {
    api<RestorePreview>('/backups/snapshots/' + id + '/restore', { method: 'POST' })
      .then((preview) => {
        setRestorePreview(preview)
        setDialogOpen(true)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to initiate restore')
      })
  }

  function handleConfirmRestore(): void {
    if (!restorePreview) return
    setConfirming(true)
    api('/backups/restores/' + restorePreview.restore_id + '/confirm', { method: 'POST' })
      .then(() => {
        toast.success('Restore initiated successfully')
        setDialogOpen(false)
        setRestorePreview(null)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to confirm restore')
      })
      .finally(() => { setConfirming(false) })
  }

  function handleCancelRestore(): void {
    setDialogOpen(false)
    setRestorePreview(null)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backup Snapshots</h1>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load snapshots.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Snapshot ID</th>
                <th className="px-4 py-3 text-left font-medium">Job ID</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Duration</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((s) => (
                <tr key={s.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    {s.snapshot_id.slice(0, 12)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">
                    {s.job_id.slice(0, 12)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{formatMB(s.size_bytes)}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{formatSeconds(s.duration_ms)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {new Date(s.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { handleRestore(s.id) }}
                    >
                      Restore
                    </Button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-tundra-ink-400">
                    No snapshots yet. Run a backup job to create the first snapshot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && restorePreview && (
        <RestoreDialog
          preview={restorePreview}
          onConfirm={handleConfirmRestore}
          onCancel={handleCancelRestore}
          confirming={confirming}
        />
      )}
    </div>
  )
}
