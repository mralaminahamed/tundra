import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_auth/audit-log')({
  component: AuditLogPage,
})

interface AuditEntry {
  id: string
  occurred_at: string
  actor_type: string
  actor_id: string | null
  actor_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  ip: string | null
  user_agent: string | null
  details: Record<string, unknown>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Backend emits time::OffsetDateTime.to_string() = "2026-05-08 19:53:42.671394 +00:00:00"
// Normalise to ISO 8601 so Date() can parse it.
function parseTs(ts: string): Date {
  const normalised = ts
    .replace(' ', 'T')                    // space → T
    .replace(/\s+\+/, '+')               // space before tz offset
    .replace(/\s+-/, '-')
    .replace(/:00$/, '')                  // drop trailing :00 in +00:00:00 → +00:00
    .replace(/(\+\d{2}:\d{2}):\d{2}$/, '$1') // +HH:MM:SS → +HH:MM
  return new Date(normalised)
}

function fmtOccurred(ts: string) {
  try {
    return parseTs(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return ts
  }
}

function fmtRelative(ts: string) {
  try {
    const diff = Date.now() - parseTs(ts).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  } catch {
    return ts
  }
}

const RESOURCE_COLORS: Record<string, string> = {
  server:     'bg-blue-50 text-blue-700 border-blue-200',
  site:       'bg-tundra-lichen-50 text-tundra-lichen-700 border-tundra-lichen-200',
  operator:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  domain:     'bg-slate-50 text-slate-600 border-slate-200',
  database:   'bg-purple-50 text-purple-700 border-purple-200',
  backup:     'bg-orange-50 text-orange-700 border-orange-200',
  plugin:     'bg-pink-50 text-pink-700 border-pink-200',
  passkey:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  alert_rule: 'bg-red-50 text-red-700 border-red-200',
  mail_domain:'bg-cyan-50 text-cyan-700 border-cyan-200',
}

function ResourceBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-tundra-ink-300">—</span>
  const cls = RESOURCE_COLORS[type] ?? 'bg-tundra-ink-50 text-tundra-ink-600 border-tundra-ink-200'
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}

function actionParts(action: string) {
  const parts = action.split('.')
  const verb = parts[parts.length - 1] ?? action
  const ns = parts.slice(0, -1).join('.')
  return { verb, ns }
}

function verbColor(verb: string) {
  if (['delete', 'destroy', 'remove', 'revoke', 'disable'].includes(verb)) return 'text-tundra-rust'
  if (['create', 'invite', 'register', 'enable', 'add'].includes(verb)) return 'text-tundra-lichen-700'
  if (['update', 'patch', 'edit', 'change', 'rotate'].includes(verb)) return 'text-blue-600'
  return 'text-tundra-ink'
}

const RESOURCE_TYPES = [
  'server', 'site', 'operator', 'domain', 'database',
  'backup', 'plugin', 'passkey', 'alert_rule', 'mail_domain',
]

const ACTION_PREFIXES = [
  'operator.', 'site.', 'server.', 'domain.', 'database.',
  'backup.', 'plugin.', 'passkey.', 'auth.',
]

// ─── Row detail expansion ─────────────────────────────────────────────────────

function DetailsPanel({ entry }: { entry: AuditEntry }) {
  const hasDetails = entry.details && Object.keys(entry.details).length > 0

  return (
    <tr>
      <td colSpan={6} className="px-4 pb-3 pt-0 bg-tundra-ink-50 border-b border-tundra-ink-100">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            {entry.actor_id && (
              <div className="flex gap-2">
                <span className="text-tundra-ink-400 w-20 shrink-0">Actor ID</span>
                <span className="font-mono text-tundra-ink-600 truncate">{entry.actor_id}</span>
              </div>
            )}
            {entry.resource_id && (
              <div className="flex gap-2">
                <span className="text-tundra-ink-400 w-20 shrink-0">Resource ID</span>
                <span className="font-mono text-tundra-ink-600 truncate">{entry.resource_id}</span>
              </div>
            )}
            {entry.ip && (
              <div className="flex gap-2">
                <span className="text-tundra-ink-400 w-20 shrink-0">IP</span>
                <span className="font-mono text-tundra-ink-600">{entry.ip}</span>
              </div>
            )}
            {entry.user_agent && (
              <div className="flex gap-2">
                <span className="text-tundra-ink-400 w-20 shrink-0">User agent</span>
                <span className="text-tundra-ink-500 truncate max-w-xs" title={entry.user_agent}>{entry.user_agent}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-tundra-ink-400 w-20 shrink-0">Entry ID</span>
              <span className="font-mono text-tundra-ink-400 text-[10px]">{entry.id}</span>
            </div>
          </div>
          {hasDetails && (
            <div>
              <p className="text-tundra-ink-400 mb-1">Details</p>
              <pre className="rounded bg-tundra-ink-900 p-2 text-tundra-ink-100 text-[10px] leading-relaxed overflow-auto max-h-32">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AuditLogPage() {
  const [cursor, setCursor] = useState<string | undefined>()
  const [history, setHistory] = useState<(string | undefined)[]>([undefined])
  const [historyIdx, setHistoryIdx] = useState(0)

  const [search,       setSearch]       = useState('')
  const [resourceType, setResourceType] = useState('')
  const [actionPrefix, setActionPrefix] = useState('')
  const [from,         setFrom]         = useState('')
  const [until,        setUntil]        = useState('')
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())

  const limit = 50

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['audit-log', cursor, search, resourceType, actionPrefix, from, until],
    queryFn: () => {
      const p = new URLSearchParams({ limit: String(limit) })
      if (cursor)       p.set('cursor', cursor)
      if (search)       p.set('search', search)
      if (resourceType) p.set('resource_type', resourceType)
      if (actionPrefix) p.set('action', actionPrefix)
      if (from)         p.set('from', from)
      if (until)        p.set('until', until)
      return api<{ data: AuditEntry[]; next_cursor: string | null }>(`/audit-log?${p}`)
    },
    staleTime: 10_000,
  })

  const entries = data?.data ?? []
  const nextCursor = data?.next_cursor ?? null

  function resetFilters() {
    setSearch(''); setResourceType(''); setActionPrefix(''); setFrom(''); setUntil('')
    setCursor(undefined); setHistory([undefined]); setHistoryIdx(0)
  }

  function goNext() {
    if (!nextCursor) return
    const newHistory = history.slice(0, historyIdx + 1)
    newHistory.push(nextCursor)
    setHistory(newHistory)
    setHistoryIdx(newHistory.length - 1)
    setCursor(nextCursor)
  }

  function goPrev() {
    if (historyIdx === 0) return
    const prev = history[historyIdx - 1]
    setHistoryIdx(historyIdx - 1)
    setCursor(prev)
  }

  function toggleExpand(id: string) {
    const s = new Set(expanded)
    if (s.has(id)) s.delete(id); else s.add(id)
    setExpanded(s)
  }

  const hasActiveFilter = search || resourceType || actionPrefix || from || until

  const exportUrl = (() => {
    const p = new URLSearchParams({ limit: '5000' })
    if (search)       p.set('search', search)
    if (resourceType) p.set('resource_type', resourceType)
    if (actionPrefix) p.set('action', actionPrefix)
    if (from)         p.set('from', from)
    if (until)        p.set('until', until)
    return `/api/v1/audit-log/export.csv?${p}`
  })()

  return (
    <div className="max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Audit Log</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">
            All state-changing operations, who performed them, and when.
          </p>
        </div>
        <a
          href={exportUrl}
          download="audit-log.csv"
          className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3.5 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {/* Search */}
          <div className="col-span-3 md:col-span-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-tundra-ink-300" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCursor(undefined); setHistoryIdx(0); setHistory([undefined]) }}
                placeholder="Search action or resource ID…"
                className="w-full rounded-lg border border-tundra-ink-200 py-2 pl-8 pr-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
            </div>
          </div>

          {/* Resource type */}
          <select
            value={resourceType}
            onChange={(e) => { setResourceType(e.target.value); setCursor(undefined); setHistoryIdx(0); setHistory([undefined]) }}
            className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm bg-white focus:border-tundra-lichen focus:outline-none"
          >
            <option value="">All resource types</option>
            {RESOURCE_TYPES.map((rt) => <option key={rt} value={rt}>{rt.replace(/_/g, ' ')}</option>)}
          </select>

          {/* Action prefix */}
          <select
            value={actionPrefix}
            onChange={(e) => { setActionPrefix(e.target.value); setCursor(undefined); setHistoryIdx(0); setHistory([undefined]) }}
            className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm bg-white focus:border-tundra-lichen focus:outline-none"
          >
            <option value="">All actions</option>
            {ACTION_PREFIXES.map((a) => <option key={a} value={a}>{a}*</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-tundra-ink-500 whitespace-nowrap">From</label>
            <input type="datetime-local" value={from}
              onChange={(e) => { setFrom(e.target.value); setCursor(undefined); setHistoryIdx(0); setHistory([undefined]) }}
              className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs focus:border-tundra-lichen focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-tundra-ink-500 whitespace-nowrap">Until</label>
            <input type="datetime-local" value={until}
              onChange={(e) => { setUntil(e.target.value); setCursor(undefined); setHistoryIdx(0); setHistory([undefined]) }}
              className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs focus:border-tundra-lichen focus:outline-none" />
          </div>
          {hasActiveFilter && (
            <button onClick={resetFilters}
              className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-rust transition-colors">
              Clear filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-tundra-ink-200 overflow-hidden">
        {isError && (
          <div className="py-10 text-center text-sm text-tundra-rust">Failed to load audit log.</div>
        )}

        {(isLoading || isFetching) && entries.length === 0 && (
          <div className="divide-y divide-tundra-ink-100">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-3 w-28 rounded bg-tundra-ink-100" />
                <div className="h-3 w-32 rounded bg-tundra-ink-100" />
                <div className="h-3 w-24 rounded bg-tundra-ink-100" />
                <div className="h-5 w-16 rounded-md bg-tundra-ink-100" />
                <div className="h-3 w-20 rounded bg-tundra-ink-100" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && entries.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-tundra-ink">No entries found</p>
            <p className="mt-1 text-xs text-tundra-ink-400">
              {hasActiveFilter ? 'Try adjusting your filters.' : 'No audit log entries recorded yet.'}
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50 border-b border-tundra-ink-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-tundra-ink-500 w-36">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-tundra-ink-500">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-tundra-ink-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-tundra-ink-500">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-tundra-ink-500 w-32">IP</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100 bg-white">
              {entries.map((e) => {
                const { verb, ns } = actionParts(e.action)
                const isExpanded = expanded.has(e.id)
                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => { toggleExpand(e.id) }}
                      className={`cursor-pointer transition-colors ${isExpanded ? 'bg-tundra-ink-50' : 'hover:bg-tundra-ink-50/60'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-tundra-ink tabular-nums">
                            {fmtOccurred(e.occurred_at)}
                          </span>
                          <span className="text-[10px] text-tundra-ink-300">
                            {fmtRelative(e.occurred_at)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {e.actor_email ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-tundra-ink">{e.actor_email}</span>
                            <span className="text-[10px] text-tundra-ink-300 capitalize">{e.actor_type}</span>
                          </div>
                        ) : (
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            e.actor_type === 'system' ? 'bg-tundra-ink-100 text-tundra-ink-500' : 'bg-tundra-aurora-50 text-tundra-aurora-700'
                          }`}>
                            {e.actor_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs font-semibold capitalize ${verbColor(verb)}`}>{verb.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] text-tundra-ink-300 font-mono">{ns}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ResourceBadge type={e.resource_type} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-tundra-ink-400">
                        {e.ip ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <svg
                          width={12} height={12} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                          className={`text-tundra-ink-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </td>
                    </tr>
                    {isExpanded && <DetailsPanel key={`${e.id}-detail`} entry={e} />}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(historyIdx > 0 || (entries.length === limit && nextCursor)) && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={goPrev}
            disabled={historyIdx === 0}
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-4 py-2 text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
          >
            ← Newer
          </button>
          <span className="text-xs text-tundra-ink-400">
            Page {historyIdx + 1} · {entries.length} entries
          </span>
          <button
            onClick={goNext}
            disabled={!nextCursor || entries.length < limit}
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-4 py-2 text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  )
}
