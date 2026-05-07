import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import type { ListResponse, Site, Server } from '@/lib/api-types'
import { resolveBadge } from '@/lib/source-badge'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/')({
  component: SitesPage,
})

// ── Types & constants ─────────────────────────────────────────────────────────

type SortKey = 'primary_domain' | 'name' | 'status' | 'created_at'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

const PAGE_SIZES = [10, 25, 50, 100] as const
const STATUSES = ['active', 'provisioning', 'suspended', 'migrating', 'archived'] as const

const STATUS_COLORS: Record<string, { dot: string; pill: string; bar: string }> = {
  active:       { dot: 'bg-tundra-lichen',       pill: 'border-tundra-lichen-300 text-tundra-lichen-800 bg-tundra-lichen-50',   bar: 'bg-tundra-lichen' },
  provisioning: { dot: 'bg-tundra-aurora animate-pulse', pill: 'border-tundra-aurora-300 text-tundra-aurora-800 bg-tundra-aurora-50', bar: 'bg-tundra-aurora' },
  suspended:    { dot: 'bg-yellow-400',           pill: 'border-yellow-300 text-yellow-800 bg-yellow-50',                        bar: 'bg-yellow-400' },
  migrating:    { dot: 'bg-tundra-aurora animate-pulse', pill: 'border-tundra-aurora-300 text-tundra-aurora-700 bg-tundra-aurora-50', bar: 'bg-tundra-aurora' },
  archived:     { dot: 'bg-tundra-ink-300',       pill: 'border-tundra-ink-200 text-tundra-ink-400 bg-tundra-ink-50',           bar: 'bg-tundra-ink-300' },
}

// ── Small components ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: Site['status'] }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.archived
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

function SourceBadge({ site, enabledPlugins }: { site: Site; enabledPlugins: string[] }) {
  const m = resolveBadge(site, enabledPlugins)
  if (!m) return null
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  )
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation()
        void navigator.clipboard.writeText(value).then(() => { toast.success(`${label} copied`) })
      }}
      className="ml-1 rounded p-0.5 text-tundra-ink-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-tundra-ink-100 hover:text-tundra-ink"
      title={`Copy ${label}`}
    >
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7.414A2 2 0 0 0 11.414 6L8 2.586A2 2 0 0 0 6.586 2H4Zm0 1.5h2V6a1 1 0 0 0 1 1h2.5V12a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Zm3.5.621L9.879 6.5H8a.5.5 0 0 1-.5-.5V4.121Z"/>
      </svg>
    </button>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return (
    <svg className="h-3 w-3 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>
    </svg>
  )
  return dir === 'asc' ? (
    <svg className="h-3 w-3 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M5 15l7-7 7 7"/>
    </svg>
  ) : (
    <svg className="h-3 w-3 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M19 9l-7 7-7-7"/>
    </svg>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({
  total, page, pageSize, onPage, onPageSize,
}: {
  total: number; page: number; pageSize: number
  onPage: (p: number) => void; onPageSize: (n: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4)               return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3)  return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }, [page, totalPages])

  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-tundra-ink-500">
          Showing <span className="font-medium text-tundra-ink">{from}–{to}</span> of{' '}
          <span className="font-medium text-tundra-ink">{total}</span> sites
        </span>
        <div className="flex items-center gap-1 text-xs text-tundra-ink-400">
          <span>Show:</span>
          {PAGE_SIZES.map((n) => (
            <button key={n} type="button"
              onClick={() => { onPageSize(n); onPage(1) }}
              className={`rounded px-2 py-0.5 font-medium transition-colors ${pageSize === n ? 'bg-tundra-lichen text-white' : 'text-tundra-ink-500 hover:bg-tundra-ink-200'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={page === 1} onClick={() => { onPage(1) }}
            className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors" title="First">«</button>
          <button type="button" disabled={page === 1} onClick={() => { onPage(page - 1) }}
            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors">‹ Prev</button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1.5 text-xs text-tundra-ink-300">…</span>
            ) : (
              <button key={p} type="button" onClick={() => { onPage(p as number) }}
                className={`min-w-[28px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
                  p === page ? 'border-tundra-lichen bg-tundra-lichen text-white' : 'border-tundra-ink-200 text-tundra-ink-500 hover:bg-tundra-ink-100'
                }`}>
                {p}
              </button>
            ),
          )}

          <button type="button" disabled={page === totalPages} onClick={() => { onPage(page + 1) }}
            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors">Next ›</button>
          <button type="button" disabled={page === totalPages} onClick={() => { onPage(totalPages) }}
            className="rounded border border-tundra-ink-200 px-2 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-100 disabled:opacity-40 transition-colors" title="Last">»</button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SitesPage() {
  const [search, setSearch]           = useState('')
  const [filterServer, setFilterServer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey]         = useState<SortKey>('created_at')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [view, setView]               = useState<ViewMode>('list')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(25)
  const [selected, setSelected]       = useState<Set<string>>(new Set())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<ListResponse<Site>>('/sites'),
  })

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  const { data: pluginsNav = [] } = useQuery<{ plugin_id: string; state: string }[]>({
    queryKey: ['plugins-nav'],
    queryFn: () =>
      fetch('/api/v1/plugins').then((r) => r.json()).then((r: { data: { plugin_id: string; state: string }[] }) => r.data),
    staleTime: 30_000,
  })

  const enabledPluginIds = pluginsNav.filter((p) => p.state === 'enabled').map((p) => p.plugin_id)
  const serverMap = new Map<string, Server>((serversData?.data ?? []).map((s) => [s.id, s]))
  const sites     = data?.data ?? []
  const servers   = serversData?.data ?? []

  // Stats per status
  const statCounts = useMemo(() =>
    Object.fromEntries(STATUSES.map((st) => [st, sites.filter((s) => s.status === st).length])),
    [sites],
  ) as Record<string, number>

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return sites
      .filter((s) => {
        if (filterServer && s.server_id !== filterServer) return false
        if (filterStatus && s.status !== filterStatus) return false
        if (q && !s.primary_domain.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q) && !s.document_root.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        const c = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? c : -c
      })
  }, [sites, search, filterServer, filterStatus, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const allPageSelected = paginated.length > 0 && paginated.every((s) => selected.has(s.id))

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function resetFilters() {
    setSearch(''); setFilterServer(''); setFilterStatus(''); setPage(1)
  }

  const hasActiveFilters = !!(search || filterServer || filterStatus)

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">Sites</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">
            {sites.length > 0
              ? `${sites.length} site${sites.length !== 1 ? 's' : ''} across ${servers.length} server${servers.length !== 1 ? 's' : ''}`
              : 'Manage all your hosted websites'}
          </p>
        </div>
        <Link to="/sites/new"
          className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New site
        </Link>
      </div>

      {/* Clickable stat pills */}
      {sites.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {/* Total */}
          <button type="button" onClick={() => { setFilterStatus(''); setPage(1) }}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors ${
              !filterStatus ? 'border-tundra-lichen/30 bg-tundra-lichen/5' : 'border-tundra-ink-200 bg-white hover:bg-tundra-ink-50'
            }`}>
            <span className={`text-xl font-bold tabular-nums ${!filterStatus ? 'text-tundra-lichen-700' : 'text-tundra-ink'}`}>{sites.length}</span>
            <span className="text-xs text-tundra-ink-400">Total</span>
          </button>
          {STATUSES.filter((st) => statCounts[st] > 0).map((st) => {
            const c = STATUS_COLORS[st]
            const active = filterStatus === st
            return (
              <button key={st} type="button"
                onClick={() => { setFilterStatus(active ? '' : st); setPage(1) }}
                className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-colors ${
                  active ? 'border-tundra-ink-300 bg-white shadow-sm ring-1 ring-tundra-ink-200' : 'border-tundra-ink-200 bg-white hover:bg-tundra-ink-50'
                }`}>
                <span className={`h-2 w-2 rounded-full ${c.bar}`} />
                <span className="text-xl font-bold tabular-nums text-tundra-ink">{statCounts[st]}</span>
                <span className="text-xs capitalize text-tundra-ink-400">{st}</span>
              </button>
            )
          })}
        </div>
      )}

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-sm text-tundra-rust">Failed to load sites.</p>}

      {data && sites.length === 0 && (
        <div className="rounded-2xl border border-dashed border-tundra-ink-200 p-16 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/>
          </svg>
          <p className="text-base font-semibold text-tundra-ink">No sites yet</p>
          <p className="mt-1 text-sm text-tundra-ink-400">Create your first site to get started.</p>
          <Link to="/sites/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-5 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            Create a site →
          </Link>
        </div>
      )}

      {data && sites.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            {/* Search */}
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Domain, name, path…" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="h-8 w-52 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
            </div>

            {/* Status chips */}
            <div className="flex flex-wrap gap-1">
              {STATUSES.filter((st) => statCounts[st] > 0).map((st) => (
                <button key={st} type="button"
                  onClick={() => { setFilterStatus(filterStatus === st ? '' : st); setPage(1) }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                    filterStatus === st
                      ? 'border-tundra-lichen bg-tundra-lichen text-white'
                      : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen hover:text-tundra-lichen-700'
                  }`}>
                  {st} ({statCounts[st]})
                </button>
              ))}
              {hasActiveFilters && (
                <button type="button" onClick={resetFilters}
                  className="rounded-full border border-tundra-ink-200 px-2.5 py-0.5 text-xs text-tundra-ink-400 hover:bg-tundra-ink-100 transition-colors">
                  Clear ×
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Server filter */}
              {servers.length > 1 && (
                <select value={filterServer}
                  onChange={(e) => { setFilterServer(e.target.value); setPage(1) }}
                  className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
                  <option value="">All servers</option>
                  {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}

              {/* Sort */}
              <select value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir]
                  setSortKey(k); setSortDir(d); setPage(1)
                }}
                className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
                <option value="created_at:desc">Newest first</option>
                <option value="created_at:asc">Oldest first</option>
                <option value="primary_domain:asc">Domain A→Z</option>
                <option value="primary_domain:desc">Domain Z→A</option>
                <option value="name:asc">Name A→Z</option>
                <option value="status:asc">Status</option>
              </select>

              {/* View toggle */}
              <div className="flex overflow-hidden rounded-lg border border-tundra-ink-200">
                {(['list', 'grid'] as const).map((v, i) => (
                  <button key={v} type="button" onClick={() => { setView(v) }} title={`${v} view`}
                    className={`px-2.5 py-1.5 transition-colors ${i > 0 ? 'border-l border-tundra-ink-200' : ''} ${view === v ? 'bg-tundra-lichen text-white' : 'bg-white text-tundra-ink-400 hover:bg-tundra-ink-50'}`}>
                    {v === 'list' ? (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-tundra-ink-100 bg-tundra-lichen/5 px-4 py-2">
              <span className="text-sm font-medium text-tundra-ink">{selected.size} selected</span>
              <button type="button"
                onClick={() => { toast.info('Bulk suspend coming soon') }}
                className="rounded-lg border border-yellow-200 px-3 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-50 transition-colors">
                Suspend
              </button>
              <button type="button"
                onClick={() => { toast.info('Bulk archive coming soon') }}
                className="rounded-lg border border-tundra-ink-200 px-3 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                Archive
              </button>
              <button type="button" onClick={() => { setSelected(new Set()) }}
                className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-ink">
                Clear selection
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <p className="text-sm text-tundra-ink-400">No sites match the current filters.</p>
              <button type="button" onClick={resetFilters}
                className="mt-2 text-xs font-medium text-tundra-lichen hover:underline">
                Clear filters
              </button>
            </div>
          ) : view === 'list' ? (
            <>
              <table className="w-full text-sm">
                <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allPageSelected}
                        onChange={() => {
                          if (allPageSelected) setSelected((s) => { const n = new Set(s); paginated.forEach((i) => n.delete(i.id)); return n })
                          else setSelected((s) => { const n = new Set(s); paginated.forEach((i) => n.add(i.id)); return n })
                        }}
                        className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                    </th>
                    {([
                      { key: 'primary_domain' as const, label: 'Domain' },
                      { key: 'name' as const,           label: 'Name', hide: 'hidden md:table-cell' },
                    ]).map(({ key, label, hide }) => (
                      <th key={key} className={`px-4 py-3 text-left ${hide ?? ''}`}>
                        <button type="button" onClick={() => { toggleSort(key) }}
                          className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors">
                          {label} <SortIcon active={sortKey === key} dir={sortDir} />
                        </button>
                      </th>
                    ))}
                    <th className="hidden px-4 py-3 text-left font-semibold uppercase tracking-wide lg:table-cell">Server</th>
                    <th className="hidden px-4 py-3 text-left font-semibold uppercase tracking-wide xl:table-cell">Document root</th>
                    <th className="px-4 py-3 text-left">
                      <button type="button" onClick={() => { toggleSort('status') }}
                        className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors">
                        Status <SortIcon active={sortKey === 'status'} dir={sortDir} />
                      </button>
                    </th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">
                      <button type="button" onClick={() => { toggleSort('created_at') }}
                        className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors">
                        Created <SortIcon active={sortKey === 'created_at'} dir={sortDir} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tundra-ink-100">
                  {paginated.map((s) => {
                    const server = serverMap.get(s.server_id)
                    const isSel  = selected.has(s.id)
                    return (
                      <tr key={s.id}
                        className={`group transition-colors ${isSel ? 'bg-tundra-lichen/5' : 'hover:bg-tundra-ink-50'} ${s.status === 'suspended' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={isSel}
                            onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                            className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                        </td>
                        {/* Domain */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Link to="/sites/$siteId" params={{ siteId: s.id }}
                              className="font-semibold text-tundra-ink hover:text-tundra-aurora transition-colors">
                              {s.primary_domain}
                            </Link>
                            <CopyBtn value={s.primary_domain} label="Domain" />
                          </div>
                        </td>
                        {/* Name */}
                        <td className="hidden px-4 py-3 text-tundra-ink-500 md:table-cell">{s.name}</td>
                        {/* Server */}
                        <td className="hidden px-4 py-3 lg:table-cell">
                          {server ? (
                            <Link to="/servers/$serverId" params={{ serverId: server.id }}
                              className="text-tundra-ink-500 hover:text-tundra-aurora hover:underline">
                              {server.name}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-tundra-ink-400">{s.server_id.slice(0, 8)}</span>
                          )}
                        </td>
                        {/* Doc root */}
                        <td className="hidden px-4 py-3 xl:table-cell">
                          <div className="flex items-center gap-1">
                            <span className="max-w-[12rem] truncate font-mono text-xs text-tundra-ink-400" title={s.document_root}>
                              {s.document_root}
                            </span>
                            <CopyBtn value={s.document_root} label="Document root" />
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusPill status={s.status} />
                            <SourceBadge site={s} enabledPlugins={enabledPluginIds} />
                          </div>
                        </td>
                        {/* Date */}
                        <td className="hidden px-4 py-3 text-xs text-tundra-ink-400 whitespace-nowrap lg:table-cell">
                          {fmtDate(s.created_at)}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <a href={`https://${s.primary_domain}`} target="_blank" rel="noopener noreferrer"
                              title="Open site"
                              className="rounded-lg border border-tundra-ink-200 p-1.5 text-tundra-ink-400 hover:bg-tundra-ink-50 hover:text-tundra-aurora transition-colors">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" strokeLinecap="round"/>
                                <path d="M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </a>
                            <Link to="/sites/$siteId" params={{ siteId: s.id }}
                              className="rounded-lg border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                              Manage →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pagination total={filtered.length} page={safePage} pageSize={pageSize}
                onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }} />
            </>
          ) : (
            /* Grid view */
            <>
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginated.map((s) => {
                  const server = serverMap.get(s.server_id)
                  const isSel  = selected.has(s.id)
                  const c      = STATUS_COLORS[s.status] ?? STATUS_COLORS.archived
                  return (
                    <div key={s.id}
                      className={`relative overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md ${isSel ? 'border-tundra-lichen ring-1 ring-tundra-lichen' : 'border-tundra-ink-200'}`}>
                      {/* Status bar */}
                      <div className={`h-1 w-full ${c.bar}`} />

                      <div className="p-4">
                        {/* Checkbox */}
                        <div className="mb-3 flex items-start justify-between">
                          <input type="checkbox" checked={isSel}
                            onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })}
                            className="h-3.5 w-3.5 rounded border-tundra-ink-300 accent-tundra-lichen" />
                          <div className="flex items-center gap-1">
                            <StatusPill status={s.status} />
                            <SourceBadge site={s} enabledPlugins={enabledPluginIds} />
                          </div>
                        </div>

                        <Link to="/sites/$siteId" params={{ siteId: s.id }}
                          className="block font-semibold text-tundra-ink hover:text-tundra-aurora transition-colors truncate">
                          {s.primary_domain}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-tundra-ink-400">{s.name}</p>

                        {server && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-tundra-ink-400">
                            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                            </svg>
                            {server.name}
                          </p>
                        )}

                        <p className="mt-1 text-xs text-tundra-ink-300">
                          {fmtDate(s.created_at)}
                        </p>
                      </div>

                      <div className="flex gap-1.5 border-t border-tundra-ink-100 p-3">
                        <a href={`https://${s.primary_domain}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center rounded-lg border border-tundra-ink-200 p-1.5 text-tundra-ink-400 hover:bg-tundra-ink-50 hover:text-tundra-aurora transition-colors">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                        <Link to="/sites/$siteId" params={{ siteId: s.id }}
                          className="flex-1 rounded-lg border border-tundra-ink-200 py-1.5 text-center text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                          Manage →
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Pagination total={filtered.length} page={safePage} pageSize={pageSize}
                onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
