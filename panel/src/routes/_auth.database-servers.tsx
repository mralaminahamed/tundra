import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { Pagination } from '@/components/ui/pagination'
import type { DatabaseServer, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/database-servers')({
  component: DatabaseServersPage,
})

const ENGINE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', valkey: 'Valkey',
}

const ENGINE_COLORS: Record<string, string> = {
  postgresql: 'bg-blue-50 text-blue-700 border-blue-200',
  mysql:      'bg-orange-50 text-orange-700 border-orange-200',
  mariadb:    'bg-teal-50 text-teal-700 border-teal-200',
  valkey:     'bg-red-50 text-red-700 border-red-200',
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:  'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
    stopped: 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',
    error:   'border-red-300 bg-red-50 text-red-800',
  }
  const dot: Record<string, string> = {
    active: 'bg-tundra-lichen', stopped: 'bg-tundra-ink-300', error: 'bg-red-500 animate-pulse',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? 'bg-tundra-ink-300'}`} />
      {status}
    </span>
  )
}

type SortKey = 'engine' | 'status' | 'port'
type SortDir = 'asc' | 'desc'
function DatabaseServersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['database-servers'],
    queryFn: () => api<ListResponse<DatabaseServer>>('/database-servers'),
  })

  const [search,    setSearch]    = useState('')
  const [sortKey,   setSortKey]   = useState<SortKey>('engine')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')
  const [page,      setPage]      = useState(1)
  const [pageSize,  setPageSize]  = useState(25)

  const all = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all
      .filter((s) => !q || s.engine.includes(q) || s.bind_address.includes(q) || String(s.port).includes(q))
      .sort((a, b) => {
        const av = sortKey === 'port' ? a.port : (a[sortKey] ?? '')
        const bv = sortKey === 'port' ? b.port : (b[sortKey] ?? '')
        const cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [all, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <svg className={`h-3 w-3 ${sortKey === k ? 'text-tundra-lichen' : 'text-tundra-ink-200'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      {sortKey !== k ? <path d="M8 9l4-4 4 4M8 15l4 4 4-4"/> : sortDir === 'asc' ? <path d="M12 5l-7 7h14z"/> : <path d="M12 19l7-7H5z"/>}
    </svg>
  )

  const counts = {
    active:  all.filter((s) => s.status === 'active').length,
    stopped: all.filter((s) => s.status === 'stopped').length,
    error:   all.filter((s) => s.status === 'error').length,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Database Servers</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{all.length} server{all.length !== 1 ? 's' : ''} registered</p>
        </div>
        <Link to="/database-servers/new" className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          Add server
        </Link>
      </div>

      {/* Stat pills */}
      {all.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([['Active', counts.active, 'tundra-lichen'], ['Stopped', counts.stopped, 'tundra-ink'], ['Error', counts.error, 'red']] as const).map(([label, count]) => (
            count > 0 && (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-tundra-ink-200 bg-white px-4 py-2.5">
                <span className="text-xl font-bold tabular-nums text-tundra-ink">{count}</span>
                <span className="text-xs text-tundra-ink-400">{label}</span>
              </div>
            )
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-tundra-rust">Failed to load database servers.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search engine, host, port…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="engine:asc">Engine A→Z</option>
              <option value="engine:desc">Engine Z→A</option>
              <option value="status:asc">Status</option>
              <option value="port:asc">Port ↑</option>
              <option value="port:desc">Port ↓</option>
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
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('engine') }}>
                    Engine <SortIcon k="engine" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Host</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('port') }}>
                    Port <SortIcon k="port" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Superuser</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('status') }}>
                    Status <SortIcon k="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {paginated.map((srv) => (
                <tr key={srv.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${ENGINE_COLORS[srv.engine] ?? 'bg-tundra-ink-50 text-tundra-ink-600 border-tundra-ink-200'}`}>
                        {ENGINE_LABELS[srv.engine] ?? srv.engine}
                      </span>
                      <Link to="/database-servers/$serverId" params={{ serverId: srv.id }} className="font-medium text-tundra-ink hover:text-tundra-aurora">
                        {srv.version}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{srv.bind_address}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{srv.port}</td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-500">{srv.superuser}</td>
                  <td className="px-4 py-3"><StatusPill status={srv.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No database servers yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination total={filtered.length} page={safePage} pageSize={pageSize}
          onPage={(p) => { setPage(p) }} onPageSize={(n) => { setPageSize(n); setPage(1) }} />
      </div>
    </div>
  )
}
