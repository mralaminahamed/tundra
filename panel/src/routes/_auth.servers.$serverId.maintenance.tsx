import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Server } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers/$serverId/maintenance')({
  component: MaintenancePage,
})

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDateTimeInput(val: string): string {
  return val ? new Date(val).toISOString() : ''
}

function nextDayHour(h: number): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(h, 0, 0, 0)
  return toLocalDateTimeInput(d.toISOString())
}

const PRESETS = [
  { label: '30 min', startFn: () => toLocalDateTimeInput(new Date().toISOString()), durationH: 0.5 },
  { label: '1 hour', startFn: () => toLocalDateTimeInput(new Date().toISOString()), durationH: 1 },
  { label: '4 hours', startFn: () => toLocalDateTimeInput(new Date().toISOString()), durationH: 4 },
  { label: '8 hours', startFn: () => toLocalDateTimeInput(new Date().toISOString()), durationH: 8 },
  { label: 'Tonight 2 AM', startFn: () => nextDayHour(2), durationH: 4 },
  { label: 'Tomorrow 6 AM', startFn: () => nextDayHour(6), durationH: 2 },
] as const

function MaintenancePage() {
  const { serverId } = Route.useParams()
  const queryClient = useQueryClient()

  const { data: server, isLoading } = useQuery({
    queryKey: ['servers', serverId],
    queryFn: () => api<Server>(`/servers/${serverId}`),
  })

  const [startsAt, setStartsAt] = useState('')
  const [endsAt,   setEndsAt]   = useState('')
  const [isDirty,  setIsDirty]  = useState(false)

  const updateMutation = useMutation({
    mutationFn: (body: { maintenance_starts_at: string | null; maintenance_ends_at: string | null }) =>
      api(`/servers/${serverId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['servers', serverId] })
      void queryClient.invalidateQueries({ queryKey: ['servers'] })
      toast.success('Maintenance window saved')
      setIsDirty(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  if (isLoading) return (
    <div className="max-w-xl space-y-3">
      <div className="h-4 w-40 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-8 w-64 animate-pulse rounded bg-tundra-ink-100" />
      <div className="h-40 animate-pulse rounded-xl bg-tundra-ink-100" />
    </div>
  )
  if (!server) return <p className="text-sm text-tundra-rust">Server not found.</p>

  const hasActiveWindow = !!(
    server.maintenance_starts_at &&
    server.maintenance_ends_at &&
    new Date(server.maintenance_starts_at) <= new Date() &&
    new Date(server.maintenance_ends_at) >= new Date()
  )
  const hasScheduled = !!server.maintenance_starts_at && !hasActiveWindow

  function applyPreset(startFn: () => string, durationH: number) {
    const s = startFn()
    const e = toLocalDateTimeInput(
      new Date(new Date(s).getTime() + durationH * 60 * 60 * 1000).toISOString()
    )
    setStartsAt(s)
    setEndsAt(e)
    setIsDirty(true)
  }

  function handleSave() {
    if (!startsAt || !endsAt) { toast.error('Set both start and end times'); return }
    if (new Date(endsAt) <= new Date(startsAt)) { toast.error('End time must be after start time'); return }
    updateMutation.mutate({
      maintenance_starts_at: fromLocalDateTimeInput(startsAt),
      maintenance_ends_at:   fromLocalDateTimeInput(endsAt),
    })
  }

  function handleClear() {
    updateMutation.mutate({ maintenance_starts_at: null, maintenance_ends_at: null })
    setStartsAt('')
    setEndsAt('')
    setIsDirty(false)
  }

  const durationHours = startsAt && endsAt && new Date(endsAt) > new Date(startsAt)
    ? Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / (60 * 60 * 1000) * 10) / 10
    : null

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-xs text-tundra-ink-400">
        <Link to="/servers" className="hover:text-tundra-aurora">Servers</Link>
        <span>/</span>
        <Link to="/servers/$serverId" params={{ serverId }} className="hover:text-tundra-aurora">{server.name}</Link>
        <span>/</span>
        <span className="text-tundra-ink">Maintenance</span>
      </nav>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-tundra-ink">Maintenance window</h1>
      <p className="mb-6 text-sm text-tundra-ink-400">
        Schedule planned downtime for <strong>{server.name}</strong>.
        Sites on this server will show a maintenance page during the window.
      </p>

      {/* Status banners */}
      {hasActiveWindow && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-yellow-400 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">Maintenance window is ACTIVE</p>
            <p className="text-sm text-yellow-700 mt-0.5">
              {server.maintenance_starts_at ? new Date(server.maintenance_starts_at).toLocaleString() : ''} → {server.maintenance_ends_at ? new Date(server.maintenance_ends_at).toLocaleString() : ''}
            </p>
            <p className="text-xs text-yellow-600 mt-1">Sites are showing the maintenance page to visitors right now.</p>
          </div>
        </div>
      )}
      {hasScheduled && (
        <div className="mb-6 rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-4 flex items-start gap-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-tundra-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-medium text-tundra-ink-700">Window scheduled</p>
            <p className="text-sm text-tundra-ink-500 mt-0.5">
              {server.maintenance_starts_at ? new Date(server.maintenance_starts_at).toLocaleString() : ''}
              {server.maintenance_ends_at && ` → ${new Date(server.maintenance_ends_at).toLocaleString()}`}
            </p>
          </div>
        </div>
      )}

      {/* Presets */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Quick presets — starting now</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { applyPreset(p.startFn, p.durationH) }}
              className="rounded-full border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:border-tundra-lichen hover:bg-tundra-lichen-50 hover:text-tundra-lichen-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Manual pickers */}
      <div className="rounded-xl border border-tundra-ink-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Starts at</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => { setStartsAt(e.target.value); setIsDirty(true) }}
              className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-tundra-ink-700">Ends at</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => { setEndsAt(e.target.value); setIsDirty(true) }}
              className="rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
            />
          </label>
        </div>

        {durationHours != null && (
          <p className="text-xs text-tundra-ink-500">
            Duration: <span className="font-semibold text-tundra-ink">{String(durationHours)} hours</span>
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? 'Saving…' : 'Schedule window'}
          </button>
          {server.maintenance_starts_at && (
            <button
              onClick={handleClear}
              disabled={updateMutation.isPending}
              className="rounded-lg border border-tundra-ink-200 px-5 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors"
            >
              Clear window
            </button>
          )}
          <Link
            to="/servers/$serverId"
            params={{ serverId }}
            className="ml-auto text-sm text-tundra-ink-400 hover:text-tundra-ink self-center"
          >
            ← Back to server
          </Link>
        </div>
      </div>

      {/* Impact explanation */}
      <div className="mt-4 rounded-lg border border-tundra-ink-100 bg-tundra-ink-50 p-4 text-xs text-tundra-ink-500">
        <p className="mb-1.5 font-semibold text-tundra-ink-700 text-sm">What this does</p>
        <ul className="space-y-1 list-disc ml-4">
          <li>Sites on <strong>{server.name}</strong> serve a maintenance page to HTTP visitors</li>
          <li>The Tundra agent keeps running — metrics and heartbeats continue</li>
          <li>Deployments and cron tasks are <strong>not</strong> paused automatically</li>
          <li>Cancel or reschedule any pending jobs separately if needed</li>
        </ul>
      </div>
    </div>
  )
}
