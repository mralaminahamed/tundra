import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain, DnsRecord, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/domains/$domainId')({
  component: DomainDetailPage,
})

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const

function dnsBadge(dns: Domain['dns_managed_by']) {
  const map: Record<string, string> = {
    tundra: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    external: 'bg-tundra-ink-100 text-tundra-ink-600',
    registrar: 'bg-tundra-aurora-100 text-tundra-aurora-800',
  }
  const labels: Record<string, string> = {
    tundra: 'Tundra DNS',
    external: 'External',
    registrar: 'Registrar',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[dns] ?? ''}`}
    >
      {labels[dns] ?? dns}
    </span>
  )
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="inline-block h-3.5 w-3.5 text-tundra-ink-400"
      aria-label="Managed record"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

interface AddRecordFormProps {
  domainId: string
  onSuccess: () => void
  onCancel: () => void
}

function AddRecordForm({ domainId, onSuccess, onCancel }: AddRecordFormProps) {
  const [name, setName] = useState('')
  const [recordType, setRecordType] = useState<string>('A')
  const [ttl, setTtl] = useState('300')
  const [priority, setPriority] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setLoading(true)
    api<DnsRecord>(`/domains/${domainId}/dns-records`, {
      method: 'POST',
      body: {
        name,
        record_type: recordType,
        ttl: Number(ttl),
        priority: priority ? Number(priority) : null,
        content,
      },
    })
      .then(() => {
        toast.success('DNS record added')
        onSuccess()
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to add DNS record')
      })
      .finally(() => { setLoading(false) })
  }

  return (
    <tr>
      <td colSpan={7} className="px-4 py-4 bg-tundra-ink-50">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-5 gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-tundra-ink-500">Name</label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value) }}
                placeholder="@"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-tundra-ink-500">Type</label>
              <select
                value={recordType}
                onChange={(e) => { setRecordType(e.target.value) }}
                className="rounded border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tundra-aurora"
              >
                {DNS_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-tundra-ink-500">TTL</label>
              <Input
                type="number"
                value={ttl}
                onChange={(e) => { setTtl(e.target.value) }}
                min="60"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-tundra-ink-500">Priority</label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => { setPriority(e.target.value) }}
                placeholder="—"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-tundra-ink-500">Content</label>
              <Input
                value={content}
                onChange={(e) => { setContent(e.target.value) }}
                placeholder="1.2.3.4"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>
              Add record
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </td>
    </tr>
  )
}

function DomainDetailPage() {
  const { domainId } = Route.useParams()
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: domain, isLoading: domainLoading, isError: domainError } = useQuery({
    queryKey: ['domains', domainId],
    queryFn: () => api<Domain>(`/domains/${domainId}`),
  })

  const { data: dnsData, isLoading: dnsLoading, isError: dnsError } = useQuery({
    queryKey: ['domains', domainId, 'dns-records'],
    queryFn: () => api<ListResponse<DnsRecord>>(`/domains/${domainId}/dns-records`),
  })

  function handleDeleteRecord(recordId: string): void {
    if (!window.confirm('Delete this DNS record? This cannot be undone.')) return
    api(`/domains/${domainId}/dns-records/${recordId}`, { method: 'DELETE' })
      .then(() => {
        toast.success('DNS record deleted')
        void queryClient.invalidateQueries({ queryKey: ['domains', domainId, 'dns-records'] })
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete record')
      })
  }

  function handleRecordAdded(): void {
    setShowAddForm(false)
    void queryClient.invalidateQueries({ queryKey: ['domains', domainId, 'dns-records'] })
  }

  if (domainLoading) return <p className="text-tundra-ink-400">Loading…</p>
  if (domainError || !domain) return <p className="text-tundra-rust">Domain not found.</p>

  const records = dnsData?.data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{domain.apex}</h1>
        {dnsBadge(domain.dns_managed_by)}
      </div>

      {/* Properties */}
      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border border-tundra-ink-200 p-6 text-sm max-w-xl">
        <dt className="font-medium">Apex</dt>
        <dd>{domain.apex}</dd>

        <dt className="font-medium">DNS managed by</dt>
        <dd>{dnsBadge(domain.dns_managed_by)}</dd>

        <dt className="font-medium">Auto-renew</dt>
        <dd>{domain.auto_renew ? 'Yes' : 'No'}</dd>

        <dt className="font-medium">Registration expires</dt>
        <dd>
          {domain.registration_expires_at
            ? fmtDate(domain.registration_expires_at)
            : '—'}
        </dd>

        <dt className="font-medium">Notes</dt>
        <dd className="text-tundra-ink-500">{domain.notes ?? '—'}</dd>

        <dt className="font-medium">Added</dt>
        <dd>{fmtDate(domain.created_at)}</dd>
      </dl>

      {/* DNS Zone Editor */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">DNS Zone</h2>
          {!showAddForm && (
            <Button onClick={() => { setShowAddForm(true) }}>
              + Add record
            </Button>
          )}
        </div>

        {dnsLoading && <p className="text-tundra-ink-400">Loading DNS records…</p>}
        {dnsError && <p className="text-tundra-rust">Failed to load DNS records.</p>}

        {!dnsLoading && !dnsError && (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">TTL</th>
                  <th className="px-4 py-3 text-left font-medium">Priority</th>
                  <th className="px-4 py-3 text-left font-medium">Content</th>
                  <th className="px-4 py-3 text-left font-medium">Managed</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-3 font-mono text-xs">{r.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-medium text-tundra-ink-700">
                        {r.record_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-500">{String(r.ttl)}</td>
                    <td className="px-4 py-3 text-tundra-ink-500">
                      {r.priority !== null ? String(r.priority) : '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-tundra-ink-600">
                      {r.content}
                    </td>
                    <td className="px-4 py-3">
                      {r.is_managed ? <LockIcon /> : null}
                    </td>
                    <td className="px-4 py-3">
                      {!r.is_managed && (
                        <button
                          type="button"
                          onClick={() => { handleDeleteRecord(r.id) }}
                          className="text-xs text-tundra-rust hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {showAddForm && (
                  <AddRecordForm
                    domainId={domainId}
                    onSuccess={handleRecordAdded}
                    onCancel={() => { setShowAddForm(false) }}
                  />
                )}
                {records.length === 0 && !showAddForm && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-tundra-ink-400">
                      No DNS records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
