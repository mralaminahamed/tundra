import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import type { ListResponse, Site, Server } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/sites/')({
  component: SitesPage,
})

const STATUS_COLORS: Record<string, { dot: string; pill: string }> = {
  active:       { dot: 'bg-tundra-lichen',  pill: 'border-tundra-lichen-300 text-tundra-lichen-800 bg-tundra-lichen-50' },
  provisioning: { dot: 'bg-tundra-aurora',  pill: 'border-tundra-aurora-300 text-tundra-aurora-800 bg-tundra-aurora-50' },
  suspended:    { dot: 'bg-yellow-400',      pill: 'border-yellow-300 text-yellow-800 bg-yellow-50' },
  migrating:    { dot: 'bg-tundra-aurora',   pill: 'border-tundra-aurora-300 text-tundra-aurora-700 bg-tundra-aurora-50' },
  archived:     { dot: 'bg-tundra-ink-300',  pill: 'border-tundra-ink-200 text-tundra-ink-400 bg-tundra-ink-50' },
}

function StatusPill({ status }: { status: Site['status'] }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.archived
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot} ${status === 'provisioning' || status === 'migrating' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void navigator.clipboard.writeText(value).then(() => { toast.success(`${label} copied`) })
      }}
      className="opacity-0 group-hover:opacity-100 ml-1 rounded p-0.5 text-tundra-ink-300 hover:bg-tundra-ink-100 hover:text-tundra-ink transition-opacity"
      title={`Copy ${label}`}
    >
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7.414A2 2 0 0 0 11.414 6L8 2.586A2 2 0 0 0 6.586 2H4Zm0 1.5h2V6a1 1 0 0 0 1 1h2.5V12a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Zm3.5.621L9.879 6.5H8a.5.5 0 0 1-.5-.5V4.121Z"/>
      </svg>
    </button>
  )
}

function FleetCard({ label, value, color = 'ink' }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    ink:    'text-tundra-ink',
    lichen: 'text-tundra-lichen-700',
    yellow: 'text-yellow-700',
    rust:   'text-tundra-rust-700',
    aurora: 'text-tundra-aurora-700',
  }
  return (
    <div className="rounded-xl border border-tundra-ink-200 bg-white px-4 py-3">
      <p className="text-xs text-tundra-ink-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colors[color]}`}>{value}</p>
    </div>
  )
}

const STATUSES = ['active', 'provisioning', 'suspended', 'migrating', 'archived'] as const

function SitesPage() {
  const [search, setSearch] = useState('')
  const [filterServer, setFilterServer] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const serverMap = new Map<string, Server>((serversData?.data ?? []).map((s) => [s.id, s]))
  const sites = data?.data ?? []
  const servers = serversData?.data ?? []

  const q = search.toLowerCase()
  const filtered = sites.filter((s) => {
    if (filterServer && s.server_id !== filterServer) return false
    if (filterStatus && s.status !== filterStatus) return false
    if (q && !s.primary_domain.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q) && !s.document_root.toLowerCase().includes(q)) return false
    return true
  })

  const active       = sites.filter((s) => s.status === 'active').length
  const provisioning = sites.filter((s) => s.status === 'provisioning').length
  const suspended    = sites.filter((s) => s.status === 'suspended').length
  const migrating    = sites.filter((s) => s.status === 'migrating').length

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">Sites</h1>
          {sites.length > 0 && (
            <p className="mt-0.5 text-sm text-tundra-ink-400">
              {sites.length} site{sites.length !== 1 ? 's' : ''} across {servers.length} server{servers.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Link
          to="/sites/new"
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
        >
          + New site
        </Link>
      </div>

      {/* Fleet summary */}
      {sites.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <FleetCard label="Total" value={sites.length} />
          <FleetCard label="Active" value={active} color="lichen" />
          {suspended > 0 && <FleetCard label="Suspended" value={suspended} color="yellow" />}
          {provisioning > 0 && <FleetCard label="Provisioning" value={provisioning} color="aurora" />}
          {migrating > 0 && <FleetCard label="Migrating" value={migrating} color="aurora" />}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search domain, name, path…"
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="h-9 rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen w-56"
        />
        {servers.length > 1 && (
          <select
            value={filterServer}
            onChange={(e) => { setFilterServer(e.target.value) }}
            className="h-9 rounded-lg border border-tundra-ink-200 px-3 text-sm text-tundra-ink-700 focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
          >
            <option value="">All servers</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1.5">
          {STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => { setFilterStatus(filterStatus === st ? '' : st) }}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filterStatus === st
                  ? 'border-tundra-lichen bg-tundra-lichen text-white'
                  : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen hover:text-tundra-lichen-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-sm text-tundra-rust">Failed to load sites.</p>}

      {data && (
        <>
          {filtered.length === 0 && (
            <div className="rounded-xl border border-tundra-ink-200 py-16 text-center">
              <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
              </svg>
              <p className="text-sm text-tundra-ink-400">
                {sites.length === 0 ? 'No sites yet. Create your first site.' : 'No sites match the current filters.'}
              </p>
              {sites.length === 0 && (
                <Link to="/sites/new" className="mt-3 inline-block text-sm font-medium text-tundra-lichen hover:underline">
                  Create a site →
                </Link>
              )}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
              <table className="w-full text-sm">
                <thead className="bg-tundra-ink-50 border-b border-tundra-ink-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Server</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Document root</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {filtered.map((s) => {
                    const server = serverMap.get(s.server_id)
                    return (
                      <tr key={s.id} className={`group hover:bg-tundra-ink-50 transition-colors ${s.status === 'suspended' ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Link
                              to="/sites/$siteId"
                              params={{ siteId: s.id }}
                              className="font-semibold text-tundra-ink hover:text-tundra-aurora"
                            >
                              {s.primary_domain}
                            </Link>
                            <CopyBtn value={s.primary_domain} label="Domain" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-tundra-ink-500">{s.name}</td>
                        <td className="px-4 py-3">
                          {server ? (
                            <Link
                              to="/servers/$serverId"
                              params={{ serverId: server.id }}
                              className="text-tundra-ink-500 hover:text-tundra-aurora hover:underline"
                            >
                              {server.name}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-tundra-ink-400">{s.server_id.slice(0, 8)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className="max-w-[13rem] truncate font-mono text-xs text-tundra-ink-400" title={s.document_root}>
                              {s.document_root}
                            </span>
                            <CopyBtn value={s.document_root} label="Document root" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={s.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-tundra-ink-400 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <a
                              href={`https://${s.primary_domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-tundra-ink-300 hover:text-tundra-aurora transition-colors"
                              title={`Open https://${s.primary_domain}`}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" />
                                <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M10 14 21 3" strokeLinecap="round" />
                              </svg>
                            </a>
                            <Link
                              to="/sites/$siteId"
                              params={{ siteId: s.id }}
                              className="text-xs text-tundra-ink-400 hover:text-tundra-ink opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Details →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
