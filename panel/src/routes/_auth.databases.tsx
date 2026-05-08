import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import type { Database, ListResponse } from '@/lib/api-types'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/databases')({
  component: DatabasesPage,
})

type SortKey = 'name' | 'created_at'
type SortDir = 'asc' | 'desc'

function DatabasesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['databases'],
    queryFn: () => api<ListResponse<Database>>('/databases'),
  })

  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const all = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all
      .filter((db) => !q || db.name.toLowerCase().includes(q) || db.database_server_id.includes(q))
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

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Databases</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{all.length} database{all.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/databases/new" className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          Create database
        </Link>
      </div>

      {isError && <p className="text-sm text-tundra-rust">Failed to load databases.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search databases…" value={search}
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
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
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
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">DB Server</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Size</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('created_at') }}>
                    Created <SortIcon k="created_at" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((db) => (
                <tr key={db.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to="/databases/$databaseId" params={{ databaseId: db.id }} className="font-medium text-tundra-aurora hover:underline">{db.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">
                    <Link to="/database-servers/$serverId" params={{ serverId: db.database_server_id }} className="font-mono text-xs text-tundra-aurora hover:underline">{db.database_server_id.slice(0, 8)}…</Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{db.size_bytes != null ? `${(db.size_bytes / 1048576).toFixed(2)} MB` : '—'}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">{fmtDate(db.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No databases yet.'}
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
