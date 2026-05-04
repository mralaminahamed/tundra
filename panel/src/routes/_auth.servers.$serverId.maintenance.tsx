import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Server } from '@/lib/api-types'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/servers/$serverId/maintenance')({
  component: MaintenancePage,
})

function MaintenancePage() {
  const { serverId } = Route.useParams()
  const queryClient = useQueryClient()

  const { data: server, isLoading } = useQuery({
    queryKey: ['servers', serverId],
    queryFn: () => api<Server>(`/servers/${serverId}`),
  })

  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const updateMutation = useMutation({
    mutationFn: (body: { maintenance_starts_at: string | null; maintenance_ends_at: string | null }) =>
      api(`/servers/${serverId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['servers', serverId] })
      toast.success('Maintenance window updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  if (isLoading) return <p className="text-sm text-tundra-ink-400">Loading…</p>
  if (!server) return <p className="text-sm text-tundra-rust">Server not found.</p>

  const hasWindow =
    (server as unknown as Record<string, unknown>).maintenance_starts_at != null

  return (
    <div className="max-w-xl">
      <nav className="mb-4 text-sm text-tundra-ink-400">
        <Link to="/servers">Servers</Link>
        {' / '}
        <Link to="/servers/$serverId" params={{ serverId }}>{server.name}</Link>
        {' / Maintenance'}
      </nav>

      <h1 className="mb-6 text-2xl font-semibold">Maintenance window</h1>

      {hasWindow && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Active maintenance window.</strong> Sites on this server will show a
          maintenance notice to visitors.
        </div>
      )}

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          Starts at
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => { setStartsAt(e.target.value); }}
            className="rounded border border-tundra-ink-200 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Ends at
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => { setEndsAt(e.target.value); }}
            className="rounded border border-tundra-ink-200 px-3 py-2"
          />
        </label>

        <div className="flex gap-3">
          <Button
            onClick={() => {
              updateMutation.mutate({
                maintenance_starts_at: startsAt || null,
                maintenance_ends_at: endsAt || null,
              })
            }}
            loading={updateMutation.isPending}
          >
            Save window
          </Button>

          {hasWindow && (
            <Button
              variant="outline"
              onClick={() => {
                updateMutation.mutate({ maintenance_starts_at: null, maintenance_ends_at: null })
              }}
              loading={updateMutation.isPending}
            >
              Clear window
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
