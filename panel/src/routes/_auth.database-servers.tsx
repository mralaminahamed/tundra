import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import type { DatabaseServer, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/database-servers')({
  component: DatabaseServersPage,
})

const ENGINE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  valkey: 'Valkey',
}

function statusBadge(status: DatabaseServer['status']) {
  const map: Record<string, string> = {
    active: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    stopped: 'bg-tundra-ink-100 text-tundra-ink-600',
    error: 'bg-tundra-rust-100 text-tundra-rust-800',
  }
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? ''}`}
    >
      {status}
    </span>
  )
}

function DatabaseServersPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['database-servers'],
    queryFn: () => api<ListResponse<DatabaseServer>>('/database-servers'),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Database Servers</h1>
        <Link
          to="/database-servers/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Add database server
        </Link>
      </div>

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-tundra-rust">Failed to load database servers.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Engine</th>
                <th className="px-4 py-3 text-left font-medium">Bind address</th>
                <th className="px-4 py-3 text-left font-medium">Port</th>
                <th className="px-4 py-3 text-left font-medium">Superuser</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((srv) => (
                <tr key={srv.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/database-servers/$serverId"
                      params={{ serverId: srv.id }}
                      className="font-medium text-tundra-aurora hover:underline"
                    >
                      {ENGINE_LABELS[srv.engine] ?? srv.engine} {srv.version}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{srv.bind_address}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{String(srv.port)}</td>
                  <td className="px-4 py-3 text-tundra-ink-500">{srv.superuser}</td>
                  <td className="px-4 py-3">{statusBadge(srv.status)}</td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-tundra-ink-400">
                    No database servers yet. Add your first database server to get started.
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
