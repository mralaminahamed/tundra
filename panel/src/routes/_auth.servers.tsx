import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ListResponse, Server } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/servers')({
  component: ServersPage,
})

function statusBadge(status: Server['status']) {
  const map: Record<string, string> = {
    active: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    provisioning: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    offline: 'bg-tundra-ink-100 text-tundra-ink-600',
    disabled: 'bg-tundra-ink-100 text-tundra-ink-400',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}
    >
      {status}
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${String(Math.floor(diff))}s ago`
  if (diff < 3600) return `${String(Math.floor(diff / 60))}m ago`
  if (diff < 86400) return `${String(Math.floor(diff / 3600))}h ago`
  return `${String(Math.floor(diff / 86400))}d ago`
}

function ServersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servers</h1>
        <Link
          to="/servers/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Add server
        </Link>
      </div>

      {isLoading && <p className="text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-tundra-rust">Failed to load servers.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Hostname</th>
                <th className="px-4 py-3 text-left font-medium">OS</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((s) => (
                <tr key={s.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/servers/$serverId"
                      params={{ serverId: s.id }}
                      className="font-medium text-tundra-aurora hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{s.hostname}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{s.os}</td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {relativeTime(s.agent_last_seen_at)}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-tundra-ink-400">
                    No servers yet. Add your first server to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
