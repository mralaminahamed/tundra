import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { BackupTarget, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/backups/targets')({
  component: BackupTargetsPage,
})

function kindBadge(kind: BackupTarget['kind']) {
  const map: Record<string, string> = {
    s3: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    local: 'bg-tundra-ink-100 text-tundra-ink-600',
    sftp: 'bg-tundra-ink-100 text-tundra-ink-600',
    b2: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    wasabi: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    r2: 'bg-tundra-lichen-100 text-tundra-lichen-800',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[kind] ?? ''}`}
    >
      {kind}
    </span>
  )
}

function BackupTargetsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['backup-targets'],
    queryFn: () => api<ListResponse<BackupTarget>>('/backups/targets'),
  })

  function handleTest(id: string): void {
    api('/backups/targets/' + id + '/test', { method: 'POST' })
      .then(() => {
        toast.success('Connection test succeeded')
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Connection test failed')
      })
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backup Targets</h1>
        <Link
          to="/backups/targets/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          + Add target
        </Link>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load backup targets.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Kind</th>
                <th className="px-4 py-3 text-left font-medium">Default</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((t) => (
                <tr key={t.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3">{kindBadge(t.kind)}</td>
                  <td className="px-4 py-3">
                    {t.is_default && (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
                        default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {fmtDate(t.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { handleTest(t.id) }}
                    >
                      Test
                    </Button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-tundra-ink-400">
                    No backup targets yet. Add your first target to get started.
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
