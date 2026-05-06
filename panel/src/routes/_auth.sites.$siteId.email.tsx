import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Mailbox, Alias, MailDomain, ListResponse, Site } from '@/lib/api-types'
import { EmptyState } from '@/lib/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/email')({
  component: SiteEmailTab,
})

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function SiteEmailTab() {
  const { siteId } = Route.useParams()
  const [subTab, setSubTab] = useState<'mailboxes' | 'aliases'>('mailboxes')

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  // Find the MailDomain for this site's primary domain
  const { data: mailDomainsData } = useQuery({
    queryKey: ['mail-domains-all'],
    queryFn: () => api<ListResponse<MailDomain>>('/mail/domains'),
  })
  const mailDomain = mailDomainsData?.data.find((d) => site && d.domain === site.primary_domain)

  const { data: mailboxesData, isLoading: mbLoading } = useQuery({
    queryKey: ['mail-mailboxes', mailDomain?.id],
    queryFn: () => api<ListResponse<Mailbox>>(`/mail/domains/${mailDomain!.id}/mailboxes`),
    enabled: !!mailDomain,
  })

  const { data: aliasesData, isLoading: alLoading } = useQuery({
    queryKey: ['mail-aliases', mailDomain?.id],
    queryFn: () => api<ListResponse<Alias>>(`/mail/domains/${mailDomain!.id}/aliases`),
    enabled: !!mailDomain,
  })

  const mailboxes = mailboxesData?.data ?? []
  const aliases   = aliasesData?.data ?? []

  if (!mailDomain) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-tundra-ink-200 p-12 text-center">
          <svg className="mx-auto mb-3 h-10 w-10 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <p className="text-sm font-semibold text-tundra-ink">No mail domain configured</p>
          <p className="mt-1 text-xs text-tundra-ink-400">
            Set up a mail domain for <strong>{site?.primary_domain}</strong> to manage mailboxes.
          </p>
          <button type="button" onClick={() => toast.info('Mail domain setup coming soon')}
            className="mt-4 rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            Set up mail domain
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Mail domain info */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Mail Domain</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${mailDomain.active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
            {mailDomain.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-tundra-ink-100 sm:grid-cols-4">
          {[
            { label: 'Domain',  value: mailDomain.domain },
            { label: 'MX Host', value: mailDomain.mx_host },
            { label: 'SPF',     value: mailDomain.spf_policy || '—' },
            { label: 'DMARC',   value: mailDomain.dmarc_policy || '—' },
          ].map(({ label, value }) => (
            <div key={label} className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">{label}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-tundra-ink" title={value}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0.5 border-b border-tundra-ink-200">
        {(['mailboxes', 'aliases'] as const).map((t) => (
          <button key={t} type="button" onClick={() => { setSubTab(t) }}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize -mb-px transition-colors ${
              subTab === t ? 'border-tundra-lichen text-tundra-lichen-700' : 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
            }`}>
            {t}
            <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs text-tundra-ink-500">
              {t === 'mailboxes' ? mailboxes.length : aliases.length}
            </span>
          </button>
        ))}
      </div>

      {subTab === 'mailboxes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => toast.info('Create mailbox coming soon')}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              + Create mailbox
            </button>
          </div>
          {mbLoading ? (
            <div className="space-y-2">{[1,2,3].map((i)=><div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100"/>)}</div>
          ) : mailboxes.length === 0 ? (
            <EmptyState message="No mailboxes yet." action="Create first mailbox →" onAction={() => toast.info('Create mailbox coming soon')} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
                  <tr>
                    <th className="px-4 py-3 text-left">Address</th>
                    <th className="px-4 py-3 text-left">Quota</th>
                    <th className="px-4 py-3 text-left">Used</th>
                    <th className="px-4 py-3 text-left">State</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {mailboxes.map((m) => {
                    const pct = m.quota_bytes > 0 ? Math.round((m.used_bytes / m.quota_bytes) * 100) : 0
                    return (
                      <tr key={m.id} className="hover:bg-tundra-ink-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm text-tundra-ink">
                          {m.local_part}@{mailDomain.domain}
                        </td>
                        <td className="px-4 py-3 text-xs text-tundra-ink-500">{fmtBytes(m.quota_bytes)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-tundra-ink-100">
                              <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-400' : 'bg-tundra-lichen'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-tundra-ink-400">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${m.is_active ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700' : 'border-tundra-ink-200 text-tundra-ink-400'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${m.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                            {m.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button type="button" onClick={() => toast.info('Change password coming soon')}
                              className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                              Change password
                            </button>
                            <button type="button" onClick={() => toast.info('Delete mailbox coming soon')}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'aliases' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => toast.info('Create alias coming soon')}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              + Create alias
            </button>
          </div>
          {alLoading ? (
            <div className="space-y-2">{[1,2].map((i)=><div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100"/>)}</div>
          ) : aliases.length === 0 ? (
            <EmptyState message="No aliases yet." action="Create first alias →" onAction={() => toast.info('Create alias coming soon')} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
                  <tr>
                    <th className="px-4 py-3 text-left">From</th>
                    <th className="px-4 py-3 text-left">To</th>
                    <th className="px-4 py-3 text-left">State</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {aliases.map((a) => (
                    <tr key={a.id} className="hover:bg-tundra-ink-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm text-tundra-ink">{a.source}</td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{a.destinations.join(', ')}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${a.is_active ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>
                          {a.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => toast.info('Edit alias coming soon')}
                            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Edit</button>
                          <button type="button" onClick={() => toast.info('Delete alias coming soon')}
                            className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
