import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth'

export const Route = createFileRoute('/_auth/operators')({
  component: OperatorsPage,
})

interface Operator {
  id: string
  email: string
  full_name: string
  role: 'superadmin' | 'admin' | 'viewer'
  has_totp: boolean
  last_active_at: string | null
  created_at: string
}

function roleBadge(role: Operator['role']) {
  const map: Record<string, string> = {
    superadmin: 'bg-tundra-aurora-100 text-tundra-aurora-800',
    admin: 'bg-tundra-lichen-100 text-tundra-lichen-800',
    viewer: 'bg-tundra-ink-100 text-tundra-ink-600',
  }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[role] ?? ''}`}>
      {role}
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${String(Math.floor(diff))}s ago`
  if (diff < 3600) return `${String(Math.floor(diff / 60))}m ago`
  if (diff < 86400) return `${String(Math.floor(diff / 3600))}h ago`
  return `${String(Math.floor(diff / 86400))}d ago`
}

function OperatorsPage() {
  const queryClient = useQueryClient()
  const currentOperator = useAuthStore((s) => s.operator)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['operators'],
    queryFn: () => api<{ data: Operator[] }>('/operators'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/operators/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operators'] })
      toast.success('Operator removed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const operators = data?.data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Operators</h1>
          <p className="mt-1 text-sm text-tundra-ink-500">
            Manage who has access to this Tundra instance.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true) }}
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          + Invite operator
        </button>
      </div>

      {isLoading && <SkeletonPage />}
      {isError && <p className="text-sm text-tundra-rust">Failed to load operators.</p>}

      {operators.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">MFA</th>
                <th className="px-4 py-3 text-left font-medium">Last active</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {operators.map((op) => (
                <tr key={op.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-tundra-ink-100 text-xs font-semibold text-tundra-ink-600 select-none">
                        {op.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium">{op.full_name}</span>
                      {op.id === currentOperator?.id && (
                        <span className="text-xs text-tundra-ink-400">(you)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500">{op.email}</td>
                  <td className="px-4 py-3">{roleBadge(op.role)}</td>
                  <td className="px-4 py-3">
                    {op.has_totp ? (
                      <span className="inline-flex items-center gap-1 text-xs text-tundra-lichen-700">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-tundra-lichen" />
                        TOTP
                      </span>
                    ) : (
                      <span className="text-xs text-tundra-ink-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400">{relativeTime(op.last_active_at)}</td>
                  <td className="px-4 py-3 text-tundra-ink-400">
                    {new Date(op.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {op.id !== currentOperator?.id && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove operator ${op.email}?`)) {
                            deleteMutation.mutate(op.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="text-xs text-tundra-rust hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateOperatorDialog
          onClose={() => { setShowCreate(false) }}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['operators'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function CreateOperatorDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('admin')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/operators', {
        method: 'POST',
        body: { email, full_name: fullName, role, password },
      })
      toast.success(`Operator ${email} created`)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create operator')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Create operator</h2>
        <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Full name
            <input required value={fullName} onChange={(e) => { setFullName(e.target.value) }}
              className="rounded border border-tundra-ink-200 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input required type="email" value={email} onChange={(e) => { setEmail(e.target.value) }}
              className="rounded border border-tundra-ink-200 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select value={role} onChange={(e) => { setRole(e.target.value) }}
              className="rounded border border-tundra-ink-200 px-3 py-2">
              <option value="superadmin">superadmin</option>
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Temporary password
            <input required type="password" value={password} onChange={(e) => { setPassword(e.target.value) }}
              className="rounded border border-tundra-ink-200 px-3 py-2" />
          </label>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="rounded border border-tundra-ink-200 px-4 py-2 text-sm hover:bg-tundra-ink-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
