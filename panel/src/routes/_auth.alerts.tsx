import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { SkeletonTable } from '@/components/ui/skeleton'
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

function severityBadge(severity: AlertRule['severity']) {
  const map: Record<string, string> = {
    info: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    warning: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[severity] ?? ''}`}>
      {severity}
    </span>
  )
}

function AlertsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

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

  const activeDeliveries = (deliveriesData?.data ?? []).filter((d) => !d.resolved_at)
  const rules = rulesData?.data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <Button onClick={() => { setShowCreate(true) }}>+ Create rule</Button>
      </div>

      {activeDeliveries.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">Active alerts</h2>
          <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50">
            <table className="w-full text-sm">
              <thead className="bg-red-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Rule</th>
                  <th className="px-4 py-3 text-left font-medium">Value</th>
                  <th className="px-4 py-3 text-left font-medium">Threshold</th>
                  <th className="px-4 py-3 text-left font-medium">Fired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-200">
                {activeDeliveries.map((d) => {
                  const rule = rules.find((r) => r.id === d.rule_id)
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-3 font-medium">{rule?.name ?? d.rule_id}</td>
                      <td className="px-4 py-3">{d.current_value.toFixed(2)}</td>
                      <td className="px-4 py-3">{d.threshold.toFixed(2)}</td>
                      <td className="px-4 py-3 text-tundra-ink-400">{fmtDateTime(d.fired_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">Alert rules</h2>
        {rulesLoading && <SkeletonTable rows={3} cols={5} />}
        {rules.length === 0 && !rulesLoading && (
          <p className="py-8 text-center text-sm text-tundra-ink-400">No alert rules yet.</p>
        )}
        {rules.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Scope</th>
                  <th className="px-4 py-3 text-left font-medium">Metric</th>
                  <th className="px-4 py-3 text-left font-medium">Condition</th>
                  <th className="px-4 py-3 text-left font-medium">Severity</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-tundra-ink-500">{r.scope_type}</td>
                    <td className="px-4 py-3 text-tundra-ink-500 font-mono text-xs">{r.metric}</td>
                    <td className="px-4 py-3 text-tundra-ink-500">
                      {r.condition} {r.threshold}
                    </td>
                    <td className="px-4 py-3">{severityBadge(r.severity)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${r.is_enabled ? 'bg-tundra-lichen-100 text-tundra-lichen-800' : 'bg-tundra-ink-100 text-tundra-ink-600'}`}>
                        {r.is_enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {r.is_enabled ? (
                          <button
                            className="text-xs text-tundra-ink-400 hover:text-tundra-aurora hover:underline"
                            onClick={() => { disableMutation.mutate(r.id) }}
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            className="text-xs text-tundra-ink-400 hover:text-tundra-lichen hover:underline"
                            onClick={() => { enableMutation.mutate(r.id) }}
                          >
                            Enable
                          </button>
                        )}
                        <button
                          className="text-xs text-tundra-rust hover:underline"
                          onClick={() => { if (confirm('Delete this rule?')) deleteMutation.mutate(r.id) }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRuleDialog onClose={() => { setShowCreate(false) }} onCreated={() => { void queryClient.invalidateQueries({ queryKey: ['alert-rules'] }); setShowCreate(false) }} />
      )}
    </div>
  )
}

function CreateRuleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [scopeType, setScopeType] = useState('server')
  const [metric, setMetric] = useState('cpu_pct')
  const [condition, setCondition] = useState('gt')
  const [threshold, setThreshold] = useState('90')
  const [durationSecs, setDurationSecs] = useState('300')
  const [severity, setSeverity] = useState('warning')
  const [saving, setSaving] = useState(false)

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
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Create alert rule</DialogTitle>
      </DialogHeader>
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
