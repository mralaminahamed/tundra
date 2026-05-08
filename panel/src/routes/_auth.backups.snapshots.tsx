import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { BackupSnapshot, ListResponse, RestorePreview } from '@/lib/api-types'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/backups/snapshots')({
  component: BackupSnapshotsPage,
})

type SortKey = 'created_at' | 'size_bytes' | 'status'
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
  failed:    'border-red-300 bg-red-50 text-red-800',
  partial:   'border-yellow-300 bg-yellow-50 text-yellow-800',
}

function formatMB(bytes: number): string { return `${String(Math.round(bytes / (1024 * 1024)))} MB` }
function formatSeconds(ms: number): string { return `${(ms / 1000).toFixed(1)}s` }

function RestoreDialog({ preview, onConfirm, onCancel, confirming }: {
  preview: RestorePreview; onConfirm: () => void; onCancel: () => void; confirming: boolean
}) {
  return (
    <Dialog open onClose={onCancel}>
      <DialogHeader><DialogTitle>Confirm restore</DialogTitle></DialogHeader>
      <dl className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-tundra-ink-100 p-4 text-sm">
        <dt className="font-medium text-tundra-ink-500">Snapshot ID</dt><dd>{preview.preview.snapshot_id.slice(0, 12)}</dd>
        <dt className="font-medium text-tundra-ink-500">Job ID</dt><dd>{preview.preview.job_id.slice(0, 12)}</dd>
        <dt className="font-medium text-tundra-ink-500">Size</dt><dd>{formatMB(preview.preview.size_bytes)}</dd>
        <dt className="font-medium text-tundra-ink-500">Created</dt><dd>{fmtDateTime(preview.preview.created_at)}</dd>
        <dt className="font-medium text-tundra-ink-500">Expires</dt><dd>{fmtDateTime(preview.expires_at)}</dd>
      </dl>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm} loading={confirming}>Confirm restore</Button>
      </DialogFooter>
    </Dialog>
  )
}

function BackupSnapshotsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['backup-snapshots'],
    queryFn: () => api<ListResponse<BackupSnapshot>>('/backups/snapshots'),
  })

  const [search,        setSearch]        = useState('')
  const [sortKey,       setSortKey]       = useState<SortKey>('created_at')
  const [sortDir,       setSortDir]       = useState<SortDir>('desc')
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [dialogOpen,    setDialogOpen]    = useState(false)
  const [confirming,    setConfirming]    = useState(false)

  const all = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all
      .filter((s) => !q || s.snapshot_id.includes(q) || s.status.includes(q))
      .sort((a, b) => {
        if (sortKey === 'size_bytes') {
          const diff = a.size_bytes - b.size_bytes
          return sortDir === 'asc' ? diff : -diff
        }
        const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [all, search, sortKey, sortDir])

  const pg = usePagination(filtered, 25)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    pg.setPage(1)
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <svg className={`h-3 w-3 ${sortKey === k ? 'text-tundra-lichen' : 'text-tundra-ink-200'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      {sortKey !== k ? <path d="M8 9l4-4 4 4M8 15l4 4 4-4" /> : sortDir === 'asc' ? <path d="M12 5l-7 7h14z" /> : <path d="M12 19l7-7H5z" />}
    </svg>
  )

  function handleRestore(id: string) {
    api<RestorePreview>('/backups/snapshots/' + id + '/restore', { method: 'POST' })
      .then((preview) => { setRestorePreview(preview); setDialogOpen(true) })
      .catch((err: unknown) => { toast.error(err instanceof Error ? err.message : 'Failed to initiate restore') })
  }

  function handleConfirmRestore() {
    if (!restorePreview) return
    setConfirming(true)
    api('/backups/restores/' + restorePreview.restore_id + '/confirm', { method: 'POST' })
      .then(() => { toast.success('Restore initiated successfully'); setDialogOpen(false); setRestorePreview(null) })
      .catch((err: unknown) => { toast.error(err instanceof Error ? err.message : 'Failed to confirm restore') })
      .finally(() => { setConfirming(false) })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Backup Snapshots</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{all.length} snapshot{all.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {isError && <p className="text-sm text-tundra-rust">Failed to load snapshots.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search snapshots…" value={search}
              onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); pg.setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
              <option value="size_bytes:desc">Largest first</option>
              <option value="size_bytes:asc">Smallest first</option>
              <option value="status:asc">Status</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-tundra-ink-100">
            {[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse bg-tundra-ink-50 px-4 py-3" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Snapshot ID</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Job ID</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('status') }}>
                    Status <SortIcon k="status" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('size_bytes') }}>
                    Size <SortIcon k="size_bytes" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Duration</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('created_at') }}>
                    Created <SortIcon k="created_at" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((s) => (
                <tr key={s.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink">{s.snapshot_id.slice(0, 12)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">{s.job_id.slice(0, 12)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-600'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{formatMB(s.size_bytes)}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{formatSeconds(s.duration_ms)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">{fmtDateTime(s.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => { handleRestore(s.id) }}
                      className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No snapshots yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination total={filtered.length} page={pg.page} pageSize={pg.pageSize}
          onPage={pg.setPage} onPageSize={(n) => { pg.setPageSize(n); pg.setPage(1) }} />
      </div>

      {dialogOpen && restorePreview && (
        <RestoreDialog preview={restorePreview} onConfirm={handleConfirmRestore}
          onCancel={() => { setDialogOpen(false); setRestorePreview(null) }} confirming={confirming} />
      )}
    </div>
  )
}
