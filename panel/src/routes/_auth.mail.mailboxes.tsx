import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/mail/mailboxes')({
  component: MailMailboxesPage,
})

function MailMailboxesPage() {
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
          className="rounded-t px-4 py-2 text-sm font-medium border-b-2 border-tundra-lichen text-tundra-lichen"
        >
          Mailboxes
        </Link>
        <Link
          to="/mail/queue"
          className="rounded-t px-4 py-2 text-sm font-medium text-tundra-ink-500 hover:text-tundra-ink border-b-2 border-transparent"
        >
          Queue
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-semibold">Mailboxes</h1>

      <div className="rounded-lg border border-tundra-ink-200 p-8 text-center">
        <p className="mb-3 text-tundra-ink-500">
          Select a mail domain to view its mailboxes.
        </p>
        <Link
          to="/mail/domains"
          className="rounded bg-tundra-lichen px-4 py-2 text-sm text-white hover:bg-tundra-lichen-600"
        >
          Go to Mail Domains
        </Link>
      </div>
    </div>
  )
}
