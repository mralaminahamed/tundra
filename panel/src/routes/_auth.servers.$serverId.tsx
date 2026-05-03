import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Server } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers/$serverId')({
  component: ServerDetailPage,
})

function ServerDetailPage() {
  const { serverId } = Route.useParams()
  const { data: server, isLoading, isError } = useQuery({
    queryKey: ['servers', serverId],
    queryFn: () => api<Server>(`/servers/${serverId}`),
  })

  if (isLoading) return <p className="text-tundra-ink-400">Loading…</p>
  if (isError || !server) return <p className="text-tundra-rust">Server not found.</p>

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">{server.name}</h1>
      <p className="mb-6 text-tundra-ink-500">{server.hostname}</p>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border border-tundra-ink-200 p-6 text-sm max-w-xl">
        <dt className="font-medium">Status</dt>
        <dd className="capitalize">{server.status}</dd>

        <dt className="font-medium">OS</dt>
        <dd>{server.os}</dd>

        <dt className="font-medium">Region</dt>
        <dd>{server.region ?? '—'}</dd>

        <dt className="font-medium">Agent version</dt>
        <dd>{server.agent_version ?? 'not enrolled'}</dd>

        <dt className="font-medium">Last heartbeat</dt>
        <dd>{server.agent_last_seen_at ?? 'never'}</dd>

        <dt className="font-medium">Added</dt>
        <dd>{new Date(server.created_at).toLocaleDateString()}</dd>
      </dl>
    </div>
  )
}
