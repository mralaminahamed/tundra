import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Database, DatabaseServer, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/databases')({
  component: SiteDatabasesTab,
})

const ENGINE_BADGE: Record<string, string> = {
  mysql:      'bg-orange-50 text-orange-700 border-orange-200',
  mariadb:    'bg-blue-50 text-blue-700 border-blue-200',
  postgresql: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  valkey:     'bg-rose-50 text-rose-700 border-rose-200',
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function SiteDatabasesTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [dbServerId, setDbServerId] = useState('')
  const [dbName, setDbName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'databases'],
    queryFn: () => api<ListResponse<Database>>(`/sites/${siteId}/databases`),
  })

  const { data: serversData } = useQuery({
    queryKey: ['database-servers'],
    queryFn: () => api<ListResponse<DatabaseServer>>('/database-servers'),
  })

  const servers = serversData?.data ?? []
  const dbs = data?.data ?? []

  const createMut = useMutation({
    mutationFn: () => api<Database>('/databases', {
      method: 'POST',
      body: { database_server_id: dbServerId, name: dbName },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'databases'] })
      toast.success('Database created')
      setShowForm(false)
      setDbName('')
      setDbServerId('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/databases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'databases'] })
      toast.success('Database deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const copyConnString = (db: Database) => {
    const srv = servers.find((s) => s.id === db.database_server_id)
    if (!srv) { toast.error('Database server info not available'); return }
    const engine = srv.engine === 'postgresql' ? 'postgresql' : srv.engine === 'valkey' ? 'redis' : 'mysql'
    const host = srv.bind_address === '0.0.0.0' || srv.bind_address === '' ? '127.0.0.1' : srv.bind_address
    const str = `${engine}://<user>:<password>@${host}:${srv.port}/${db.name}`
    void navigator.clipboard.writeText(str).then(() => toast.success('Connection string copied'))
  }

  const openAdmin = (db: Database) => {
    const srv = servers.find((s) => s.id === db.database_server_id)
    if (!srv) { toast.error('Database server info not available'); return }
    if (srv.engine === 'mysql' || srv.engine === 'mariadb') {
      window.open(`/tools/phpmyadmin?dbServerId=${srv.id}&db=${db.name}`, '_blank')
    } else if (srv.engine === 'postgresql') {
      toast.info('pgAdmin not configured — connect via psql or a GUI client')
    } else {
      toast.info(`No web admin available for ${srv.engine}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{dbs.length} database{dbs.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          {showForm ? 'Cancel' : '+ Create database'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-5 space-y-4">
          <p className="text-sm font-semibold text-tundra-ink">New database</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-tundra-ink">Database server</label>
            <select value={dbServerId} onChange={(e) => setDbServerId(e.target.value)}
              className="w-full rounded-xl border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20">
              <option value="">Select a database server…</option>
              {servers.filter((s) => s.status === 'active').map((s) => (
                <option key={s.id} value={s.id}>{s.engine.toUpperCase()} {s.version} (port {s.port})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-tundra-ink">Database name</label>
            <input type="text" value={dbName} onChange={(e) => setDbName(e.target.value)}
              placeholder="my_app_db"
              className="w-full rounded-xl border border-tundra-ink-200 bg-white px-3.5 py-2.5 text-sm font-mono focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20" />
          </div>
          <div className="flex gap-2">
            <button type="button"
              disabled={!dbServerId || !dbName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {createMut.isPending ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setDbName(''); setDbServerId('') }}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-tundra-ink-100" />)}</div>
      ) : dbs.length === 0 ? (
        <EmptyState message="No databases for this site." action="Create database →" onAction={() => setShowForm(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {dbs.map((db) => {
            const srv = servers.find((s) => s.id === db.database_server_id)
            const engineLabel = srv?.engine?.toUpperCase() ?? 'DB'
            const engineCls = ENGINE_BADGE[srv?.engine ?? ''] ?? 'bg-tundra-ink-50 text-tundra-ink-500 border-tundra-ink-200'
            return (
              <div key={db.id} className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
                <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
                  <span className="font-semibold text-tundra-ink font-mono text-sm">{db.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${engineCls}`}>
                    {engineLabel}
                  </span>
                </div>
                <div className="divide-y divide-tundra-ink-100">
                  {[
                    { label: 'Host',      value: srv ? `${srv.bind_address === '0.0.0.0' ? '127.0.0.1' : srv.bind_address}:${srv.port}` : '—', mono: true },
                    { label: 'Charset',   value: db.charset ?? '—', mono: true },
                    { label: 'Collation', value: db.collation ?? '—', mono: true },
                    { label: 'Size',      value: db.size_bytes != null ? fmtBytes(db.size_bytes) : '—' },
                    { label: 'Created',   value: fmtDate(db.created_at) },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                      <span className="text-tundra-ink-400">{label}</span>
                      <span className={`text-tundra-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 p-3">
                  <button type="button" onClick={() => openAdmin(db)}
                    className="flex-1 rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                    Open admin
                  </button>
                  <button type="button" onClick={() => copyConnString(db)}
                    className="flex-1 rounded-lg border border-tundra-ink-200 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                    Copy conn string
                  </button>
                  <button type="button"
                    disabled={deleteMut.isPending && deleteMut.variables === db.id}
                    onClick={() => {
                      if (!window.confirm(`Delete database "${db.name}"? This cannot be undone.`)) return
                      deleteMut.mutate(db.id)
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                    {deleteMut.isPending && deleteMut.variables === db.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
