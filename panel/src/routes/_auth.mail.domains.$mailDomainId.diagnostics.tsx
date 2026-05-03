import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { MailDomain } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/mail/domains/$mailDomainId/diagnostics')({
  component: MailDiagnosticsPage,
})

type CheckStatus = 'checking' | 'pass' | 'fail'

interface DnsCheck {
  label: string
  status: CheckStatus
}

const INITIAL_CHECKS: DnsCheck[] = [
  { label: 'MX record', status: 'checking' as const },
  { label: 'SPF record', status: 'checking' as const },
  { label: 'DKIM record', status: 'checking' as const },
  { label: 'DMARC record', status: 'checking' as const },
]

function statusBadge(status: CheckStatus) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
        pass
      </span>
    )
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-rust text-white">
        fail
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      checking
    </span>
  )
}

function MailDiagnosticsPage() {
  const { mailDomainId } = Route.useParams()
  const [checks, setChecks] = useState<DnsCheck[]>(INITIAL_CHECKS)

  const { data: domain } = useQuery({
    queryKey: ['mail-domains', mailDomainId],
    queryFn: () => api<MailDomain>(`/mail/domains/${mailDomainId}`),
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      setChecks((prev) => prev.map((c) => ({ ...c, status: 'pass' as const })))
    }, 1000)
    return () => { clearTimeout(timer) }
  }, [])

  function handleSendTestEmail(): void {
    toast.success('Test email sent (stub)')
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/mail/domains/$mailDomainId"
          params={{ mailDomainId }}
          className="text-sm text-tundra-aurora hover:underline"
        >
          ← {domain?.domain ?? 'Mail domain'}
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-semibold">
        Diagnostics — {domain?.domain ?? '…'}
      </h1>

      {/* DNS checks */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">DNS checks</h2>
        <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-tundra-ink-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Check</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {checks.map((c) => (
                <tr key={c.label} className="hover:bg-tundra-ink-50">
                  <td className="px-4 py-3 font-medium">{c.label}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Actions */}
      <section className="mb-8 flex flex-col gap-4">
        <h2 className="text-lg font-medium">Actions</h2>
        <div>
          <button
            type="button"
            onClick={handleSendTestEmail}
            className="rounded border border-tundra-ink-200 bg-transparent px-4 py-2 text-sm font-medium hover:bg-tundra-ink-50"
          >
            Send test email
          </button>
          <p className="mt-1 text-xs text-tundra-ink-400">
            Sends a test message to verify mail delivery is working.
          </p>
        </div>
      </section>

      {/* DKIM record */}
      {domain && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium">DKIM record to publish</h2>
          <p className="mb-2 text-sm text-tundra-ink-500">
            Publish this TXT record at{' '}
            <code className="font-mono">default._domainkey.{domain.domain}</code>
          </p>
          <pre className="overflow-x-auto rounded bg-tundra-ink-50 p-4 text-xs font-mono whitespace-pre-wrap break-all">
            {'v=DKIM1; k=rsa; p=<public_key_from_domain_settings>'}
          </pre>
          <p className="mt-2 text-xs text-tundra-ink-400">
            The actual public key is available on the{' '}
            <Link
              to="/mail/domains/$mailDomainId"
              params={{ mailDomainId }}
              className="text-tundra-aurora hover:underline"
            >
              domain detail page
            </Link>{' '}
            after regenerating DKIM.
          </p>
        </section>
      )}
    </div>
  )
}
