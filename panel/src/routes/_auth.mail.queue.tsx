import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { MailQueueEntry, ListResponse } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/mail/queue')({
  component: MailQueuePage,
})

const MAIL_TABS = [
  { to: '/mail/domains', label: 'Domains' },
  { to: '/mail/mailboxes', label: 'Mailboxes' },
  { to: '/mail/queue', label: 'Queue' },
] as const

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${String(Math.floor(diff))}s ago`
  if (diff < 3600) return `${String(Math.floor(diff / 60))}m ago`
  return `${String(Math.floor(diff / 3600))}h ago`
}

function MailQueuePage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mail-queue'],
    queryFn: () => api<ListResponse<MailQueueEntry>>('/mail/queue'),
    refetchInterval: 15_000,
  })

  const flushMutation = useMutation({
    mutationFn: (id: string) => api(`/mail/queue/${id}/flush`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mail-queue'] })
      toast.success('Message queued for retry')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/mail/queue/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mail-queue'] })
      toast.success('Message removed from queue')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const entries = data?.data ?? []

  return (
    <div>
      {/* Tab nav */}
      <div className="mb-6 flex items-center gap-1 border-b border-tundra-ink-200">
        {MAIL_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="rounded-t px-4 py-2 text-sm font-medium border-b-2 -mb-px"
            activeProps={{ className: 'border-tundra-lichen text-tundra-lichen' }}
            inactiveProps={{ className: 'border-transparent text-tundra-ink-500 hover:text-tundra-ink' }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mail Queue</h1>
          {entries.length > 0 && (
            <p className="mt-1 text-sm text-tundra-ink-500">
              {String(entries.length)} message{entries.length !== 1 ? 's' : ''} waiting
            </p>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-tundra-ink-400">Loading…</p>}
      {isError && <p className="text-sm text-tundra-rust">Failed to load queue.</p>}

      {!isLoading && entries.length === 0 && (
        <div className="rounded-lg border border-tundra-ink-200 py-12 text-center">
          <p className="text-sm text-tundra-ink-400">Mail queue is empty.</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Queue</th>
                <th className="px-4 py-3 text-left font-medium">From</th>
                <th className="px-4 py-3 text-left font-medium">To</th>
                <th className="px-4 py-3 text-left font-medium">Subject</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Age</th>
                <th className="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3">
                    <span className="rounded bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-mono">
                      {e.queue_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-600 truncate max-w-[12rem]">{e.sender}</td>
                  <td className="px-4 py-3 text-tundra-ink-600 truncate max-w-[12rem]">
                    {e.recipients.slice(0, 2).join(', ')}
                    {e.recipients.length > 2 && <span className="text-tundra-ink-400"> +{String(e.recipients.length - 2)}</span>}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-500 truncate max-w-[14rem]">
                    {e.subject ?? <span className="italic text-tundra-ink-400">no subject</span>}
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400 whitespace-nowrap">
                    {String(Math.round(e.size_bytes / 1024))} KB
                  </td>
                  <td className="px-4 py-3 text-tundra-ink-400 whitespace-nowrap">
                    {relativeTime(e.arrival_time)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { flushMutation.mutate(e.id) }}
                        disabled={flushMutation.isPending}
                        className="text-xs text-tundra-aurora hover:underline disabled:opacity-50"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => { if (confirm('Remove from queue?')) deleteMutation.mutate(e.id) }}
                        disabled={deleteMutation.isPending}
                        className="text-xs text-tundra-rust hover:underline disabled:opacity-50"
                      >
                        Drop
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
