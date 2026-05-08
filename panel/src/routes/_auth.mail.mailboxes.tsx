import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import type { Mailbox, MailDomain, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/mail/mailboxes')({
  component: MailMailboxesPage,
})

const MAIL_TABS = [
  { to: '/mail/domains', label: 'Domains' },
  { to: '/mail/mailboxes', label: 'Mailboxes' },
  { to: '/mail/queue', label: 'Queue' },
] as const

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`
}

function MailMailboxesPage() {
  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [search,  setSearch]  = useState('')

  const { data: domainsData } = useQuery({
    queryKey: ['mail-domains'],
    queryFn: () => api<ListResponse<MailDomain>>('/mail/domains'),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mailboxes', selectedDomain],
    queryFn: () =>
      selectedDomain
        ? api<ListResponse<Mailbox>>(`/mail/domains/${selectedDomain}/mailboxes`)
        : Promise.resolve({ data: [] as Mailbox[], next_cursor: null }),
    enabled: !!selectedDomain,
  })

  const domains = domainsData?.data ?? []
  const allMailboxes = data?.data ?? []
  const selectedDomainObj = domains.find((d) => d.id === selectedDomain)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return allMailboxes
    return allMailboxes.filter((mb) => mb.local_part.toLowerCase().includes(q))
  }, [allMailboxes, search])

  const pg = usePagination(filtered, 25)

  return (
    <div className="space-y-5">
      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-tundra-ink-200">
        {MAIL_TABS.map((tab) => (
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
          <h1 className="text-2xl font-semibold text-tundra-ink">Mailboxes</h1>
          {selectedDomainObj && (
            <p className="mt-0.5 text-sm text-tundra-ink-500">
              <span className="font-medium">{selectedDomainObj.domain}</span> — {allMailboxes.length} mailbox{allMailboxes.length !== 1 ? 'es' : ''}
            </p>
          )}
        </div>
        {selectedDomain && (
          <Link to="/mail/domains/$mailDomainId" params={{ mailDomainId: selectedDomain }}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            + Create mailbox
          </Link>
        )}
      </div>

      {/* Domain selector */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
        <p className="mb-2 text-xs font-medium text-tundra-ink-500">Select mail domain</p>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => (
            <button key={d.id} type="button" onClick={() => { setSelectedDomain(d.id); setSearch(''); pg.setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedDomain === d.id ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}>
              {d.domain}
            </button>
          ))}
          {domains.length === 0 && (
            <p className="text-sm text-tundra-ink-400">
              No mail domains. <Link to="/mail/domains" className="text-tundra-aurora hover:underline">Add one first.</Link>
            </p>
          )}
        </div>
      </div>

      {!selectedDomain && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-tundra-ink-200 bg-white text-sm text-tundra-ink-400">
          Select a mail domain above to view its mailboxes.
        </div>
      )}

      {selectedDomain && (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Search address…" value={search}
                onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
                className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
            </div>
            <div className="ml-auto">
              <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-tundra-ink-100">
              {[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse bg-tundra-ink-50 px-4 py-3" />)}
            </div>
          ) : isError ? (
            <p className="px-4 py-6 text-sm text-tundra-rust">Failed to load mailboxes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Address</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Quota</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {pg.paged.map((mb) => {
                  const pct = mb.quota_bytes > 0 ? Math.round((mb.used_bytes / mb.quota_bytes) * 100) : 0
                  return (
                    <tr key={mb.id} className="hover:bg-tundra-ink-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-tundra-ink">
                        {mb.local_part}@{selectedDomainObj?.domain ?? ''}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${mb.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800' : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${mb.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                          {mb.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-tundra-ink-500">{formatBytes(mb.quota_bytes)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-tundra-ink-100">
                            <div className={`h-full rounded-full ${pct >= 90 ? 'bg-tundra-rust' : 'bg-tundra-lichen'}`} style={{ width: `${String(pct)}%` }} />
                          </div>
                          <span className="text-xs text-tundra-ink-500">{formatBytes(mb.used_bytes)} ({String(pct)}%)</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                    {search ? 'No results match your search.' : 'No mailboxes for this domain.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}

          <Pagination total={filtered.length} page={pg.page} pageSize={pg.pageSize}
            onPage={pg.setPage} onPageSize={(n) => { pg.setPageSize(n); pg.setPage(1) }} />
        </div>
      )}
    </div>
  )
}
