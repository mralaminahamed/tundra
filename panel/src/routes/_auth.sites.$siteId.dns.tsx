import { createFileRoute } from '@tanstack/react-router'
import { BoltIcon } from '@/components/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain, DnsRecord, ListResponse, Site, Server } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import {
  RECORD_TYPE_CLS,
  TemplatePicker,
  TemplateImportModal,
  substituteContent,
  type DnsTemplate,
  type TplRecord,
} from '@/components/dns-templates'

export const Route = createFileRoute('/_auth/sites/$siteId/dns')({
  component: SiteDnsTab,
})

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const
const PRIORITY_TYPES = new Set(['MX', 'SRV', 'CAA'])
const TYPE_CLS = RECORD_TYPE_CLS

// ─── Main component ────────────────────────────────────────────────────────────

function SiteDnsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

  const [showAdd,           setShowAdd]           = useState(false)
  const [newRec,            setNewRec]            = useState({ name: '', record_type: 'A', content: '', ttl: '3600', priority: '' })
  const [showTemplates,     setShowTemplates]     = useState(false)
  const [activeTemplate,    setActiveTemplate]    = useState<DnsTemplate | null>(null)
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [filterType,        setFilterType]        = useState<string>('')
  const [editingId,         setEditingId]         = useState<string | null>(null)
  const [editContent,       setEditContent]       = useState('')
  const [editTtl,           setEditTtl]           = useState('')
  const [editPriority,      setEditPriority]      = useState('')

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })
  const { data: server } = useQuery({
    queryKey: ['servers', site?.server_id],
    queryFn: () => api<Server>(`/servers/${site!.server_id}`),
    enabled: !!site?.server_id,
  })

  const serverIp      = server?.public_ip ?? ''
  const primaryDomain = site?.primary_domain ?? ''

  const { data: domainsData } = useQuery({
    queryKey: ['sites', siteId, 'domains-dns'],
    queryFn: () => api<ListResponse<Domain>>(`/sites/${siteId}/domains`),
  })
  const domainId = domainsData?.data[0]?.id

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['dns-records', domainId],
    queryFn: () => api<ListResponse<DnsRecord>>(`/domains/${domainId}/dns-records`),
    enabled: !!domainId,
  })

  const addMut = useMutation({
    mutationFn: () =>
      api(`/domains/${domainId}/dns-records`, {
        method: 'POST',
        body: {
          name: newRec.name || '@',
          record_type: newRec.record_type,
          content: newRec.content,
          ttl: parseInt(newRec.ttl, 10) || 3600,
          priority: newRec.priority ? parseInt(newRec.priority, 10) : null,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dns-records', domainId] })
      toast.success('DNS record added')
      setShowAdd(false)
      setNewRec({ name: '', record_type: 'A', content: '', ttl: '3600', priority: '' })
    },
    onError: () => toast.error('Failed to add DNS record'),
  })

  const deleteMut = useMutation({
    mutationFn: (recId: string) => api(`/domains/${domainId}/dns-records/${recId}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dns-records', domainId] }); toast.success('DNS record deleted') },
    onError: () => toast.error('Failed to delete DNS record'),
  })

  const editMut = useMutation({
    mutationFn: ({ recId, body }: { recId: string; body: { content: string; ttl: number; priority?: number } }) =>
      api(`/domains/${domainId}/dns-records/${recId}`, { method: 'PUT', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dns-records', domainId] }); toast.success('Record updated'); setEditingId(null) },
    onError: () => toast.error('Failed to update DNS record'),
  })

  async function handleImportTemplate(records: TplRecord[]) {
    if (!domainId) return
    setImportingTemplate(true)
    let ok = 0; let fail = 0
    for (const r of records) {
      try {
        await api(`/domains/${domainId}/dns-records`, {
          method: 'POST',
          body: {
            name: r.name,
            record_type: r.record_type,
            content: substituteContent(r.content, serverIp, primaryDomain),
            ttl: r.ttl,
            priority: r.priority ?? null,
          },
        })
        ok++
      } catch { fail++ }
    }
    void qc.invalidateQueries({ queryKey: ['dns-records', domainId] })
    setImportingTemplate(false)
    setActiveTemplate(null)
    setShowTemplates(false)
    if (fail === 0) toast.success(`${String(ok)} record${ok !== 1 ? 's' : ''} imported`)
    else toast.warning(`${String(ok)} imported, ${String(fail)} failed`)
  }

  function startEdit(r: DnsRecord) { setEditingId(r.id); setEditContent(r.content); setEditTtl(String(r.ttl)); setEditPriority(r.priority != null ? String(r.priority) : '') }

  function saveEdit(r: DnsRecord) {
    const body: { content: string; ttl: number; priority?: number } = { content: editContent, ttl: parseInt(editTtl, 10) || r.ttl }
    if (PRIORITY_TYPES.has(r.record_type) && editPriority !== '') body.priority = parseInt(editPriority, 10)
    editMut.mutate({ recId: r.id, body })
  }

  const records   = recordsData?.data ?? []
  const filtered  = useMemo(() => filterType ? records.filter((r) => r.record_type === filterType) : records, [records, filterType])
  const usedTypes = [...new Set(records.map((r) => r.record_type))]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {usedTypes.map((t) => (
            <button key={t} type="button" onClick={() => { setFilterType(filterType === t ? '' : t) }}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${filterType === t ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'}`}>
              {t}
            </button>
          ))}
          {filterType && (
            <button type="button" onClick={() => { setFilterType('') }}
              className="rounded-full border border-tundra-ink-200 px-2.5 py-0.5 text-xs text-tundra-ink-400 hover:bg-tundra-ink-100">
              Clear ×
            </button>
          )}
        </div>
        <span className="text-xs text-tundra-ink-400">{filtered.length} records</span>
        <div className="ml-auto flex gap-2">
          <button type="button"
            onClick={() => { setShowTemplates(!showTemplates); setShowAdd(false) }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${showTemplates ? 'border-tundra-lichen bg-tundra-lichen/10 text-tundra-lichen' : 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'}`}>
            <BoltIcon size={12} /> Use template
          </button>
          <button type="button"
            onClick={() => { setShowAdd(!showAdd); setShowTemplates(false) }}
            className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            + Add record
          </button>
        </div>
      </div>

      {showTemplates && (
        <TemplatePicker onSelect={(t) => { setActiveTemplate(t); setShowTemplates(false) }} />
      )}

      {showAdd && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-tundra-ink">New DNS record</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Type</label>
              <select value={newRec.record_type}
                onChange={(e) => { setNewRec((r) => ({ ...r, record_type: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-2 py-2 text-sm focus:border-tundra-lichen focus:outline-none">
                {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Name</label>
              <input type="text" placeholder="@ or subdomain" value={newRec.name}
                onChange={(e) => { setNewRec((r) => ({ ...r, name: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Content</label>
              <input type="text" placeholder="IP address, hostname…" value={newRec.content}
                onChange={(e) => { setNewRec((r) => ({ ...r, content: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">TTL (s)</label>
              <input type="number" value={newRec.ttl}
                onChange={(e) => { setNewRec((r) => ({ ...r, ttl: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false) }}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="button" onClick={() => { addMut.mutate() }} disabled={!newRec.content || addMut.isPending}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {addMut.isPending ? 'Adding…' : 'Add record'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-tundra-ink-100"/>)}</div>
      ) : !domainId ? (
        <EmptyState message="No managed domain found for this site. Add a Tundra-managed domain first." />
      ) : filtered.length === 0 ? (
        <EmptyState message="No DNS records yet." action="Use a template →" onAction={() => { setShowTemplates(true) }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
              <tr>
                <th className="w-20 px-4 py-3 text-left font-semibold uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Content</th>
                <th className="w-20 px-4 py-3 text-left font-semibold uppercase tracking-wide">TTL</th>
                <th className="w-20 px-4 py-3 text-left font-semibold uppercase tracking-wide">Prio</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {filtered.map((r) => {
                const isEditing = editingId === r.id
                const showPrio  = PRIORITY_TYPES.has(r.record_type)

                if (isEditing) return (
                  <tr key={r.id} className="bg-tundra-ink-50/60">
                    <td className="px-4 py-3">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_CLS[r.record_type] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>{r.record_type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink">{r.name}</td>
                    <td className="px-4 py-3">
                      <input autoFocus type="text" value={editContent} onChange={(e) => { setEditContent(e.target.value) }}
                        className="w-full rounded-md border border-tundra-lichen px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" value={editTtl} onChange={(e) => { setEditTtl(e.target.value) }}
                        className="w-20 rounded-md border border-tundra-ink-200 px-2 py-1 text-xs focus:border-tundra-lichen focus:outline-none" />
                    </td>
                    <td className="px-4 py-3">
                      {showPrio ? (
                        <input type="number" value={editPriority} onChange={(e) => { setEditPriority(e.target.value) }} placeholder="0"
                          className="w-16 rounded-md border border-tundra-ink-200 px-2 py-1 text-xs focus:border-tundra-lichen focus:outline-none" />
                      ) : <span className="text-xs text-tundra-ink-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => { setEditingId(null) }} disabled={editMut.isPending}
                          className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-100 transition-colors disabled:opacity-50">Cancel</button>
                        <button type="button" onClick={() => { saveEdit(r) }} disabled={!editContent || editMut.isPending}
                          className="rounded border border-tundra-lichen bg-tundra-lichen px-2 py-0.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors disabled:opacity-50">
                          {editMut.isPending ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )

                return (
                  <tr key={r.id} className={`transition-colors ${r.is_managed ? 'hover:bg-tundra-ink-50' : 'bg-tundra-ink-50/50 opacity-70 hover:bg-tundra-ink-50'}`}>
                    <td className="px-4 py-2.5">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_CLS[r.record_type] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>{r.record_type}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tundra-ink">{r.name}</td>
                    <td className="max-w-xs px-4 py-2.5">
                      <span className="block truncate font-mono text-xs text-tundra-ink-600" title={r.content}>{r.content}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{r.ttl}s</td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{r.priority ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {!r.is_managed && <span className="text-[10px] italic text-tundra-ink-300">auto</span>}
                        <button type="button" onClick={() => { startEdit(r) }} disabled={editingId !== null || deleteMut.isPending}
                          className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-40">Edit</button>
                        <button type="button" disabled={deleteMut.isPending || editingId !== null}
                          onClick={() => { if (window.confirm(`Delete ${r.record_type} record "${r.name}"?`)) deleteMut.mutate(r.id) }}
                          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTemplate && (
        <TemplateImportModal template={activeTemplate} ip={serverIp} domain={primaryDomain}
          onImport={(records) => { void handleImportTemplate(records) }}
          onClose={() => { setActiveTemplate(null) }}
          importing={importingTemplate} />
      )}
    </div>
  )
}
