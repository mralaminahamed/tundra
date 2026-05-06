import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ListResponse, Server, Site } from '@/lib/api-types'
import { SectionCard } from '@/lib/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/settings')({
  component: SiteSettingsTab,
})

const INPUT = 'w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen'
const LABEL = 'mb-1.5 block text-sm font-medium text-tundra-ink'

function SiteSettingsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const [name, setName]   = useState('')
  const [domain, setDomain] = useState('')
  const [ready, setReady] = useState(false)

  // Sync with fetched data once
  if (site && !ready) {
    setName(site.name); setDomain(site.primary_domain); setReady(true)
  }

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/sites/${siteId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId] })
      void qc.invalidateQueries({ queryKey: ['sites'] })
      toast.success('Site updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const servers = serversData?.data ?? []
  const serverMap = new Map<string, Server>(servers.map((s) => [s.id, s]))
  const currentServer = site ? serverMap.get(site.server_id) : undefined

  const isDirty = ready && site && (name !== site.name || domain !== site.primary_domain)

  return (
    <div className="grid max-w-2xl gap-5">
      {/* General */}
      <SectionCard title="General">
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Display name</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value) }} className={INPUT} />
            <p className="mt-1 text-xs text-tundra-ink-400">Shown in the panel — does not affect the domain.</p>
          </div>
          <div>
            <label className={LABEL}>Primary domain</label>
            <input type="text" value={domain} onChange={(e) => { setDomain(e.target.value.toLowerCase()) }}
              placeholder="example.com" className={`${INPUT} font-mono`} />
            <p className="mt-1 text-xs text-tundra-ink-400">Changing the domain updates the Nginx vhost on the next deploy.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button"
              onClick={() => { updateMut.mutate({ name, primary_domain: domain }) }}
              disabled={!isDirty || updateMut.isPending}
              className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {updateMut.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button"
              onClick={() => { if (site) { setName(site.name); setDomain(site.primary_domain) } }}
              disabled={!isDirty}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors">
              Reset
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Read-only info */}
      <SectionCard title="Environment">
        <div className="divide-y divide-tundra-ink-100">
          {[
            { label: 'Site ID',       value: (site?.id.slice(0, 16) ?? '') + '…', mono: true },
            { label: 'Server',        value: currentServer?.name ?? site?.server_id.slice(0, 12) ?? '—' },
            { label: 'Document root', value: site?.document_root ?? '—', mono: true },
            { label: 'Source kind',   value: site?.source_kind ?? '—' },
          ].map(({ label, value, mono }) => (
            <div key={label} className="flex items-center gap-4 py-2.5 text-sm">
              <span className="w-32 shrink-0 text-tundra-ink-400">{label}</span>
              <span className={`text-tundra-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Suspend */}
      <SectionCard title="Site state">
        <div className="space-y-3">
          {site?.status === 'suspended' ? (
            <>
              <p className="text-sm text-tundra-ink-500">This site is currently <strong>suspended</strong>. Visitors see a suspended page.</p>
              <button type="button" onClick={() => { updateMut.mutate({ status: 'active' }) }}
                className="rounded-lg border border-tundra-lichen-300 px-4 py-2 text-sm font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-50 transition-colors">
                Unsuspend site
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-tundra-ink-500">Suspending the site takes it offline immediately. All data is preserved.</p>
              <button type="button" onClick={() => { updateMut.mutate({ status: 'suspended' }) }}
                className="rounded-lg border border-yellow-300 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 transition-colors">
                Suspend site
              </button>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
