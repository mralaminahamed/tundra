import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
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
  const mailboxes = data?.data ?? []
  const selectedDomainObj = domains.find((d) => d.id === selectedDomain)

  return (
    <div>
      {/* Tab nav */}
      <div className="mb-6 flex items-center gap-1 border-b border-tundra-ink-200">
        {MAIL_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="rounded-t px-4 py-2 text-sm font-medium border-b-2 -mb-px"
            activeProps={{ className: 'border-tundra-lichen text-tundra-lichen' }}
            inactiveProps={{ className: 'border-transparent text-tundra-ink-500 hover:text-tundra-ink' }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mailboxes</h1>
        {selectedDomain && (
          <Link
            to="/mail/domains/$mailDomainId"
            params={{ mailDomainId: selectedDomain }}
            className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
          >
            + Create mailbox
          </Link>
        )}
      </div>

      {/* Domain selector */}
      <div className="mb-6">
        <label className="text-sm font-medium text-tundra-ink-600">Select mail domain</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {domains.map((d) => (
            <button
              key={d.id}
              onClick={() => { setSelectedDomain(d.id) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedDomain === d.id ? 'bg-tundra-ink text-white' : 'bg-tundra-ink-100 text-tundra-ink-600 hover:bg-tundra-ink-200'}`}
            >
              {d.domain}
            </button>
          ))}
          {domains.length === 0 && (
            <p className="text-sm text-tundra-ink-400">
              No mail domains.{' '}
              <Link to="/mail/domains" className="text-tundra-aurora hover:underline">Add one first.</Link>
            </p>
          )}
        </div>
      </div>

      {!selectedDomain && (
        <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
          <p className="text-sm text-tundra-ink-400">Select a mail domain above to view its mailboxes.</p>
        </div>
      )}

      {selectedDomain && isLoading && <p className="text-sm text-tundra-ink-400">Loading…</p>}
      {selectedDomain && isError && <p className="text-sm text-tundra-rust">Failed to load mailboxes.</p>}

      {selectedDomain && !isLoading && (
        <>
          {selectedDomainObj && (
            <div className="mb-3 text-sm text-tundra-ink-500">
              <span className="font-medium text-tundra-ink">{selectedDomainObj.domain}</span>
              {' '}— {String(mailboxes.length)} mailbox{mailboxes.length !== 1 ? 'es' : ''}
            </div>
          )}

          {mailboxes.length === 0 ? (
            <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
              <p className="text-sm text-tundra-ink-400">No mailboxes for this domain.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Address</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Quota</th>
                    <th className="px-4 py-3 text-left font-medium">Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {mailboxes.map((mb) => {
                    const domain = selectedDomainObj
                    const pct = mb.quota_bytes > 0 ? Math.round((mb.used_bytes / mb.quota_bytes) * 100) : 0
                    return (
                      <tr key={mb.id} className="hover:bg-tundra-ink-50">
                        <td className="px-4 py-3 font-medium">
                          {mb.local_part}@{domain?.domain ?? ''}
                        </td>
                        <td className="px-4 py-3">
                          {mb.is_active ? (
                            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">active</span>
                          ) : (
                            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-tundra-ink-500">{formatBytes(mb.quota_bytes)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-tundra-ink-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 90 ? 'bg-tundra-rust' : 'bg-tundra-lichen'}`}
                                style={{ width: `${String(pct)}%` }}
                              />
                            </div>
                            <span className="text-xs text-tundra-ink-500">{formatBytes(mb.used_bytes)} ({String(pct)}%)</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
