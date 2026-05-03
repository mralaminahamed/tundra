import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Database, DatabaseServer, DbUser, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/database-servers/$serverId')({
  component: DatabaseServerDetailPage,
})

const ENGINE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  valkey: 'Valkey',
}

function DatabaseServerDetailPage() {
  const { serverId } = Route.useParams()

  const { data: dbServer, isLoading, isError } = useQuery({
    queryKey: ['database-servers', serverId],
    queryFn: () => api<DatabaseServer>(`/database-servers/${serverId}`),
  })

  const { data: databases } = useQuery({
    queryKey: ['databases', { database_server_id: serverId }],
    queryFn: () =>
      api<ListResponse<Database>>(`/databases?database_server_id=${serverId}`),
    enabled: !!dbServer,
  })

  const { data: dbUsers } = useQuery({
    queryKey: ['db-users', { database_server_id: serverId }],
    queryFn: () =>
      api<ListResponse<DbUser>>(`/db-users?database_server_id=${serverId}`),
    enabled: !!dbServer,
  })

  if (isLoading) return <p className="text-tundra-ink-400">Loading…</p>
  if (isError || !dbServer) return <p className="text-tundra-rust">Database server not found.</p>

  const engineLabel = ENGINE_LABELS[dbServer.engine] ?? dbServer.engine

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-0.5 text-2xl font-semibold">{engineLabel} {dbServer.version}</h1>
          <p className="text-sm text-tundra-ink-500">{dbServer.bind_address}:{String(dbServer.port)}</p>
        </div>
        <span className={`rounded px-3 py-1 text-sm capitalize ${
          dbServer.status === 'active' ? 'bg-tundra-lichen-100 text-tundra-lichen-800'
          : dbServer.status === 'error' ? 'bg-tundra-rust-100 text-tundra-rust-800'
          : 'bg-tundra-ink-100 text-tundra-ink-600'
        }`}>
          {dbServer.status}
        </span>
      </div>

      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border border-tundra-ink-200 p-6 text-sm max-w-xl">
        <dt className="font-medium">Engine</dt>
        <dd>{engineLabel}</dd>

        <dt className="font-medium">Version</dt>
        <dd>{dbServer.version}</dd>

        <dt className="font-medium">Port</dt>
        <dd>{String(dbServer.port)}</dd>

        <dt className="font-medium">Bind address</dt>
        <dd>{dbServer.bind_address}</dd>

        <dt className="font-medium">Superuser</dt>
        <dd>{dbServer.superuser}</dd>

        <dt className="font-medium">Added</dt>
        <dd>{new Date(dbServer.created_at).toLocaleDateString()}</dd>
      </dl>

      {/* Databases section */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Databases on this server</h2>
          <Link
            to="/databases/new"
            className="rounded bg-tundra-lichen px-3 py-1.5 text-sm text-white hover:bg-tundra-lichen-600"
          >
            Create database
          </Link>
        </div>
        {databases && databases.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Charset</th>
                  <th className="px-4 py-3 text-left font-medium">Size</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {databases.data.map((db) => (
                  <tr key={db.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-3">
                      <Link
                        to="/databases/$databaseId"
                        params={{ databaseId: db.id }}
                        className="font-medium text-tundra-aurora hover:underline"
                      >
                        {db.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-500">{db.charset ?? '—'}</td>
                    <td className="px-4 py-3 text-tundra-ink-500">
                      {db.size_bytes != null
                        ? `${(db.size_bytes / 1048576).toFixed(2)} MB`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-tundra-ink-400">
                      {new Date(db.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-tundra-ink-400">No databases yet.</p>
        )}
      </section>

      {/* Users section */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Users on this server</h2>
        {dbUsers && dbUsers.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Username</th>
                  <th className="px-4 py-3 text-left font-medium">Managed</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {dbUsers.data.map((u) => (
                  <tr key={u.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-tundra-ink-500">{u.is_managed ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-tundra-ink-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-tundra-ink-400">No users yet.</p>
        )}
      </section>
    </div>
  )
}
