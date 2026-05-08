import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Daemon, ListResponse } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/daemons')({
  component: SiteDaemonsTab,
})

interface AddFormState {
  name: string
  command: string
  working_dir: string
  env_file: string
}

const EMPTY_FORM: AddFormState = { name: '', command: '', working_dir: '', env_file: '' }

function SiteDaemonsTab() {
  const { siteId } = Route.useParams()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM)

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'daemons'],
    queryFn: () => api<ListResponse<Daemon>>(`/sites/${siteId}/daemons`),
  })

  const daemons = data?.data ?? []

  // ── Create ───────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (body: AddFormState) =>
      api(`/sites/${siteId}/daemons`, {
        method: 'POST',
        body: {
          name: body.name,
          command: body.command,
          ...(body.working_dir ? { working_dir: body.working_dir } : {}),
          ...(body.env_file ? { env_file: body.env_file } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'daemons'] })
      toast.success('Daemon created')
      setForm(EMPTY_FORM)
      setShowForm(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create daemon'),
  })

  // ── Toggle active ────────────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/daemons/${id}`, { method: 'PATCH', body: { is_active } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'daemons'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update daemon'),
  })

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/daemons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'daemons'] })
      toast.success('Daemon deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete daemon'),
  })

  function handleOpenForm() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.command.trim()) return
    createMut.mutate(form)
  }

  function handleDelete(daemon: Daemon) {
    if (!window.confirm(`Delete daemon "${daemon.name}"? This cannot be undone.`)) return
    deleteMut.mutate(daemon.id)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">
          {daemons.length} daemon{daemons.length !== 1 ? 's' : ''}
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={handleOpenForm}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
          >
            + Add daemon
          </button>
        )}
      </div>

      {/* Inline add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-tundra-ink-200 bg-white p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-tundra-ink">New daemon</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-600">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })) }}
                placeholder="queue-worker"
                required
                className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
            </div>

            {/* Command */}
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-600">
                Command <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.command}
                onChange={(e) => { setForm((f) => ({ ...f, command: e.target.value })) }}
                placeholder="php artisan queue:work"
                required
                className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Working dir */}
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-600">
                Working directory <span className="text-tundra-ink-300">(optional)</span>
              </label>
              <input
                type="text"
                value={form.working_dir}
                onChange={(e) => { setForm((f) => ({ ...f, working_dir: e.target.value })) }}
                placeholder="/var/www/mysite"
                className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
            </div>

            {/* Env file */}
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-600">
                Env file <span className="text-tundra-ink-300">(optional)</span>
              </label>
              <input
                type="text"
                value={form.env_file}
                onChange={(e) => { setForm((f) => ({ ...f, env_file: e.target.value })) }}
                placeholder="/var/www/mysite/.env"
                className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
              <p className="mt-1 text-xs text-tundra-ink-400">Path to .env file to load into the process environment</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={createMut.isPending || !form.name.trim() || !form.command.trim()}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? 'Saving…' : 'Save daemon'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              disabled={createMut.isPending}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />
          ))}
        </div>
      ) : daemons.length === 0 ? (
        <EmptyState
          message="No daemons configured for this site."
          action="Add daemon →"
          onAction={handleOpenForm}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Command</th>
                <th className="px-4 py-3 text-left">Dir</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {daemons.map((d) => {
                const isToggling = toggleMut.isPending && toggleMut.variables?.id === d.id
                const isDeleting = deleteMut.isPending && deleteMut.variables === d.id

                return (
                  <tr key={d.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-tundra-ink">{d.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className="block max-w-[18rem] truncate font-mono text-xs text-tundra-ink-500"
                        title={d.command}
                      >
                        {d.command}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.working_dir ? (
                        <span
                          className="block max-w-[14rem] truncate font-mono text-xs text-tundra-ink-400"
                          title={d.working_dir}
                        >
                          {d.working_dir}
                        </span>
                      ) : (
                        <span className="italic text-xs text-tundra-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                          d.is_active
                            ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700'
                            : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${d.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`}
                        />
                        {d.is_active ? 'Running' : 'Stopped'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {/* Stop / Start */}
                        <button
                          type="button"
                          onClick={() => {
                            toggleMut.mutate({ id: d.id, is_active: !d.is_active })
                          }}
                          disabled={isToggling || isDeleting}
                          className={`rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-50 transition-colors ${
                            d.is_active
                              ? 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'
                              : 'border-tundra-lichen-300 text-tundra-lichen-700 hover:bg-tundra-lichen-50'
                          }`}
                        >
                          {isToggling ? '…' : d.is_active ? 'Stop' : 'Start'}
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => { handleDelete(d) }}
                          disabled={isDeleting || isToggling}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
