import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import type { BackupJob, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/backups/jobs')({
  component: BackupJobsPage,
})

type SortKey = 'name' | 'last_status' | 'next_run_at'
type SortDir = 'asc' | 'desc'

const STATUS_COLORS: Record<string, string> = {
  succeeded: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
  failed:    'border-red-300 bg-red-50 text-red-800',
  running:   'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
  queued:    'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-600',
  partial:   'border-yellow-300 bg-yellow-50 text-yellow-800',
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return `${String(Math.floor(diff))}s ago`
  if (diff < 3600)  return `${String(Math.floor(diff / 60))}m ago`
  if (diff < 86400) return `${String(Math.floor(diff / 3600))}h ago`
  return `${String(Math.floor(diff / 86400))}d ago`
}

function BackupJobsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['backup-jobs'],
    queryFn: () => api<ListResponse<BackupJob>>('/backups/jobs'),
  })

  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const all = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all
      .filter((j) => !q || j.name.toLowerCase().includes(q) || (j.scope_kind ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
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

  function handleRunNow(id: string) {
    api('/backups/jobs/' + id + '/run', { method: 'POST' })
      .then(() => { toast.success('Backup job queued') })
      .catch((err: unknown) => { toast.error(err instanceof Error ? err.message : 'Failed to run job') })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Backup Jobs</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{all.length} job{all.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/backups/jobs/new" className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Create job
        </Link>
      </div>

      {isError && <p className="text-sm text-tundra-rust">Failed to load backup jobs.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search jobs…" value={search}
              onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); pg.setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="name:asc">Name A→Z</option>
              <option value="name:desc">Name Z→A</option>
              <option value="last_status:asc">Status</option>
              <option value="next_run_at:asc">Next run ↑</option>
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
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('name') }}>
                    Name <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Scope</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Schedule</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('last_status') }}>
                    Last status <SortIcon k="last_status" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('next_run_at') }}>
                    Next run <SortIcon k="next_run_at" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((j) => (
                <tr key={j.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-tundra-ink">{j.name}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{j.scope_kind}</td>
                  <td className="px-4 py-3">
                    {j.schedule_cron ? (
                      <span className="rounded bg-tundra-ink-100 px-1.5 py-0.5 font-mono text-xs text-tundra-ink-600">{j.schedule_cron}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {j.last_status ? (
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[j.last_status] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-600'}`}>
                        {j.last_status}
                      </span>
                    ) : <span className="text-tundra-ink-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400">{j.next_run_at ? relativeTime(j.next_run_at) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => { handleRunNow(j.id) }}
                      className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
                      Run now
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No backup jobs yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination total={filtered.length} page={pg.page} pageSize={pg.pageSize}
          onPage={pg.setPage} onPageSize={(n) => { pg.setPageSize(n); pg.setPage(1) }} />
      </div>
    </div>
  )
}
