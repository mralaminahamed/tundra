import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/mail/queue')({
  component: MailQueuePage,
})

function MailQueuePage() {
  return (
    <div>
      {/* Tab nav */}
      <div className="mb-6 flex items-center gap-1 border-b border-tundra-ink-200 pb-0">
        <Link
          to="/mail/domains"
          className="rounded-t px-4 py-2 text-sm font-medium text-tundra-ink-500 hover:text-tundra-ink border-b-2 border-transparent"
        >
          Domains
        </Link>
        <Link
          to="/mail/mailboxes"
          className="rounded-t px-4 py-2 text-sm font-medium text-tundra-ink-500 hover:text-tundra-ink border-b-2 border-transparent"
        >
          Mailboxes
        </Link>
        <Link
          to="/mail/queue"
          className="rounded-t px-4 py-2 text-sm font-medium border-b-2 border-tundra-lichen text-tundra-lichen"
        >
          Queue
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-semibold">Mail Queue</h1>

      <div className="rounded-lg border border-tundra-ink-200 p-8 text-center">
        <p className="text-tundra-ink-400">Mail queue is empty.</p>
      </div>
    </div>
  )
}
