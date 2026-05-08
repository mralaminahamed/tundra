import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/domains')({
  component: SiteDomainsTab,
})

const DNS_MANAGED_META: Record<Domain['dns_managed_by'], { label: string; dot: string }> = {
  tundra:    { label: 'Tundra DNS',   dot: 'bg-tundra-lichen' },
  external:  { label: 'External DNS', dot: 'bg-yellow-400' },
  registrar: { label: 'Registrar',    dot: 'bg-tundra-aurora' },
}

function SiteDomainsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

  const [showAdd,      setShowAdd]      = useState(false)
  const [addApex,      setAddApex]      = useState('')
  const [addDns,       setAddDns]       = useState<Domain['dns_managed_by']>('tundra')
  const [addAutoRenew, setAddAutoRenew] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'domains'],
    queryFn: () => api<ListResponse<Domain>>(`/sites/${siteId}/domains`),
  })

  const domains   = data?.data ?? []
  const primaryId = domains[0]?.id

  const addMut = useMutation({
    mutationFn: () => api<Domain>(`/sites/${siteId}/domains`, {
      method: 'POST',
      body: { apex: addApex.trim().toLowerCase(), dns_managed_by: addDns, auto_renew: addAutoRenew },
    }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'domains'] })
      toast.success(`${d.apex} added`)
      setAddApex('')
      setAddDns('tundra')
      setAddAutoRenew(true)
      setShowAdd(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add domain'),
  })

  const removeMut = useMutation({
    mutationFn: (domainId: string) => api(`/domains/${domainId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'domains'] })
      toast.success('Domain removed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to remove domain'),
  })

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
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-tundra-ink">Attach domain to site</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Apex domain</label>
              <input type="text" placeholder="example.com" value={addApex}
                onChange={(e) => { setAddApex(e.target.value) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && addApex.trim()) addMut.mutate() }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">DNS managed by</label>
              <select value={addDns} onChange={(e) => { setAddDns(e.target.value as Domain['dns_managed_by']) }}
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none">
                <option value="tundra">Tundra DNS</option>
                <option value="external">External DNS</option>
                <option value="registrar">Registrar DNS</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={addAutoRenew} onChange={(e) => { setAddAutoRenew(e.target.checked) }}
              className="h-4 w-4 rounded accent-tundra-lichen" />
            <span className="text-xs text-tundra-ink-600">Auto-renew registration</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setAddApex('') }}
              className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
              Cancel
            </button>
            <button type="button" disabled={!addApex.trim() || addMut.isPending} onClick={() => { addMut.mutate() }}
              className="rounded-lg bg-tundra-lichen px-4 py-1.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {addMut.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
      ) : domains.length === 0 ? (
        <EmptyState message="No domains attached to this site." action="Add domain →" onAction={() => { setShowAdd(true) }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Domain</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">DNS</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Expires</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Auto-renew</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {domains.map((d) => {
                const dns       = DNS_MANAGED_META[d.dns_managed_by]
                const isPrimary = d.id === primaryId
                return (
                  <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link to="/domains/$domainId" params={{ domainId: d.id }}
                          className="font-semibold text-tundra-aurora hover:underline">{d.apex}</Link>
                        {isPrimary && (
                          <span className="rounded-full border border-tundra-lichen/40 bg-tundra-lichen/10 px-1.5 py-0.5 text-[10px] font-medium text-tundra-lichen-700">primary</span>
                        )}
                      </div>
                      {d.notes && <p className="text-xs text-tundra-ink-400">{d.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-tundra-ink-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${dns.dot}`} />
                        {dns.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-500">
                      {d.registration_expires_at ? fmtDate(d.registration_expires_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${d.auto_renew ? 'text-tundra-lichen-700' : 'text-tundra-ink-300'}`}>
                        {d.auto_renew ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <a href={`https://${d.apex}`} target="_blank" rel="noopener noreferrer"
                          className="rounded border border-tundra-ink-200 p-1.5 text-tundra-ink-400 hover:bg-tundra-ink-50 transition-colors" title="Open site">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                        <Link to="/domains/$domainId" params={{ domainId: d.id }}
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
                          DNS
                        </Link>
                        {!isPrimary && (
                          <button type="button" disabled={removeMut.isPending}
                            onClick={() => { if (window.confirm(`Remove "${d.apex}" from this site?`)) removeMut.mutate(d.id) }}
                            className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                            Remove
                          </button>
                        )}
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
