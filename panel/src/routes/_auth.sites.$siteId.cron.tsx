import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ListResponse, ScheduledTask } from '@/lib/api-types'
import { EmptyState } from '@/components/site-shared'
import { fmtDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_auth/sites/$siteId/cron')({
  component: SiteCronTab,
})

const CRON_PRESETS = [
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Weekly', value: '0 0 * * 0' },
  { label: 'Monthly', value: '0 0 1 * *' },
]

interface AddFormState {
  name: string
  schedule: string
  command: string
  working_dir: string
}

const EMPTY_FORM: AddFormState = { name: '', schedule: '', command: '', working_dir: '' }

function SiteCronTab() {
  const { siteId } = Route.useParams()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM)

  const { data, isLoading } = useQuery({
    queryKey: ['sites', siteId, 'scheduled-tasks'],
    queryFn: () => api<ListResponse<ScheduledTask>>(`/sites/${siteId}/scheduled-tasks`),
  })

  const tasks = data?.data ?? []

  // ── Create ───────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (body: AddFormState) =>
      api(`/sites/${siteId}/scheduled-tasks`, {
        method: 'POST',
        body: {
          name: body.name,
          schedule: body.schedule,
          command: body.command,
          ...(body.working_dir ? { working_dir: body.working_dir } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'scheduled-tasks'] })
      toast.success('Scheduled task created')
      setForm(EMPTY_FORM)
      setShowForm(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create task'),
  })

  // ── Run now ──────────────────────────────────────────────────────────────
  const runMut = useMutation({
    mutationFn: (id: string) => api(`/scheduled-tasks/${id}/run`, { method: 'POST' }),
    onSuccess: () => toast.success('Task queued'),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to queue task'),
  })

  // ── Toggle active ────────────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/scheduled-tasks/${id}`, { method: 'PATCH', body: { is_active } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'scheduled-tasks'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update task'),
  })

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/scheduled-tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'scheduled-tasks'] })
      toast.success('Task deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete task'),
  })

  function handleOpenForm() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.schedule.trim() || !form.command.trim()) return
    createMut.mutate(form)
  }

  function handleDelete(task: ScheduledTask) {
    if (!window.confirm(`Delete scheduled task "${task.name}"? This cannot be undone.`)) return
    deleteMut.mutate(task.id)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-tundra-ink-400">
          {tasks.length} scheduled task{tasks.length !== 1 ? 's' : ''}
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={handleOpenForm}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors"
          >
            + Add task
          </button>
        )}
      </div>

      {/* Inline add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-tundra-ink-200 bg-white p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-tundra-ink">New scheduled task</p>

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
                placeholder="Daily cleanup"
                required
                className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
            </div>

            {/* Schedule */}
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-600">
                Schedule <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.schedule}
                onChange={(e) => { setForm((f) => ({ ...f, schedule: e.target.value })) }}
                placeholder="0 * * * *"
                required
                className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
              />
              {/* Preset chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, schedule: p.value })) }}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      form.schedule === p.value
                        ? 'border-tundra-lichen bg-tundra-lichen text-white'
                        : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-600 hover:border-tundra-lichen hover:text-tundra-lichen'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
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
              placeholder="/usr/bin/php artisan schedule:run"
              required
              className="w-full rounded-xl border border-tundra-ink-200 px-3.5 py-2.5 font-mono text-sm focus:border-tundra-lichen focus:outline-none focus:ring-2 focus:ring-tundra-lichen/20"
            />
          </div>

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

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={createMut.isPending || !form.name.trim() || !form.schedule.trim() || !form.command.trim()}
              className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? 'Saving…' : 'Save task'}
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
      ) : tasks.length === 0 ? (
        <EmptyState
          message="No scheduled tasks configured."
          action="Add cron task →"
          onAction={handleOpenForm}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Schedule</th>
                <th className="px-4 py-3 text-left">Command</th>
                <th className="px-4 py-3 text-left">Last run</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {tasks.map((t) => {
                const isToggling = toggleMut.isPending && toggleMut.variables?.id === t.id
                const isRunning = runMut.isPending && runMut.variables === t.id
                const isDeleting = deleteMut.isPending && deleteMut.variables === t.id

                return (
                  <tr key={t.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-tundra-ink">{t.name}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-tundra-ink-100 px-1.5 py-0.5 font-mono text-xs text-tundra-ink-600">
                        {t.schedule}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="block max-w-[16rem] truncate font-mono text-xs text-tundra-ink-500"
                        title={t.command}
                      >
                        {t.command}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-400">
                      {t.last_run_at ? (
                        fmtDateTime(t.last_run_at)
                      ) : (
                        <span className="italic text-tundra-ink-300">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                          t.is_active
                            ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700'
                            : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${t.is_active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`}
                        />
                        {t.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {/* Run now */}
                        <button
                          type="button"
                          onClick={() => { runMut.mutate(t.id) }}
                          disabled={isRunning || isDeleting}
                          className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
                        >
                          {isRunning ? '…' : 'Run now'}
                        </button>

                        {/* Pause / Resume */}
                        <button
                          type="button"
                          onClick={() => {
                            toggleMut.mutate({ id: t.id, is_active: !t.is_active })
                          }}
                          disabled={isToggling || isDeleting}
                          className={`rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-50 transition-colors ${
                            t.is_active
                              ? 'border-tundra-ink-200 text-tundra-ink-600 hover:bg-tundra-ink-50'
                              : 'border-tundra-lichen-300 text-tundra-lichen-700 hover:bg-tundra-lichen-50'
                          }`}
                        >
                          {isToggling ? '…' : t.is_active ? 'Pause' : 'Resume'}
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => { handleDelete(t) }}
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
