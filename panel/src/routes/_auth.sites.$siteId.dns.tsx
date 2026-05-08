import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain, DnsRecord, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/dns')({
  component: SiteDnsTab,
})

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const
const PRIORITY_TYPES = new Set(['MX', 'SRV', 'CAA'])

function SiteDnsTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

  // Add-record form state
  const [showAdd, setShowAdd] = useState(false)
  const [newRec, setNewRec] = useState({ name: '', record_type: 'A', content: '', ttl: '3600', priority: '' })

  // Filter state
  const [filterType, setFilterType] = useState<string>('')

  // Inline-edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTtl, setEditTtl] = useState('')
  const [editPriority, setEditPriority] = useState('')

  // Fetch the site's primary domain record first to get domain_id
  const { data: domainsData } = useQuery({
    queryKey: ['sites', siteId, 'domains-dns'],
    queryFn: () => api<ListResponse<Domain>>(`/sites/${siteId}/domains`),
  })
  const domainId = domainsData?.data[0]?.id

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['dns-records', domainId],
    queryFn: () => api<ListResponse<DnsRecord>>(`/domains/${domainId}/dns`),
    enabled: !!domainId,
  })

  const addMut = useMutation({
    mutationFn: () =>
      api(`/domains/${domainId}/dns`, {
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
    mutationFn: (recId: string) =>
      api(`/domains/${domainId}/dns/${recId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dns-records', domainId] })
      toast.success('DNS record deleted')
    },
    onError: () => toast.error('Failed to delete DNS record'),
  })

  const editMut = useMutation({
    mutationFn: ({ recId, body }: { recId: string; body: { content: string; ttl: number; priority?: number } }) =>
      api(`/domains/${domainId}/dns-records/${recId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dns-records', domainId] })
      toast.success('Record updated')
      setEditingId(null)
    },
    onError: () => toast.error('Failed to update DNS record'),
  })

  function startEdit(r: DnsRecord) {
    setEditingId(r.id)
    setEditContent(r.content)
    setEditTtl(String(r.ttl))
    setEditPriority(r.priority != null ? String(r.priority) : '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function saveEdit(r: DnsRecord) {
    const body: { content: string; ttl: number; priority?: number } = {
      content: editContent,
      ttl: parseInt(editTtl, 10) || r.ttl,
    }
    if (PRIORITY_TYPES.has(r.record_type) && editPriority !== '') {
      body.priority = parseInt(editPriority, 10)
    }
    editMut.mutate({ recId: r.id, body })
  }

  const records = recordsData?.data ?? []
  const filtered = filterType ? records.filter((r) => r.record_type === filterType) : records
  const usedTypes = [...new Set(records.map((r) => r.record_type))]

  const TYPE_CLS: Record<string, string> = {
    A:     'border-blue-200 bg-blue-50 text-blue-700',
    AAAA:  'border-indigo-200 bg-indigo-50 text-indigo-700',
    CNAME: 'border-purple-200 bg-purple-50 text-purple-700',
    MX:    'border-orange-200 bg-orange-50 text-orange-700',
    TXT:   'border-gray-200 bg-gray-50 text-gray-600',
    NS:    'border-teal-200 bg-teal-50 text-teal-700',
    SRV:   'border-pink-200 bg-pink-50 text-pink-700',
    CAA:   'border-red-200 bg-red-50 text-red-600',
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {usedTypes.map((t) => (
            <button key={t} type="button"
              onClick={() => { setFilterType(filterType === t ? '' : t) }}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                filterType === t ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
              }`}>
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
          <button type="button" onClick={() => toast.info('Zone import coming soon')}
            className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            Import zone
          </button>
          <button type="button" onClick={() => { setShowAdd(!showAdd) }}
            className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            + Add record
          </button>
        </div>
      </div>

      {/* Add form */}
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
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={() => { addMut.mutate() }}
              disabled={!newRec.content || addMut.isPending}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {addMut.isPending ? 'Adding…' : 'Add record'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i)=><div key={i} className="h-11 animate-pulse rounded-xl bg-tundra-ink-100"/>)}</div>
      ) : !domainId ? (
        <EmptyState message="No managed domain found for this site. Add a Tundra-managed domain first." />
      ) : filtered.length === 0 ? (
        <EmptyState message="No DNS records yet." action="Add first record →" onAction={() => { setShowAdd(true) }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="w-20 px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Content</th>
                <th className="w-20 px-4 py-3 text-left">TTL</th>
                <th className="w-20 px-4 py-3 text-left">Prio</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {filtered.map((r) => {
                const isEditing = editingId === r.id
                const showPriority = PRIORITY_TYPES.has(r.record_type)

                if (isEditing) {
                  return (
                    <tr key={r.id} className="bg-tundra-ink-50/60">
                      {/* Type badge — read-only while editing */}
                      <td className="px-4 py-3">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_CLS[r.record_type] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                          {r.record_type}
                        </span>
                      </td>
                      {/* Name — read-only while editing */}
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink">{r.name}</td>
                      {/* Content input */}
                      <td className="px-4 py-3">
                        <input
                          autoFocus
                          type="text"
                          value={editContent}
                          onChange={(e) => { setEditContent(e.target.value) }}
                          className="w-full rounded-md border border-tundra-lichen px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                        />
                      </td>
                      {/* TTL input */}
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={editTtl}
                          onChange={(e) => { setEditTtl(e.target.value) }}
                          className="w-20 rounded-md border border-tundra-ink-200 px-2 py-1 text-xs focus:border-tundra-lichen focus:outline-none"
                        />
                      </td>
                      {/* Priority input (conditional) */}
                      <td className="px-4 py-3">
                        {showPriority ? (
                          <input
                            type="number"
                            value={editPriority}
                            onChange={(e) => { setEditPriority(e.target.value) }}
                            placeholder="0"
                            className="w-16 rounded-md border border-tundra-ink-200 px-2 py-1 text-xs focus:border-tundra-lichen focus:outline-none"
                          />
                        ) : (
                          <span className="text-xs text-tundra-ink-300">—</span>
                        )}
                      </td>
                      {/* Save / Cancel */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => { cancelEdit() }}
                            disabled={editMut.isPending}
                            className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-100 transition-colors disabled:opacity-50">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => { saveEdit(r) }}
                            disabled={!editContent || editMut.isPending}
                            className="rounded border border-tundra-lichen bg-tundra-lichen px-2 py-0.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 transition-colors disabled:opacity-50">
                            {editMut.isPending ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={r.id} className={`transition-colors ${r.is_managed ? 'hover:bg-tundra-ink-50' : 'bg-tundra-ink-50/50 opacity-70 hover:bg-tundra-ink-50'}`}>
                    <td className="px-4 py-2.5">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_CLS[r.record_type] ?? 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                        {r.record_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-tundra-ink">{r.name}</td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className="block truncate font-mono text-xs text-tundra-ink-600" title={r.content}>{r.content}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{r.ttl}s</td>
                    <td className="px-4 py-2.5 text-xs text-tundra-ink-400">{r.priority ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {!r.is_managed && <span className="text-[10px] text-tundra-ink-300 italic">auto</span>}
                        <button
                          type="button"
                          onClick={() => { startEdit(r) }}
                          disabled={editingId !== null || deleteMut.isPending}
                          className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-40">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete ${r.record_type} record "${r.name}"?`)) {
                              deleteMut.mutate(r.id)
                            }
                          }}
                          disabled={deleteMut.isPending || editingId !== null}
                          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
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
  )
}
