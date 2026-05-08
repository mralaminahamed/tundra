import { createFileRoute, Link } from '@tanstack/react-router'
// Domain list with site linkage
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import type { ListResponse, Domain } from '@/lib/api-types'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/domains/')({
  component: DomainsPage,
})

type SortKey = 'apex' | 'registration_expires_at' | 'site_name'
type SortDir = 'asc' | 'desc'

const DNS_META: Record<Domain['dns_managed_by'], { label: string; cls: string }> = {
  tundra:    { label: 'Tundra DNS',   cls: 'bg-tundra-lichen-100 text-tundra-lichen-800' },
  external:  { label: 'External',     cls: 'bg-tundra-ink-100 text-tundra-ink-600' },
  registrar: { label: 'Registrar',    cls: 'bg-tundra-aurora-100 text-tundra-aurora-800' },
}

function DomainsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api<ListResponse<Domain>>('/domains'),
  })

  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('apex')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const all = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all
      .filter((d) => !q || d.apex.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        const cmp = String(av).localeCompare(String(bv))
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

  const counts = {
    tundra:    all.filter((d) => d.dns_managed_by === 'tundra').length,
    external:  all.filter((d) => d.dns_managed_by === 'external').length,
    registrar: all.filter((d) => d.dns_managed_by === 'registrar').length,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Domains</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{all.length} domain{all.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/domains/new" className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Add domain
        </Link>
      </div>

      {/* Stat pills */}
      {all.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(Object.entries(counts) as [Domain['dns_managed_by'], number][]).map(([key, count]) =>
            count > 0 ? (
              <div key={key} className="flex items-center gap-2 rounded-xl border border-tundra-ink-200 bg-white px-4 py-2.5">
                <span className="text-xl font-bold tabular-nums text-tundra-ink">{count}</span>
                <span className="text-xs text-tundra-ink-400">{DNS_META[key].label}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      {isError && <p className="text-sm text-tundra-rust">Failed to load domains.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search domains…" value={search}
              onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); pg.setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="apex:asc">Apex A→Z</option>
              <option value="apex:desc">Apex Z→A</option>
              <option value="site_name:asc">Site A→Z</option>
              <option value="registration_expires_at:asc">Expires ↑</option>
              <option value="registration_expires_at:desc">Expires ↓</option>
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
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('apex') }}>
                    Apex <SortIcon k="apex" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('site_name') }}>
                    Site <SortIcon k="site_name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">DNS</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Auto-renew</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('registration_expires_at') }}>
                    Expires <SortIcon k="registration_expires_at" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((d) => (
                <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to="/domains/$domainId" params={{ domainId: d.id }} className="font-medium text-tundra-aurora hover:underline">{d.apex}</Link>
                  </td>
                  <td className="px-4 py-3">
                    {d.site_id ? (
                      <Link to="/sites/$siteId" params={{ siteId: d.site_id }}
                        className="text-xs font-medium text-tundra-aurora hover:underline">
                        {d.site_name ?? d.site_id.slice(0, 8)}
                      </Link>
                    ) : <span className="text-xs text-tundra-ink-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${DNS_META[d.dns_managed_by].cls}`}>
                      {DNS_META[d.dns_managed_by].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{d.auto_renew ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">{d.registration_expires_at ? fmtDate(d.registration_expires_at) : '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No domains yet.'}
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
