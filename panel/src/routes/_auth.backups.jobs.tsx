import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { BackupJob, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/backups/jobs')({
  component: BackupJobsPage,
})

function statusBadge(status: string | null) {
  if (!status) return null
  const map: Record<string, string> = {
    succeeded: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    failed: 'bg-tundra-rust text-white',
    running: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    queued: 'bg-tundra-ink-100 text-tundra-ink-600',
    partial: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-tundra-ink-100 text-tundra-ink-600'}`}
    >
      {status}
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return String(Math.floor(diff)) + 's ago'
  if (diff < 3600) return String(Math.floor(diff / 60)) + 'm ago'
  if (diff < 86400) return String(Math.floor(diff / 3600)) + 'h ago'
  return String(Math.floor(diff / 86400)) + 'd ago'
}

function BackupJobsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['backup-jobs'],
    queryFn: () => api<ListResponse<BackupJob>>('/backups/jobs'),
  })

  function handleRunNow(id: string): void {
    api('/backups/jobs/' + id + '/run', { method: 'POST' })
      .then(() => {
        toast.success('Backup job queued')
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to run job')
      })
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backup Jobs</h1>
        <Link
          to="/backups/jobs/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          + Create job
        </Link>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load backup jobs.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Scope</th>
                <th className="px-4 py-3 text-left font-medium">Schedule</th>
                <th className="px-4 py-3 text-left font-medium">Last status</th>
                <th className="px-4 py-3 text-left font-medium">Next run</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((j) => (
                <tr key={j.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3 font-medium">{j.name}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{j.scope_kind}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {j.schedule_cron ?? '—'}
                  </td>
                  <td className="px-4 py-3">{statusBadge(j.last_status)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {j.next_run_at ? relativeTime(j.next_run_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { handleRunNow(j.id) }}
                    >
                      Run now
                    </Button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-tundra-ink-400">
                    No backup jobs yet. Create your first job to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
