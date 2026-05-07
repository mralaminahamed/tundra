import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { type WpUser } from '@/components/wp-shared'
import { fmtDate } from '@/lib/utils'
import { RefreshIcon, LoadingIcon } from '@/components/icons'

export const Route = createFileRoute('/_auth/wordpress/$installId/users')({
  component: WpUsersTab,
})

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, { badge: string; avatar: string }> = {
  administrator: {
    badge:  'border-tundra-aurora-200 bg-tundra-aurora-50 text-tundra-aurora-700',
    avatar: 'bg-tundra-aurora-100 text-tundra-aurora-700',
  },
  editor: {
    badge:  'border-purple-200 bg-purple-50 text-purple-700',
    avatar: 'bg-purple-100 text-purple-700',
  },
  author: {
    badge:  'border-tundra-lichen-200 bg-tundra-lichen-50 text-tundra-lichen-700',
    avatar: 'bg-tundra-lichen-100 text-tundra-lichen-700',
  },
  contributor: {
    badge:  'border-yellow-200 bg-yellow-50 text-yellow-700',
    avatar: 'bg-yellow-100 text-yellow-700',
  },
  subscriber: {
    badge:  'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',
    avatar: 'bg-tundra-ink-100 text-tundra-ink-500',
  },
}

function getRoleStyle(roles: string) {
  const first = roles.split(',')[0]?.trim().toLowerCase() ?? 'subscriber'
  return ROLE_STYLES[first] ?? ROLE_STYLES.subscriber!
}

function fmtWpDate(d: string) {
  return fmtDate(d.includes('T') ? d : d.replace(' ', 'T'))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, roles }: { name: string; roles: string }) {
  const { avatar } = getRoleStyle(roles)
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ${avatar}`}>
      {(name || '?').charAt(0)}
    </span>
  )
}

function RoleBadge({ roles }: { roles: string }) {
  const label = (roles.split(',')[0]?.trim() || 'subscriber')
  const { badge } = getRoleStyle(roles)
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${badge}`}>
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function WpUsersTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()

  const [addOpen, setAddOpen]         = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WpUser | null>(null)
  const [pwTarget, setPwTarget]       = useState<WpUser | null>(null)

  const [newUser, setNewUser] = useState({ login: '', email: '', role: 'editor', password: '' })
  const [showNewPw, setShowNewPw]     = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [search, setSearch]           = useState('')

  const { data: users = [], isLoading } = useQuery<WpUser[]>({
    queryKey: ['wp-users', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/users`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((r: { data?: WpUser[] }) => r.data ?? []),
  })

  const syncMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/users/sync`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json() as Promise<{ synced: number }>),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['wp-users', installId] })
      toast.success(`Synced ${d.synced} users`)
    },
    onError: () => toast.error('Sync failed'),
  })

  const createMut = useMutation({
    mutationFn: (data: typeof newUser) =>
      api(`/wordpress/installations/${installId}/users`, {
        method: 'POST',
        body: { login: data.login, email: data.email, role: data.role, password: data.password },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-users', installId] })
      toast.success('User created')
      setAddOpen(false)
      setNewUser({ login: '', email: '', role: 'editor', password: '' })
      setShowNewPw(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Create failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (userId: number) =>
      fetch(`/api/v1/wordpress/installations/${installId}/users/${userId}`, {
        method: 'DELETE', credentials: 'include',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-users', installId] })
      toast.success('User deleted')
      setDeleteTarget(null)
    },
    onError: () => toast.error('Delete failed'),
  })

  const setPwMut = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      fetch(`/api/v1/wordpress/installations/${installId}/users/${userId}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      }).then((r) => { if (!r.ok) throw new Error('Failed') }),
    onSuccess: () => {
      toast.success('Password updated')
      setPwTarget(null)
      setNewPassword('')
      setShowPw(false)
    },
    onError: () => toast.error('Failed to update password'),
  })

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return !q || u.user_login.toLowerCase().includes(q) || u.user_email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-tundra-ink-200 pl-8 pr-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
          />
        </div>
        <span className="text-sm text-tundra-ink-400">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
            <RefreshIcon size={13} className={syncMut.isPending ? 'animate-spin' : ''} />
            {syncMut.isPending ? 'Syncing…' : 'Refresh'}
          </button>
          <button type="button" onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-1.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Add User
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tundra-ink-200 py-16 text-center">
          <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <p className="text-sm text-tundra-ink-400">{search ? 'No users match your search.' : 'No WordPress users found.'}</p>
          {!search && <p className="mt-1 text-xs text-tundra-ink-300">Click Refresh to sync from the WordPress installation.</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50">
              <tr>
                {['USER', 'LOGIN', 'ROLE', 'REGISTERED', 'ACTIONS'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {filtered.map((u) => (
                <tr key={u.ID} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.display_name || u.user_login} roles={u.roles} />
                      <div>
                        <p className="font-medium text-tundra-ink">{u.display_name || u.user_login}</p>
                        <p className="text-xs text-tundra-ink-400">{u.user_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-tundra-ink-500">{u.user_login}</td>
                  <td className="px-4 py-3"><RoleBadge roles={u.roles} /></td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-400">{fmtWpDate(u.user_registered)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button type="button"
                        onClick={() => { setPwTarget(u); setNewPassword(''); setShowPw(false) }}
                        className="rounded-lg border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                        Set Password
                      </button>
                      <button type="button"
                        onClick={() => setDeleteTarget(u)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add User modal ─────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setShowNewPw(false) }}>
        <DialogHeader>
          <DialogTitle>Add WordPress User</DialogTitle>
          <DialogDescription>New account will be created directly in the WordPress installation.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Username *</label>
            <input type="text" placeholder="john_doe" autoFocus
              value={newUser.login}
              onChange={(e) => setNewUser((u) => ({ ...u, login: e.target.value }))}
              className="h-9 w-full rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Email *</label>
            <input type="email" placeholder="john@example.com"
              value={newUser.email}
              onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
              className="h-9 w-full rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Password *</label>
            <div className="relative">
              <input type={showNewPw ? 'text' : 'password'} placeholder="••••••••"
                value={newUser.password}
                onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                className="h-9 w-full rounded-lg border border-tundra-ink-200 pl-3 pr-9 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
              <button type="button" onClick={() => setShowNewPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tundra-ink-400 hover:text-tundra-ink transition-colors">
                {showNewPw
                  ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                  : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Role</label>
            <select value={newUser.role} onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
              className="h-9 w-full rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen bg-white">
              {['administrator', 'editor', 'author', 'contributor', 'subscriber'].map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => { setAddOpen(false); setShowNewPw(false) }}
            className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            Cancel
          </button>
          <button type="button"
            disabled={!newUser.login || !newUser.email || !newUser.password || createMut.isPending}
            onClick={() => createMut.mutate(newUser)}
            className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
            {createMut.isPending && <LoadingIcon size={13} className="animate-spin" />}
            {createMut.isPending ? 'Creating…' : 'Create User'}
          </button>
        </DialogFooter>
      </Dialog>

      {/* ── Set Password modal ─────────────────────────────────────────────── */}
      <Dialog open={!!pwTarget} onClose={() => { setPwTarget(null); setNewPassword(''); setShowPw(false) }}>
        {pwTarget && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <Avatar name={pwTarget.display_name || pwTarget.user_login} roles={pwTarget.roles} />
                <div>
                  <DialogTitle>Set Password</DialogTitle>
                  <p className="text-xs text-tundra-ink-400 mt-0.5">
                    <span className="font-mono">{pwTarget.user_login}</span> · {pwTarget.user_email}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">New password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newPassword)
                      setPwMut.mutate({ userId: pwTarget.ID, password: newPassword })
                  }}
                  autoFocus
                  className="h-9 w-full rounded-lg border border-tundra-ink-200 pl-3 pr-9 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tundra-ink-400 hover:text-tundra-ink transition-colors">
                  {showPw
                    ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                    : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              {newPassword && (
                <PasswordStrength password={newPassword} />
              )}
            </div>

            <DialogFooter>
              <button type="button" onClick={() => { setPwTarget(null); setNewPassword(''); setShowPw(false) }}
                className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={!newPassword || setPwMut.isPending}
                onClick={() => setPwMut.mutate({ userId: pwTarget.ID, password: newPassword })}
                className="flex items-center gap-1.5 rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
                {setPwMut.isPending && <LoadingIcon size={13} className="animate-spin" />}
                {setPwMut.isPending ? 'Saving…' : 'Update Password'}
              </button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {/* ── Delete confirmation modal ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="max-w-sm">
        {deleteTarget && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </span>
                <div>
                  <DialogTitle>Delete User</DialogTitle>
                  <DialogDescription>This action cannot be undone.</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-lg border border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={deleteTarget.display_name || deleteTarget.user_login} roles={deleteTarget.roles} />
                <div>
                  <p className="text-sm font-medium text-tundra-ink">{deleteTarget.display_name}</p>
                  <p className="text-xs text-tundra-ink-400"><span className="font-mono">{deleteTarget.user_login}</span> · {deleteTarget.user_email}</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(deleteTarget.ID)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleteMut.isPending && <LoadingIcon size={13} className="animate-spin" />}
                {deleteMut.isPending ? 'Deleting…' : 'Delete User'}
              </button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  )
}

// ── Password strength ─────────────────────────────────────────────────────────

function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',   color: 'bg-red-400' }
  if (score <= 3) return { score, label: 'Fair',   color: 'bg-yellow-400' }
  if (score === 4) return { score, label: 'Good',  color: 'bg-tundra-aurora' }
  return              { score, label: 'Strong', color: 'bg-tundra-lichen' }
}

function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = getStrength(password)
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : 'bg-tundra-ink-100'}`} />
        ))}
      </div>
      <span className={`text-[11px] font-medium ${score <= 1 ? 'text-red-500' : score <= 3 ? 'text-yellow-600' : score === 4 ? 'text-tundra-aurora-700' : 'text-tundra-lichen-700'}`}>
        {label}
      </span>
    </div>
  )
}
