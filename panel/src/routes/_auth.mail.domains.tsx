import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { MailDomain, ListResponse } from '@/lib/api-types'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/mail/domains')({
  component: MailDomainsPage,
})

function activeBadge(active: boolean) {
  return active ? (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
      active
    </span>
  ) : (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
      inactive
    </span>
  )
}

function webmailBadge(enabled: boolean) {
  return enabled ? (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-aurora-100 text-tundra-aurora-800">
      enabled
    </span>
  ) : (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-400">
      disabled
    </span>
  )
}

function MailDomainsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mail-domains'],
    queryFn: () => api<ListResponse<MailDomain>>('/mail/domains'),
  })

  return (
    <div>
      {/* Tab nav */}
      <div className="mb-6 flex items-center gap-1 border-b border-tundra-ink-200">
        {[
          { to: '/mail/domains', label: 'Domains' },
          { to: '/mail/mailboxes', label: 'Mailboxes' },
          { to: '/mail/queue', label: 'Queue' },
        ].map((tab) => (
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
        <h1 className="text-2xl font-semibold">Mail Domains</h1>
        <Link
          to="/mail/domains/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          + Add mail domain
        </Link>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load mail domains.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Domain</th>
                <th className="px-4 py-3 text-left font-medium">MX Host</th>
                <th className="px-4 py-3 text-left font-medium">Active</th>
                <th className="px-4 py-3 text-left font-medium">Webmail</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((d) => (
                <tr key={d.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/mail/domains/$mailDomainId"
                      params={{ mailDomainId: d.id }}
                      className="font-medium text-tundra-aurora hover:underline"
                    >
                      {d.domain}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{d.mx_host}</td>
                  <td className="px-4 py-3">{activeBadge(d.active)}</td>
                  <td className="px-4 py-3">{webmailBadge(d.webmail_enabled)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {fmtDate(d.created_at)}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-tundra-ink-400">
                    No mail domains yet. Add your first domain to get started.
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
