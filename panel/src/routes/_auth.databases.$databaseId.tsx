import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Database, DbUser, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/databases/$databaseId')({
  component: DatabaseDetailPage,
})

const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'] as const
type Privilege = (typeof PRIVILEGES)[number]

function DatabaseDetailPage() {
  const { databaseId } = Route.useParams()
  const [showGrantForm, setShowGrantForm] = useState(false)
  const [grantUserId, setGrantUserId] = useState('')
  const [selectedPrivileges, setSelectedPrivileges] = useState<Privilege[]>(['SELECT'])
  const [grantLoading, setGrantLoading] = useState(false)

  const { data: database, isLoading, isError } = useQuery({
    queryKey: ['databases', databaseId],
    queryFn: () => api<Database>(`/databases/${databaseId}`),
  })

  const { data: dbUsers } = useQuery({
    queryKey: ['db-users', { database_server_id: database?.database_server_id }],
    queryFn: () =>
      api<ListResponse<DbUser>>(
        `/db-users?database_server_id=${database?.database_server_id ?? ''}`,
      ),
    enabled: !!database,
  })

  if (isLoading) return <p className="text-tundra-ink-400">Loading…</p>
  if (isError || !database) return <p className="text-tundra-rust">Database not found.</p>

  function togglePrivilege(priv: Privilege) {
    setSelectedPrivileges((prev) =>
      prev.includes(priv) ? prev.filter((p) => p !== priv) : [...prev, priv],
    )
  }

  function handleGrantSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    if (!grantUserId || selectedPrivileges.length === 0) return
    setGrantLoading(true)
    api('/db-grants', {
      method: 'POST',
      body: {
        database_id: databaseId,
        db_user_id: grantUserId,
        privileges: selectedPrivileges,
      },
    })
      .then(() => {
        toast.success('Access granted')
        setShowGrantForm(false)
        setGrantUserId('')
        setSelectedPrivileges(['SELECT'])
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to grant access')
      })
      .finally(() => { setGrantLoading(false) })
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-0.5 text-2xl font-semibold">{database.name}</h1>
          <p className="text-sm text-tundra-ink-500">
            Database server: {database.database_server_id.slice(0, 8)}…
          </p>
        </div>
      </div>

      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border border-tundra-ink-200 p-6 text-sm max-w-xl">
        <dt className="font-medium">Name</dt>
        <dd>{database.name}</dd>

        <dt className="font-medium">Charset</dt>
        <dd>{database.charset ?? '—'}</dd>

        <dt className="font-medium">Collation</dt>
        <dd>{database.collation ?? '—'}</dd>

        <dt className="font-medium">Size</dt>
        <dd>
          {database.size_bytes != null
            ? `${(database.size_bytes / 1048576).toFixed(2)} MB`
            : '—'}
        </dd>

        <dt className="font-medium">Created</dt>
        <dd>{fmtDate(database.created_at)}</dd>
      </dl>

      {/* Users with access */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Users with access</h2>
          {!showGrantForm && (
            <Button
              type="button"
              onClick={() => { setShowGrantForm(true) }}
            >
              Grant user access
            </Button>
          )}
        </div>

        {showGrantForm && (
          <form
            onSubmit={handleGrantSubmit}
            className="mb-6 flex flex-col gap-4 rounded-lg border border-tundra-ink-200 p-4 max-w-md"
          >
            <h3 className="font-medium">Grant access</h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Database user</label>
              <select
                value={grantUserId}
                onChange={(e) => { setGrantUserId(e.target.value) }}
                className="rounded border border-tundra-ink-200 px-3 py-2 text-sm"
                required
              >
                <option value="">— select a user —</option>
                {dbUsers?.data.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Privileges</label>
              <div className="flex flex-wrap gap-3">
                {PRIVILEGES.map((priv) => (
                  <label key={priv} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedPrivileges.includes(priv)}
                      onChange={() => { togglePrivilege(priv) }}
                    />
                    {priv}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" loading={grantLoading}>
                Grant access
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowGrantForm(false) }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

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
                      {fmtDate(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-tundra-ink-400">No users have access yet.</p>
        )}
      </section>
    </div>
  )
}
