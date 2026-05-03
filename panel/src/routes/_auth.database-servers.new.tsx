import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DatabaseServer, ListResponse, Server } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_auth/database-servers/new')({
  component: AddDatabaseServerPage,
})

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  valkey: 6379,
}

function AddDatabaseServerPage() {
  const router = useRouter()
  const [serverId, setServerId] = useState('')
  const [engine, setEngine] = useState<'postgresql' | 'mysql' | 'mariadb' | 'valkey'>('postgresql')
  const [version, setVersion] = useState('')
  const [port, setPort] = useState(String(DEFAULT_PORTS.postgresql))
  const [bindAddress, setBindAddress] = useState('127.0.0.1')
  const [superuser, setSuperuser] = useState('admin')
  const [superuserPassword, setSuperuserPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: serversData } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api<ListResponse<Server>>('/servers'),
  })

  function handleEngineChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as 'postgresql' | 'mysql' | 'mariadb' | 'valkey'
    setEngine(val)
    setPort(String(DEFAULT_PORTS[val] ?? 5432))
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setLoading(true)
    api<DatabaseServer>('/database-servers', {
      method: 'POST',
      body: {
        server_id: serverId,
        engine,
        version,
        port: parseInt(port, 10),
        bind_address: bindAddress,
        superuser,
        superuser_password: superuserPassword,
      },
    })
      .then(() => {
        toast.success('Database server added')
        void router.navigate({ to: '/database-servers' })
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to add database server')
      })
      .finally(() => { setLoading(false) })
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">Add database server</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Server</label>
          <select
            value={serverId}
            onChange={(e) => { setServerId(e.target.value) }}
            className="rounded border border-tundra-ink-200 px-3 py-2 text-sm"
            required
          >
            <option value="">— select a server —</option>
            {serversData?.data.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.hostname})</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Engine</label>
          <select
            value={engine}
            onChange={handleEngineChange}
            className="rounded border border-tundra-ink-200 px-3 py-2 text-sm"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
            <option value="valkey">Valkey</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Version</label>
          <Input
            value={version}
            onChange={(e) => { setVersion(e.target.value) }}
            placeholder="e.g. 18, 8.4, 11.4, 8.0"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Port</label>
          <Input
            type="number"
            value={port}
            onChange={(e) => { setPort(e.target.value) }}
            placeholder="5432"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Bind address</label>
          <Input
            value={bindAddress}
            onChange={(e) => { setBindAddress(e.target.value) }}
            placeholder="127.0.0.1"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Superuser</label>
          <Input
            value={superuser}
            onChange={(e) => { setSuperuser(e.target.value) }}
            placeholder="admin"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Superuser password</label>
          <Input
            type="password"
            value={superuserPassword}
            onChange={(e) => { setSuperuserPassword(e.target.value) }}
            placeholder="••••••••"
            required
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>
            Add database server
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { void router.navigate({ to: '/database-servers' }) }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
