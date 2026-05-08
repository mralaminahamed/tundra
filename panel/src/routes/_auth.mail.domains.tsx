import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import type { MailDomain, ListResponse } from '@/lib/api-types'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/mail/domains')({
  component: MailDomainsPage,
})

type SortKey = 'domain' | 'created_at'
type SortDir = 'asc' | 'desc'

function MailDomainsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mail-domains'],
    queryFn: () => api<ListResponse<MailDomain>>('/mail/domains'),
  })

  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('domain')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const all = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all
      .filter((d) => !q || d.domain.toLowerCase().includes(q) || d.mx_host.toLowerCase().includes(q))
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
      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-tundra-ink-200">
        {[
          { to: '/mail/domains', label: 'Domains' },
          { to: '/mail/mailboxes', label: 'Mailboxes' },
          { to: '/mail/queue', label: 'Queue' },
        ].map((tab) => (
          <Link key={tab.to} to={tab.to}
            className="rounded-t px-4 py-2 text-sm font-medium border-b-2 -mb-px"
            activeProps={{ className: 'border-tundra-lichen text-tundra-lichen' }}
            inactiveProps={{ className: 'border-transparent text-tundra-ink-500 hover:text-tundra-ink' }}>
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Mail Domains</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{all.length} domain{all.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/mail/domains/new" className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Add mail domain
        </Link>
      </div>

      {isError && <p className="text-sm text-tundra-rust">Failed to load mail domains.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search domain, MX host…" value={search}
              onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); pg.setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="domain:asc">Domain A→Z</option>
              <option value="domain:desc">Domain Z→A</option>
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
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('domain') }}>
                    Domain <SortIcon k="domain" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">MX Host</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Active</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Webmail</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('created_at') }}>
                    Created <SortIcon k="created_at" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((d) => (
                <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to="/mail/domains/$mailDomainId" params={{ mailDomainId: d.id }} className="font-medium text-tundra-aurora hover:underline">
                      {d.domain}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{d.mx_host}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${d.active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800' : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${d.active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                      {d.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${d.webmail_enabled ? 'bg-tundra-aurora-100 text-tundra-aurora-800' : 'bg-tundra-ink-100 text-tundra-ink-400'}`}>
                      {d.webmail_enabled ? 'enabled' : 'disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400">{fmtDate(d.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No mail domains yet.'}
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
