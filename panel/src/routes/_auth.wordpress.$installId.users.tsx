import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { type WpUser } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/users')({
  component: WpUsersTab,
})

function WpUsersTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ login: '', email: '', role: 'editor', password: '' })
  const [passwordModal, setPasswordModal] = useState<{ userId: number; login: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const { data: users = [], isLoading } = useQuery<WpUser[]>({
    queryKey: ['wp-users', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/users`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((r: { data?: WpUser[] }) => r.data ?? []),
  })

  const createMut = useMutation({
    mutationFn: (data: typeof newUser) =>
      fetch(`/api/v1/wordpress/installations/${installId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: data.login, email: data.email, role: data.role, password: data.password }),
        credentials: 'include',
      }).then((r) => { if (!r.ok) throw new Error('Create failed'); return r.json() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wp-users', installId] })
      toast.success('User created')
      setShowAddForm(false)
      setNewUser({ login: '', email: '', role: 'editor', password: '' })
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
      setPasswordModal(null)
      setNewPassword('')
    },
    onError: () => toast.error('Failed to update password'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => { setShowAddForm(!showAddForm) }}
          className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
          + Add User
        </button>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-tundra-ink-200 bg-white p-5">
          <p className="mb-4 font-semibold text-tundra-ink">Add WordPress User</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: 'login',    label: 'Username', type: 'text',     placeholder: 'john_doe' },
              { key: 'email',    label: 'Email',    type: 'email',    placeholder: 'john@example.com' },
              { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium text-tundra-ink-500">{label}</label>
                <input type={type} placeholder={placeholder}
                  value={newUser[key as keyof typeof newUser]}
                  onChange={(e) => { setNewUser((u) => ({ ...u, [key]: e.target.value })) }}
                  className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Role</label>
              <select value={newUser.role} onChange={(e) => { setNewUser((u) => ({ ...u, role: e.target.value })) }}
                className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none">
                {['administrator', 'editor', 'author', 'contributor', 'subscriber'].map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAddForm(false) }}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Cancel
            </button>
            <button type="button"
              disabled={!newUser.login || !newUser.email || !newUser.password || createMut.isPending}
              onClick={() => createMut.mutate(newUser)}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
              {createMut.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tundra-ink-200 py-16 text-center">
          <svg className="mx-auto mb-3 h-8 w-8 text-tundra-ink-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <p className="text-sm text-tundra-ink-400">No WordPress users found.</p>
          <p className="mt-1 text-xs text-tundra-ink-300">User sync requires WP-CLI on the target server.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Registered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {users.map((u) => (
                <tr key={u.ID} className="hover:bg-tundra-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-tundra-ink">{u.display_name}</p>
                    <p className="text-xs text-tundra-ink-400">{u.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                      u.roles.includes('administrator')
                        ? 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-700'
                        : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500'
                    }`}>{u.roles || 'subscriber'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-tundra-ink-400">{u.user_registered}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button"
                        onClick={() => { setPasswordModal({ userId: u.ID, login: u.user_login }); setNewPassword('') }}
                        className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                        Change Password
                      </button>
                      <button type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => { if (confirm(`Delete user ${u.user_login}?`)) deleteMut.mutate(u.ID) }}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
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

      {/* Change password modal */}
      {passwordModal && (
        <Dialog open onClose={() => { setPasswordModal(null); setNewPassword('') }}>
          <div className="p-5 space-y-4">
            <p className="font-semibold text-tundra-ink">Change password for <span className="font-mono text-tundra-aurora">{passwordModal.login}</span></p>
            <input type="password" placeholder="New password" value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && newPassword) setPwMut.mutate({ userId: passwordModal.userId, password: newPassword }) }}
              autoFocus
              className="w-full rounded-lg border border-tundra-ink-200 px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPasswordModal(null); setNewPassword('') }}
                className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                Cancel
              </button>
              <button type="button"
                disabled={!newPassword || setPwMut.isPending}
                onClick={() => { setPwMut.mutate({ userId: passwordModal.userId, password: newPassword }) }}
                className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
                {setPwMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
