import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/lib/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/domains')({
  component: SiteDomainsTab,
})

function SiteDomainsTab() {
  const { siteId } = Route.useParams()
  const [addDomain, setAddDomain] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'domains'],
    queryFn: () => api<ListResponse<Domain>>(`/sites/${siteId}/domains`),
  })

  const domains = data?.data ?? []

  const DNS_MANAGED: Record<string, { dot: string; label: string }> = {
    tundra:    { dot: 'bg-tundra-lichen', label: 'Tundra DNS' },
    external:  { dot: 'bg-yellow-400', label: 'External DNS' },
    registrar: { dot: 'bg-tundra-aurora', label: 'Registrar DNS' },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{domains.length} domain{domains.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => { setShowAdd(!showAdd) }}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Add domain
        </button>
      </div>

      {showAdd && (
        <div className="flex gap-2">
          <input type="text" placeholder="example.com"
            value={addDomain}
            onChange={(e) => { setAddDomain(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') toast.info('Domain add coming soon') }}
            className="h-9 flex-1 rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none" />
          <button type="button"
            onClick={() => toast.info('Domain add coming soon')}
            disabled={!addDomain}
            className="rounded-lg bg-tundra-lichen px-4 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
            Add
          </button>
          <button type="button" onClick={() => { setShowAdd(false) }}
            className="rounded-lg border border-tundra-ink-200 px-3 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
            Cancel
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
      ) : domains.length === 0 ? (
        <EmptyState message="No additional domains configured." action="Add domain →" onAction={() => { setShowAdd(true) }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Domain</th>
                <th className="px-4 py-3 text-left">DNS Managed by</th>
                <th className="px-4 py-3 text-left">Expiry</th>
                <th className="px-4 py-3 text-left">Auto-renew</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {domains.map((d) => {
                const dns = DNS_MANAGED[d.dns_managed_by] ?? DNS_MANAGED.external
                return (
                  <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-tundra-ink">{d.apex}</p>
                      {d.notes && <p className="text-xs text-tundra-ink-400">{d.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${dns.dot}`} />
                        {dns.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-500">
                      {d.registration_expires_at
                        ? new Date(d.registration_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${d.auto_renew ? 'text-tundra-lichen-700' : 'text-tundra-ink-300'}`}>
                        {d.auto_renew ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <a href={`https://${d.apex}`} target="_blank" rel="noopener noreferrer"
                          className="rounded border border-tundra-ink-200 p-1.5 text-tundra-ink-400 hover:bg-tundra-ink-50 transition-colors">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                        <button type="button" onClick={() => toast.info('Domain remove coming soon')}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                          Remove
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
  )
}
