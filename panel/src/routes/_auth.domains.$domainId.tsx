import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain, DnsRecord, ListResponse, Site, Server } from '@/lib/api-types'
import { fmtDate } from '@/lib/utils'
import { GlobeIcon, BoltIcon } from '@/components/icons'
import {
  RECORD_TYPE_CLS,
  TemplatePicker,
  TemplateImportModal,
  substituteContent,
  type DnsTemplate,
  type TplRecord,
} from '@/components/dns-templates'

export const Route = createFileRoute('/_auth/domains/$domainId')({
  component: DomainDetailPage,
})

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const
const PRIORITY_TYPES = new Set(['MX', 'SRV', 'CAA'])
const TYPE_CLS = RECORD_TYPE_CLS

const DNS_MANAGED_META: Record<Domain['dns_managed_by'], { label: string; cls: string; dot: string }> = {
  tundra:    { label: 'Tundra DNS',    cls: 'border-tundra-lichen-200 bg-tundra-lichen-50 text-tundra-lichen-800',  dot: 'bg-tundra-lichen'  },
  external:  { label: 'External DNS',  cls: 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-600',           dot: 'bg-tundra-ink-400' },
  registrar: { label: 'Registrar DNS', cls: 'border-tundra-aurora-200 bg-tundra-aurora-50 text-tundra-aurora-800',  dot: 'bg-tundra-aurora'  },
}

function DnsBadge({ dns }: { dns: Domain['dns_managed_by'] }) {
  const m = DNS_MANAGED_META[dns]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

// ─── Edit panel ───────────────────────────────────────────────────────────────

function EditPanel({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const qc = useQueryClient()
  const [dnsManagedBy, setDnsManagedBy] = useState(domain.dns_managed_by)
  const [autoRenew,    setAutoRenew]    = useState(domain.auto_renew)
  const [notes,        setNotes]        = useState(domain.notes ?? '')
  const [expires,      setExpires]      = useState(
    domain.registration_expires_at ? domain.registration_expires_at.slice(0, 10) : ''
  )

  const dirty = dnsManagedBy !== domain.dns_managed_by
    || autoRenew !== domain.auto_renew
    || notes !== (domain.notes ?? '')
    || expires !== (domain.registration_expires_at?.slice(0, 10) ?? '')

  const patchMut = useMutation({
    mutationFn: () => api(`/domains/${domain.id}`, {
      method: 'PATCH',
      body: {
        dns_managed_by: dnsManagedBy,
        auto_renew: autoRenew,
        notes: notes.trim() || null,
        registration_expires_at: expires ? `${expires}T00:00:00Z` : null,
      },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['domains', domain.id] })
      void qc.invalidateQueries({ queryKey: ['domains'] })
      toast.success('Domain updated')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  return (
    <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-tundra-ink">Edit domain settings</h3>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-tundra-ink-300 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">DNS managed by</label>
          <select value={dnsManagedBy} onChange={(e) => { setDnsManagedBy(e.target.value as Domain['dns_managed_by']) }}
            className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen">
            <option value="tundra">Tundra DNS</option>
            <option value="external">External DNS</option>
            <option value="registrar">Registrar DNS</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Registration expires</label>
          <input type="date" value={expires} onChange={(e) => { setExpires(e.target.value) }}
            className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Notes</label>
          <input type="text" value={notes} onChange={(e) => { setNotes(e.target.value) }}
            placeholder="Optional notes…"
            className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
        </div>
        <div className="flex items-center gap-2.5">
          <input type="checkbox" id="auto_renew_chk" checked={autoRenew} onChange={(e) => { setAutoRenew(e.target.checked) }}
            className="h-4 w-4 rounded accent-tundra-lichen" />
          <label htmlFor="auto_renew_chk" className="text-sm text-tundra-ink-600">Auto-renew registration</label>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-tundra-ink-100 px-5 py-3.5">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
          Cancel
        </button>
        <button type="button" disabled={!dirty || patchMut.isPending} onClick={() => { patchMut.mutate() }}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
          {patchMut.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DomainDetailPage() {
  const { domainId } = Route.useParams()
  const qc = useQueryClient()

  const [activeTab,        setActiveTab]        = useState<'overview' | 'dns'>('overview')
  const [showEdit,         setShowEdit]         = useState(false)
  const [showAdd,          setShowAdd]          = useState(false)
  const [showTemplates,    setShowTemplates]    = useState(false)
  const [activeTemplate,   setActiveTemplate]   = useState<DnsTemplate | null>(null)
  const [importingTpl,     setImportingTpl]     = useState(false)
  const [filterType,       setFilterType]       = useState('')
  const [newRec,           setNewRec]           = useState({ name: '', record_type: 'A', content: '', ttl: '3600', priority: '' })
  const [editingId,        setEditingId]        = useState<string | null>(null)
  const [editContent,      setEditContent]      = useState('')
  const [editTtl,          setEditTtl]          = useState('')
  const [editPriority,     setEditPriority]     = useState('')

  const { data: domain, isLoading: domainLoading, isError: domainError } = useQuery({
    queryKey: ['domains', domainId],
    queryFn: () => api<Domain>(`/domains/${domainId}`),
  })

  const { data: site } = useQuery({
    queryKey: ['sites', domain?.site_id],
    queryFn: () => api<Site>(`/sites/${domain!.site_id!}`),
    enabled: !!domain?.site_id,
  })

  const { data: server } = useQuery({
    queryKey: ['servers', site?.server_id],
    queryFn: () => api<Server>(`/servers/${site!.server_id}`),
    enabled: !!site?.server_id,
  })

  const { data: recordsData, isLoading: dnsLoading } = useQuery({
    queryKey: ['domains', domainId, 'dns-records'],
    queryFn: () => api<ListResponse<DnsRecord>>(`/domains/${domainId}/dns-records`),
  })

  const serverIp = server?.public_ip ?? ''
  const apex     = domain?.apex ?? ''

  const addMut = useMutation({
    mutationFn: () => api(`/domains/${domainId}/dns-records`, {
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
      void qc.invalidateQueries({ queryKey: ['domains', domainId, 'dns-records'] })
      toast.success('Record added')
      setShowAdd(false)
      setNewRec({ name: '', record_type: 'A', content: '', ttl: '3600', priority: '' })
    },
    onError: () => toast.error('Failed to add record'),
  })

  const deleteMut = useMutation({
    mutationFn: (recId: string) => api(`/domains/${domainId}/dns-records/${recId}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['domains', domainId, 'dns-records'] }); toast.success('Record deleted') },
    onError: () => toast.error('Failed to delete record'),
  })

  const editMut = useMutation({
    mutationFn: ({ recId, body }: { recId: string; body: { content: string; ttl: number; priority?: number } }) =>
      api(`/domains/${domainId}/dns-records/${recId}`, { method: 'PUT', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['domains', domainId, 'dns-records'] }); toast.success('Record updated'); setEditingId(null) },
    onError: () => toast.error('Failed to update record'),
  })

  async function handleImportTemplate(records: TplRecord[]) {
    setImportingTpl(true)
    let ok = 0; let fail = 0
    for (const r of records) {
      try {
        await api(`/domains/${domainId}/dns-records`, {
          method: 'POST',
          body: {
            name: r.name,
            record_type: r.record_type,
            content: substituteContent(r.content, serverIp, apex),
            ttl: r.ttl,
            priority: r.priority ?? null,
          },
        })
        ok++
      } catch { fail++ }
    }
    void qc.invalidateQueries({ queryKey: ['domains', domainId, 'dns-records'] })
    setImportingTpl(false)
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
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of records) m[r.record_type] = (m[r.record_type] ?? 0) + 1
    return m
  }, [records])

  if (domainLoading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-tundra-ink-100" />
      <div className="h-24 animate-pulse rounded-xl bg-tundra-ink-100" />
      <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
    </div>
  )
  if (domainError || !domain) return <p className="text-sm text-tundra-rust">Domain not found.</p>

  const dns = DNS_MANAGED_META[domain.dns_managed_by]

  // Registration expiry status
  const expiryDate = domain.registration_expires_at ? new Date(domain.registration_expires_at) : null
  const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000) : null
  const expiryStatus = daysUntilExpiry == null ? null : daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry < 30 ? 'warning' : 'ok'

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-tundra-ink-400">
        <Link to="/domains" className="hover:text-tundra-ink transition-colors">Domains</Link>
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        <span className="text-tundra-ink font-medium">{domain.apex}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-tundra-lichen-100 to-tundra-lichen-200 text-tundra-lichen shadow-sm">
            <GlobeIcon size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-tundra-ink">{domain.apex}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <DnsBadge dns={domain.dns_managed_by} />
              {domain.ns_locked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-tundra-ink-200 bg-tundra-ink-50 px-2 py-0.5 text-xs text-tundra-ink-500">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                  NS locked
                </span>
              )}
              {expiryStatus === 'expired' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Expired</span>
              )}
              {expiryStatus === 'warning' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                  Expires in {daysUntilExpiry}d
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {domain.site_id && (
            <Link to="/sites/$siteId" params={{ siteId: domain.site_id }}
              className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 000 18M12.5 3a17 17 0 010 18"/></svg>
              {domain.site_name ?? 'View site'}
            </Link>
          )}
          <button type="button" onClick={() => { setShowEdit(!showEdit) }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${showEdit ? 'border-tundra-lichen bg-tundra-lichen/10 text-tundra-lichen' : 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'}`}>
            {showEdit ? 'Close editor' : 'Edit settings'}
          </button>
        </div>
      </div>

      {showEdit && <EditPanel domain={domain} onClose={() => { setShowEdit(false) }} />}

      {/* Tabs */}
      <div className="flex border-b border-tundra-ink-200">
        {(['overview', 'dns'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => { setActiveTab(tab) }}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-tundra-lichen text-tundra-lichen'
                : 'border-transparent text-tundra-ink-500 hover:text-tundra-ink'
            }`}>
            {tab === 'dns' ? `DNS Zone${records.length ? ` (${records.length})` : ''}` : 'Overview'}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-tundra-ink-400">DNS</p>
              <p className="mt-0.5 text-sm font-semibold text-tundra-ink">{dns.label}</p>
            </div>
            <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-tundra-ink-400">Auto-renew</p>
              <p className={`mt-0.5 text-sm font-semibold ${domain.auto_renew ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>
                {domain.auto_renew ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${expiryStatus === 'expired' ? 'border-red-200 bg-red-50' : expiryStatus === 'warning' ? 'border-yellow-200 bg-yellow-50' : 'border-tundra-ink-200 bg-white'}`}>
              <p className="text-xs text-tundra-ink-400">Expires</p>
              <p className={`mt-0.5 text-sm font-semibold ${expiryStatus === 'expired' ? 'text-red-700' : expiryStatus === 'warning' ? 'text-yellow-700' : 'text-tundra-ink'}`}>
                {domain.registration_expires_at ? fmtDate(domain.registration_expires_at) : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-tundra-ink-400">Added</p>
              <p className="mt-0.5 text-sm font-semibold text-tundra-ink-500">{fmtDate(domain.created_at)}</p>
            </div>
          </div>

          {/* DNS records quick stat */}
          <div
            role="button"
            tabIndex={0}
            className="flex cursor-pointer items-center justify-between rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 hover:border-tundra-lichen hover:bg-tundra-ink-50 transition-colors"
            onClick={() => { setActiveTab('dns') }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('dns') }}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tundra-ink-100">
                <svg className="h-4 w-4 text-tundra-ink-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-tundra-ink">DNS Zone</p>
                <p className="text-xs text-tundra-ink-400">{records.length} record{records.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <svg className="h-4 w-4 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </div>

          {/* Notes */}
          {domain.notes && (
            <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
              <p className="mb-1 text-xs font-medium text-tundra-ink-400">Notes</p>
              <p className="text-sm text-tundra-ink-600">{domain.notes}</p>
            </div>
          )}

          {/* Tundra nameservers info */}
          {domain.dns_managed_by === 'tundra' && (
            <div className="overflow-hidden rounded-xl border border-tundra-lichen-200 bg-tundra-lichen-50">
              <div className="flex items-center gap-2 border-b border-tundra-lichen-200 px-4 py-3">
                <svg className="h-4 w-4 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
                </svg>
                <span className="text-sm font-semibold text-tundra-lichen-800">Tundra-managed DNS</span>
              </div>
              <div className="px-4 py-3">
                <p className="mb-2 text-xs text-tundra-lichen-700">Point your domain registrar to these nameservers:</p>
                <div className="flex flex-col gap-1">
                  {['ns1.tundra.local', 'ns2.tundra.local'].map((ns) => (
                    <div key={ns} className="flex items-center gap-2 rounded-lg border border-tundra-lichen-200 bg-white px-3 py-1.5">
                      <span className="font-mono text-sm text-tundra-ink">{ns}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-tundra-lichen-600">DNS propagation typically takes 24–48 hours.</p>
              </div>
            </div>
          )}

          {/* Linked site */}
          {domain.site_id && site && (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
              <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Linked site</p>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tundra-lichen-100 text-sm font-bold text-tundra-lichen-700">
                    {(site.name ?? domain.site_name ?? 'S').slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-tundra-ink">{site.name ?? domain.site_name}</p>
                    <p className="text-xs text-tundra-ink-400">{site.primary_domain}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/sites/$siteId" params={{ siteId: domain.site_id }}
                    className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                    Overview
                  </Link>
                  <Link to="/sites/$siteId/dns" params={{ siteId: domain.site_id }}
                    className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                    Site DNS
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* External DNS warning */}
          {domain.dns_managed_by !== 'tundra' && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              <span className="font-semibold">External DNS.</span> Records shown in the DNS Zone tab may not be authoritative. Changes must be made at your DNS provider.
            </div>
          )}
        </div>
      )}

      {/* ── DNS ZONE TAB ── */}
      {activeTab === 'dns' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {usedTypes.map((t) => (
                <button key={t} type="button" onClick={() => { setFilterType(filterType === t ? '' : t) }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${filterType === t ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'}`}>
                  {t} {typeCounts[t] ? <span className="opacity-70">({typeCounts[t]})</span> : null}
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
                  <select value={newRec.record_type} onChange={(e) => { setNewRec((r) => ({ ...r, record_type: e.target.value })) }}
                    className="w-full rounded-lg border border-tundra-ink-200 px-2 py-2 text-sm focus:border-tundra-lichen focus:outline-none">
                    {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Name</label>
                  <input type="text" placeholder="@" value={newRec.name} onChange={(e) => { setNewRec((r) => ({ ...r, name: e.target.value })) }}
                    className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Content</label>
                  <input type="text" placeholder="1.2.3.4" value={newRec.content} onChange={(e) => { setNewRec((r) => ({ ...r, content: e.target.value })) }}
                    className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-sm focus:border-tundra-lichen focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-tundra-ink-500">TTL (s)</label>
                  <input type="number" value={newRec.ttl} onChange={(e) => { setNewRec((r) => ({ ...r, ttl: e.target.value })) }}
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

          {dnsLoading ? (
            <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
              {domain.dns_managed_by !== 'tundra' && (
                <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-2.5 text-xs text-yellow-800">
                  DNS is managed externally — records shown here may not be authoritative.
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
                  <tr>
                    <th className="w-20 px-4 py-3 text-left font-semibold uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Content</th>
                    <th className="w-20 px-4 py-3 text-left font-semibold uppercase tracking-wide">TTL</th>
                    <th className="w-16 px-4 py-3 text-left font-semibold uppercase tracking-wide">Prio</th>
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
                              className="w-14 rounded-md border border-tundra-ink-200 px-2 py-1 text-xs focus:border-tundra-lichen focus:outline-none" />
                          ) : <span className="text-xs text-tundra-ink-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button type="button" onClick={() => { setEditingId(null) }} disabled={editMut.isPending}
                              className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-100 disabled:opacity-50 transition-colors">Cancel</button>
                            <button type="button" onClick={() => { saveEdit(r) }} disabled={!editContent || editMut.isPending}
                              className="rounded border border-tundra-lichen bg-tundra-lichen px-2 py-0.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
                              {editMut.isPending ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )

                    return (
                      <tr key={r.id} className={`transition-colors ${r.is_managed ? 'hover:bg-tundra-ink-50' : 'opacity-70 hover:bg-tundra-ink-50'}`}>
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
                              className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors">Edit</button>
                            <button type="button" disabled={deleteMut.isPending || editingId !== null}
                              onClick={() => { if (window.confirm(`Delete ${r.record_type} "${r.name}"?`)) deleteMut.mutate(r.id) }}
                              className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && !dnsLoading && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center">
                      <p className="text-sm text-tundra-ink-400">{filterType ? `No ${filterType} records.` : 'No DNS records yet.'}</p>
                      {!filterType && (
                        <button type="button" onClick={() => { setShowTemplates(true) }}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-tundra-lichen hover:underline">
                          <BoltIcon size={11} /> Use a template to add common records →
                        </button>
                      )}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTemplate && (
        <TemplateImportModal
          template={activeTemplate}
          ip={serverIp}
          domain={apex}
          onImport={(records) => { void handleImportTemplate(records) }}
          onClose={() => { setActiveTemplate(null) }}
          importing={importingTpl}
        />
      )}
    </div>
  )
}
