import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { useAuthStore } from '@/stores/auth'
import { fmtDate } from '@/lib/utils'

export const Route = createFileRoute('/_auth/operators')({
  component: OperatorsPage,
})

type Role = 'owner' | 'admin' | 'operator' | 'readonly'
type SortKey = 'full_name' | 'role' | 'created_at'
type SortDir = 'asc' | 'desc'

interface Operator {
  id: string
  public_id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  has_totp: boolean
  created_at: string
}

const ROLES: { value: Role; label: string; desc: string; cls: string }[] = [
  { value: 'owner',    label: 'Owner',     desc: 'Full access — billing, operators, all settings.',                              cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'admin',    label: 'Admin',     desc: 'Manage servers, sites, databases and users (except owner accounts).',          cls: 'bg-tundra-lichen-100 text-tundra-lichen-800 border-tundra-lichen-200' },
  { value: 'operator', label: 'Operator',  desc: 'Deploy and manage sites, view servers. Cannot manage users.',                  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'readonly', label: 'Read-only', desc: 'View everything, change nothing.',                                             cls: 'bg-tundra-ink-100 text-tundra-ink-600 border-tundra-ink-200' },
]

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLES.find((r) => r.value === role)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta?.cls ?? 'bg-tundra-ink-100 text-tundra-ink-600'}`}>
      {meta?.label ?? role}
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tundra-ink-100 text-xs font-bold text-tundra-ink-600 select-none">
      {initials || '?'}
    </div>
  )
}

function OperatorsPage() {
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.operator)

  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [sortKey,    setSortKey]    = useState<SortKey>('full_name')
  const [sortDir,    setSortDir]    = useState<SortDir>('asc')
  const [showInvite, setShowInvite] = useState(false)
  const [editTarget, setEditTarget] = useState<Operator | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['operators'],
    queryFn: () => api<{ data: Operator[] }>('/operators'),
  })

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: Role; is_active?: boolean } }) =>
      api<Operator>(`/operators/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['operators'] }); toast.success('Operator updated') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/operators/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['operators'] }); toast.success('Operator removed') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Remove failed'),
  })

  const operators = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return operators
      .filter((op) => {
        const matchSearch = !q || op.email.toLowerCase().includes(q) || op.full_name.toLowerCase().includes(q)
        const matchRole   = roleFilter === 'all' || op.role === roleFilter
        return matchSearch && matchRole
      })
      .sort((a, b) => {
        const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''))
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [operators, search, roleFilter, sortKey, sortDir])

  const pg = usePagination(filtered, 25)

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    pg.setPage(1)
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <svg className={`h-3 w-3 ${sortKey === k ? 'text-tundra-lichen' : 'text-tundra-ink-300'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      {sortKey !== k ? <path d="M8 9l4-4 4 4M8 15l4 4 4-4" /> : sortDir === 'asc' ? <path d="M12 5l-7 7h14z" /> : <path d="M12 19l7-7H5z" />}
    </svg>
  )

  const canManage = me?.role === 'owner' || me?.role === 'admin'

  const counts = {
    active:    operators.filter((o) => o.is_active).length,
    suspended: operators.filter((o) => !o.is_active).length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-tundra-ink">Users</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-500">
            {operators.length} operator{operators.length !== 1 ? 's' : ''} with access to this instance.
          </p>
        </div>
        {canManage && (
          <button onClick={() => { setShowInvite(true) }}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            + Add user
          </button>
        )}
      </div>

      {/* Stat pills */}
      {operators.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([['Active', counts.active], ['Suspended', counts.suspended]] as const).map(([label, count]) =>
            count > 0 ? (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-tundra-ink-200 bg-white px-4 py-2.5">
                <span className="text-xl font-bold tabular-nums text-tundra-ink">{count}</span>
                <span className="text-xs text-tundra-ink-400">{label}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Role legend */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r.value} className="rounded-xl border border-tundra-ink-200 bg-white p-3">
            <RoleBadge role={r.value} />
            <p className="mt-1.5 text-xs text-tundra-ink-500 leading-snug">{r.desc}</p>
          </div>
        ))}
      </div>

      {isError && <p className="text-sm text-tundra-rust">Failed to load operators.</p>}

      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="search" placeholder="Search name or email…" value={search}
              onChange={(e) => { setSearch(e.target.value); pg.setPage(1) }}
              className="h-8 w-48 rounded-lg border border-tundra-ink-200 bg-white pl-8 pr-3 text-xs focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          {/* Role filter chips */}
          <div className="flex overflow-hidden rounded-lg border border-tundra-ink-200">
            {(['all', ...ROLES.map((r) => r.value)] as const).map((r, i) => (
              <button key={r} type="button" onClick={() => { setRoleFilter(r); pg.setPage(1) }}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-tundra-ink-200' : ''} ${roleFilter === r ? 'bg-tundra-ink text-white' : 'bg-white text-tundra-ink-500 hover:bg-tundra-ink-50'}`}>
                {r === 'all' ? 'All' : ROLES.find((x) => x.value === r)?.label ?? r}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-tundra-ink-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <select value={`${sortKey}:${sortDir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':') as [SortKey, SortDir]; setSortKey(k); setSortDir(d); pg.setPage(1) }}
              className="h-8 rounded-lg border border-tundra-ink-200 bg-white px-2 text-xs text-tundra-ink-600 focus:outline-none">
              <option value="full_name:asc">Name A→Z</option>
              <option value="full_name:desc">Name Z→A</option>
              <option value="role:asc">Role</option>
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-tundra-ink-100">
            {[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse bg-tundra-ink-50 px-4 py-3" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 text-xs text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('full_name') }}>
                    User <SortIcon k="full_name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('role') }}>
                    Role <SortIcon k="role" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">MFA</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left">
                  <button className="flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-tundra-ink transition-colors" onClick={() => { toggleSort('created_at') }}>
                    Joined <SortIcon k="created_at" />
                  </button>
                </th>
                {canManage && <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {pg.paged.map((op) => {
                const isMe  = op.id === me?.id
                const isBusy = (patchMut.isPending && patchMut.variables?.id === op.id) ||
                               (deleteMut.isPending && deleteMut.variables === op.id)
                return (
                  <tr key={op.id} className={`transition-colors hover:bg-tundra-ink-50 ${!op.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={op.full_name} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-tundra-ink">{op.full_name || '—'}</span>
                            {isMe && <span className="text-xs text-tundra-ink-400">(you)</span>}
                          </div>
                          <p className="text-xs text-tundra-ink-400">{op.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && !isMe ? (
                        <RoleSelect value={op.role} disabled={isBusy}
                          onChange={(role) => { patchMut.mutate({ id: op.id, body: { role } }) }} />
                      ) : (
                        <RoleBadge role={op.role} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {op.has_totp ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-tundra-lichen-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-tundra-lichen" /> TOTP
                        </span>
                      ) : (
                        <span className="text-xs text-tundra-ink-300">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${op.is_active ? 'text-tundra-lichen-700' : 'text-tundra-ink-400'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${op.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`} />
                        {op.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-400">{fmtDate(op.created_at)}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {!isMe && (
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" disabled={isBusy} onClick={() => { setEditTarget(op) }}
                              className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors">
                              Edit
                            </button>
                            <button type="button" disabled={isBusy}
                              onClick={() => { patchMut.mutate({ id: op.id, body: { is_active: !op.is_active } }) }}
                              className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-500 hover:bg-tundra-ink-50 disabled:opacity-40 transition-colors">
                              {op.is_active ? 'Suspend' : 'Reactivate'}
                            </button>
                            <button type="button" disabled={isBusy}
                              onClick={() => { if (window.confirm(`Permanently remove ${op.email}? This cannot be undone.`)) deleteMut.mutate(op.id) }}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-sm text-tundra-ink-400">
                  {search || roleFilter !== 'all' ? 'No operators match your filter.' : 'No operators yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination total={filtered.length} page={pg.page} pageSize={pg.pageSize}
          onPage={pg.setPage} onPageSize={(n) => { pg.setPageSize(n); pg.setPage(1) }} />
      </div>

      {showInvite && (
        <InviteModal onClose={() => { setShowInvite(false) }}
          onDone={() => { void qc.invalidateQueries({ queryKey: ['operators'] }); setShowInvite(false) }} />
      )}
      {editTarget && (
        <EditUserModal operator={editTarget} onClose={() => { setEditTarget(null) }}
          onDone={() => { void qc.invalidateQueries({ queryKey: ['operators'] }); setEditTarget(null) }} />
      )}
    </div>
  )
}

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  const meta = ROLES.find((r) => r.value === value)
  return (
    <select value={value} disabled={disabled} onChange={(e) => { onChange(e.target.value as Role) }}
      className={`rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20 disabled:cursor-not-allowed disabled:opacity-60 ${meta?.cls ?? ''}`}>
      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
    </select>
  )
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email,    setEmail]    = useState('')
  const [fullName, setFullName] = useState('')
  const [role,     setRole]     = useState<Role>('operator')
  const [password, setPassword] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSaving(true)
    try {
      await api('/operators', { method: 'POST', body: { email, full_name: fullName, role, password } })
      toast.success(`${email} invited`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create operator')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-tundra-ink-200 bg-white shadow-xl" onClick={(e) => { e.stopPropagation() }}>
        <div className="border-b border-tundra-ink-100 px-6 py-4">
          <h2 className="text-base font-semibold text-tundra-ink">Add user</h2>
          <p className="mt-0.5 text-xs text-tundra-ink-500">Create a new operator account with panel access.</p>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Full name</label>
              <input required value={fullName} onChange={(e) => { setFullName(e.target.value) }} placeholder="Alice Smith"
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Email</label>
              <input required type="email" value={email} onChange={(e) => { setEmail(e.target.value) }} placeholder="alice@example.com"
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button key={r.value} type="button" onClick={() => { setRole(r.value) }}
                  className={`rounded-xl border p-3 text-left transition-colors ${role === r.value ? 'border-tundra-lichen bg-tundra-lichen-50 ring-1 ring-tundra-lichen' : 'border-tundra-ink-200 hover:border-tundra-lichen/50'}`}>
                  <RoleBadge role={r.value} />
                  <p className="mt-1 text-[11px] text-tundra-ink-400 leading-snug">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Temporary password</label>
            <input required type="password" value={password} onChange={(e) => { setPassword(e.target.value) }} placeholder="At least 12 characters"
              className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20" />
            <p className="mt-1 text-xs text-tundra-ink-400">User should change this on first login.</p>
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-tundra-rust">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditUserModal({ operator, onClose, onDone }: { operator: Operator; onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState(operator.full_name)
  const [email,    setEmail]    = useState(operator.email)
  const [role,     setRole]     = useState<Role>(operator.role)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSaving(true)
    try {
      await api(`/operators/${operator.id}`, {
        method: 'PATCH',
        body: {
          full_name: fullName !== operator.full_name ? fullName : undefined,
          email:     email    !== operator.email     ? email    : undefined,
          role:      role     !== operator.role      ? role     : undefined,
        },
      })
      toast.success('User updated')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-tundra-ink-200 bg-white shadow-xl" onClick={(e) => { e.stopPropagation() }}>
        <div className="flex items-center gap-3 border-b border-tundra-ink-100 px-6 py-4">
          <Avatar name={operator.full_name} />
          <div>
            <h2 className="text-base font-semibold text-tundra-ink">Edit user</h2>
            <p className="text-xs text-tundra-ink-400">{operator.email}</p>
          </div>
        </div>
        <form onSubmit={(e) => { void handleSave(e) }} className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Full name</label>
              <input required value={fullName} onChange={(e) => { setFullName(e.target.value) }}
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Email</label>
              <input required type="email" value={email} onChange={(e) => { setEmail(e.target.value) }}
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button key={r.value} type="button" onClick={() => { setRole(r.value) }}
                  className={`rounded-xl border p-3 text-left transition-colors ${role === r.value ? 'border-tundra-lichen bg-tundra-lichen-50 ring-1 ring-tundra-lichen' : 'border-tundra-ink-200 hover:border-tundra-lichen/50'}`}>
                  <RoleBadge role={r.value} />
                  <p className="mt-1 text-[11px] text-tundra-ink-400 leading-snug">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-tundra-rust">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">Cancel</button>
            <button type="submit"
              disabled={saving || (fullName === operator.full_name && email === operator.email && role === operator.role)}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
