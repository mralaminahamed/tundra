import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Deployment, ListResponse } from '@/lib/api-types'
import { DeployStatusBadge, EmptyState } from '@/components/site-shared'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/deployments')({
  component: SiteDeploymentsTab,
})

function SiteDeploymentsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()
  const [triggerRef, setTriggerRef] = useState('')

  const { data: deploys, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'deployments'],
    queryFn: () => api<ListResponse<Deployment>>(`/sites/${siteId}/deployments`),
    refetchInterval: 8_000,
  })

  const deployMut = useMutation({
    mutationFn: () =>
      api(`/sites/${siteId}/deployments`, { method: 'POST', body: { trigger: 'manual', ...(triggerRef ? { source_ref: triggerRef } : {}) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'deployments'] })
      toast.success('Deployment triggered')
      setTriggerRef('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Deploy failed'),
  })

  const list = deploys?.data ?? []

  return (
    <div className="space-y-4">
      {/* Trigger bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" placeholder="Source ref — optional"
          value={triggerRef}
          onChange={(e) => { setTriggerRef(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') deployMut.mutate() }}
          className="h-9 w-56 rounded-lg border border-tundra-ink-200 px-3 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
        <button type="button"
          onClick={() => { deployMut.mutate() }}
          disabled={deployMut.isPending}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
          {deployMut.isPending ? 'Deploying…' : 'Deploy now'}
        </button>
        <span className="ml-auto text-xs text-tundra-ink-300">Auto-refreshes every 8s</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState message="No deployments yet."
          action="Trigger first deployment →"
          onAction={() => { deployMut.mutate() }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Trigger</th>
                <th className="px-4 py-3 text-left">Source ref</th>
                <th className="px-4 py-3 text-left">Started</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {list.map((d) => (
                <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{d.id.slice(0, 14)}</td>
                  <td className="px-4 py-3"><DeployStatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 capitalize text-tundra-ink-500">{d.triggered_by}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">{d.source_ref ? d.source_ref.slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-tundra-ink-400">
                    {fmtDateTime(d.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button"
                        onClick={() => {
                          void api(`/sites/${siteId}/deployments`, { method: 'POST', body: { trigger: 'redeploy', source_ref: d.source_ref ?? undefined } })
                            .then(() => { void qc.invalidateQueries({ queryKey: ['sites', siteId, 'deployments'] }); toast.success('Redeployed') })
                            .catch((e: Error) => toast.error(e.message))
                        }}
                        className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                        Redeploy
                      </button>
                      {d.log_stream && (
                        <a href={d.log_stream} target="_blank" rel="noopener noreferrer"
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                          Logs ↗
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
