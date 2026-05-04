import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import type { Database, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/databases')({
  component: DatabasesPage,
})

function DatabasesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['databases'],
    queryFn: () => api<ListResponse<Database>>('/databases'),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Databases</h1>
        <Link
          to="/databases/new"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Create database
        </Link>
      </div>

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-tundra-rust">Failed to load databases.</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Database server</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {data.data.map((db) => (
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
                  <td className="px-4 py-3 text-tundra-ink-500">
                    <Link
                      to="/database-servers/$serverId"
                      params={{ serverId: db.database_server_id }}
                      className="text-tundra-aurora hover:underline"
                    >
                      {db.database_server_id.slice(0, 8)}…
                    </Link>
                  </td>
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
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-tundra-ink-400">
                    No databases yet. Create your first database to get started.
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
