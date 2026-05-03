import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Database, DatabaseServer, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_auth/databases/new')({
  component: CreateDatabasePage,
})

function CreateDatabasePage() {
  const router = useRouter()
  const [databaseServerId, setDatabaseServerId] = useState('')
  const [name, setName] = useState('')
  const [charset, setCharset] = useState('')
  const [collation, setCollation] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: dbServersData } = useQuery({
    queryKey: ['database-servers'],
    queryFn: () => api<ListResponse<DatabaseServer>>('/database-servers'),
  })

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setLoading(true)
    api<Database>('/databases', {
      method: 'POST',
      body: {
        database_server_id: databaseServerId,
        name,
        charset: charset || null,
        collation: collation || null,
      },
    })
      .then((res) => {
        toast.success('Database created')
        void router.navigate({ to: '/databases/$databaseId', params: { databaseId: res.id } })
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to create database')
      })
      .finally(() => { setLoading(false) })
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Create database</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Database server</label>
          <select
            value={databaseServerId}
            onChange={(e) => { setDatabaseServerId(e.target.value) }}
            className="rounded border border-tundra-ink-200 px-3 py-2 text-sm"
            required
          >
            <option value="">— select a database server —</option>
            {dbServersData?.data.map((srv) => (
              <option key={srv.id} value={srv.id}>
                {srv.engine} {srv.version} ({srv.bind_address}:{String(srv.port)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Database name</label>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value) }}
            placeholder="myapp_production"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Charset (optional)</label>
          <Input
            value={charset}
            onChange={(e) => { setCharset(e.target.value) }}
            placeholder="utf8mb4"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Collation (optional)</label>
          <Input
            value={collation}
            onChange={(e) => { setCollation(e.target.value) }}
            placeholder="utf8mb4_unicode_ci"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>
            Create database
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { void router.navigate({ to: '/databases' }) }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
