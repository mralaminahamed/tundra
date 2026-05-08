import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/alerts')({
  component: AlertsPage,
})

interface AlertRule {
  id: string
  name: string
  description: string | null
  scope_type: string
  scope_id: string | null
  metric: string
  condition: string
  threshold: number
  duration_secs: number
  severity: 'info' | 'warning' | 'critical'
  is_enabled: boolean
  created_at: string
}

interface AlertDelivery {
  id: string
  rule_id: string
  scope_id: string | null
  fired_at: string
  resolved_at: string | null
  current_value: number
  threshold: number
  delivery_status: string
}

type SortKey = 'name' | 'severity' | 'scope_type'
type SortDir = 'asc' | 'desc'

const SEVERITY_ORDER = { info: 0, warning: 1, critical: 2 }

const SEVERITY_COLORS: Record<string, string> = {
  info:     'bg-tundra-aurora-50 text-tundra-aurora-700 border-tundra-aurora-200',
  warning:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
}

function AlertsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState<SortKey>('name')
  const [sortDir,    setSortDir]    = useState<SortDir>('asc')

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => api<{ data: AlertRule[] }>('/alert-rules'),
  })

  const { data: deliveriesData } = useQuery({
    queryKey: ['alert-deliveries'],
    queryFn: () => api<{ data: AlertDelivery[] }>('/alert-deliveries?limit=20'),
  })

  const enableMutation = useMutation({
    mutationFn: (id: string) => api(`/alert-rules/${id}/enable`, { method: 'PATCH' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['alert-rules'] }); toast.success('Rule enabled') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => api(`/alert-rules/${id}/disable`, { method: 'PATCH' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['alert-rules'] }); toast.success('Rule disabled') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/alert-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['alert-rules'] }); toast.success('Rule deleted') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const allRules = rulesData?.data ?? []
  const activeDeliveries = (deliveriesData?.data ?? []).filter((d) => !d.resolved_at)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allRules
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.metric.toLowerCase().includes(q) || r.scope_type.includes(q))
      .sort((a, b) => {
        if (sortKey === 'severity') {
          const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
          return sortDir === 'asc' ? diff : -diff
        }
        const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [allRules, search, sortKey, sortDir])

  const pg = usePagination(filtered, 25)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    pg.setPage(1)
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <svg className={`h-3 w-3 ${sortKey === k ? 'text-tundra-lichen' : 'text-tundra-ink-300'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      {sortKey !== k ? <path d="M8 9l4-4 4 4M8 15l4 4 4-4" /> : sortDir === 'asc' ? <path d="M12 5l-7 7h14z" /> : <path d="M12 19l7-7H5z" />}
    </svg>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Alerts</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">{allRules.length} rule{allRules.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowCreate(true) }}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Create rule
        </button>
      </div>

      {/* Active alerts */}
      {activeDeliveries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-red-200 bg-white">
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-red-700">
              {activeDeliveries.length} active alert{activeDeliveries.length !== 1 ? 's' : ''}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-red-100 text-xs text-red-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Rule</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Value</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Threshold</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Fired</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {activeDeliveries.map((d) => {
                const rule = allRules.find((r) => r.id === d.rule_id)
                return (
                  <tr key={d.id} className="bg-red-50/30">
                    <td className="px-4 py-3 font-medium text-tundra-ink">{rule?.name ?? d.rule_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-red-700">{d.current_value.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{d.threshold.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-400">{fmtDateTime(d.fired_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Alert rules */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search rules…" value={search}
              onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); pg.setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="name:asc">Name A→Z</option>
              <option value="name:desc">Name Z→A</option>
              <option value="severity:desc">Severity ↑</option>
              <option value="severity:asc">Severity ↓</option>
              <option value="scope_type:asc">Scope</option>
            </select>
          </div>
        </div>

        {rulesLoading ? (
          <div className="divide-y divide-tundra-ink-100">
            {[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse bg-tundra-ink-50 px-4 py-3" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('name') }}>
                    Name <SortIcon k="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('scope_type') }}>
                    Scope <SortIcon k="scope_type" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Metric</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Condition</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('severity') }}>
                    Severity <SortIcon k="severity" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((r) => (
                <tr key={r.id} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-tundra-ink">{r.name}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{r.scope_type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{r.metric}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{r.condition} {r.threshold}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[r.severity] ?? ''}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${r.is_enabled ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800' : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'}`}>
                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${r.is_enabled ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                      {r.is_enabled ? 'enabled' : 'disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button"
                        onClick={() => { r.is_enabled ? disableMutation.mutate(r.id) : enableMutation.mutate(r.id) }}
                        className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors">
                        {r.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button"
                        onClick={() => { if (confirm('Delete this rule?')) deleteMutation.mutate(r.id) }}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search ? 'No results match your search.' : 'No alert rules yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination total={filtered.length} page={pg.page} pageSize={pg.pageSize}
          onPage={pg.setPage} onPageSize={(n) => { pg.setPageSize(n); pg.setPage(1) }} />
      </div>

      {showCreate && (
        <CreateRuleDialog onClose={() => { setShowCreate(false) }}
          onCreated={() => { void queryClient.invalidateQueries({ queryKey: ['alert-rules'] }); setShowCreate(false) }} />
      )}
    </div>
  )
}

function CreateRuleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name,         setName]         = useState('')
  const [scopeType,    setScopeType]    = useState('server')
  const [metric,       setMetric]       = useState('cpu_pct')
  const [condition,    setCondition]    = useState('gt')
  const [threshold,    setThreshold]    = useState('90')
  const [durationSecs, setDurationSecs] = useState('300')
  const [severity,     setSeverity]     = useState('warning')
  const [saving,       setSaving]       = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/alert-rules', {
        method: 'POST',
        body: { name, scope_type: scopeType, metric, condition, threshold: parseFloat(threshold), duration_secs: parseInt(durationSecs, 10), severity, channels: [] },
      })
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create rule')
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader><DialogTitle>Create alert rule</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input required value={name} onChange={(e) => { setName(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Scope type
          <select value={scopeType} onChange={(e) => { setScopeType(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2">
            <option value="server">server</option>
            <option value="site">site</option>
            <option value="database">database</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Metric
          <input required value={metric} onChange={(e) => { setMetric(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2" placeholder="cpu_pct" />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Condition
            <select value={condition} onChange={(e) => { setCondition(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2">
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
              <option value="gte">&gt;=</option>
              <option value="lte">&lt;=</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Threshold
            <input required type="number" value={threshold} onChange={(e) => { setThreshold(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Duration (seconds)
          <input required type="number" value={durationSecs} onChange={(e) => { setDurationSecs(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Severity
          <select value={severity} onChange={(e) => { setSeverity(e.target.value) }} className="rounded border border-tundra-ink-200 px-3 py-2">
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create</Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
