import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { MailDomain, Mailbox, Alias, DkimKey, ListResponse } from '@/lib/api-types'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/mail/domains/$mailDomainId')({
  component: MailDomainDetailPage,
})

function MailDomainDetailPage() {
  const { mailDomainId } = Route.useParams()
  const qc = useQueryClient()

  const [showDkimModal, setShowDkimModal] = useState(false)
  const [dkimKey, setDkimKey] = useState<DkimKey | null>(null)
  const [dkimLoading, setDkimLoading] = useState(false)

  const [showMailboxForm, setShowMailboxForm] = useState(false)
  const [mbLocalPart, setMbLocalPart] = useState('')
  const [mbPassword, setMbPassword] = useState('')
  const [mbLoading, setMbLoading] = useState(false)

  const { data: domain, isLoading, isError } = useQuery({
    queryKey: ['mail-domains', mailDomainId],
    queryFn: () => api<MailDomain>(`/mail/domains/${mailDomainId}`),
  })

  const { data: mailboxes } = useQuery({
    queryKey: ['mail-domains', mailDomainId, 'mailboxes'],
    queryFn: () => api<ListResponse<Mailbox>>(`/mail/domains/${mailDomainId}/mailboxes`),
    enabled: !!domain,
  })

  const { data: aliases } = useQuery({
    queryKey: ['mail-domains', mailDomainId, 'aliases'],
    queryFn: () => api<ListResponse<Alias>>(`/mail/domains/${mailDomainId}/aliases`),
    enabled: !!domain,
  })

  if (isLoading) return <p className="text-tundra-ink-400">Loading…</p>
  if (isError || !domain) return <p className="text-tundra-rust">Mail domain not found.</p>

  function handleRegenerateDkim(): void {
    setDkimLoading(true)
    api<DkimKey>(`/mail/domains/${mailDomainId}/regenerate-dkim`, { method: 'POST' })
      .then((key) => {
        setDkimKey(key)
        setShowDkimModal(true)
        toast.success('DKIM key regenerated. Update your DNS TXT record.')
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to regenerate DKIM key')
      })
      .finally(() => { setDkimLoading(false) })
  }

  function handleCreateMailbox(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setMbLoading(true)
    api('/mail/mailboxes', {
      method: 'POST',
      body: {
        mail_domain_id: mailDomainId,
        local_part: mbLocalPart,
        password: mbPassword,
      },
    })
      .then(() => {
        toast.success('Mailbox created')
        setShowMailboxForm(false)
        setMbLocalPart('')
        setMbPassword('')
        void qc.invalidateQueries({ queryKey: ['mail-domains', mailDomainId, 'mailboxes'] })
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to create mailbox')
      })
      .finally(() => { setMbLoading(false) })
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-0.5 text-2xl font-semibold">{domain.domain}</h1>
          <p className="text-sm text-tundra-ink-500">Mail domain</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            loading={dkimLoading}
            onClick={handleRegenerateDkim}
          >
            Regenerate DKIM
          </Button>
          <Link
            to="/mail/domains/$mailDomainId/diagnostics"
            params={{ mailDomainId }}
            className="rounded border border-tundra-ink-200 bg-transparent px-4 py-2 text-sm font-medium hover:bg-tundra-ink-50"
          >
            Diagnostics
          </Link>
        </div>
      </div>

      {/* Properties */}
      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border border-tundra-ink-200 p-6 text-sm max-w-2xl">
        <dt className="font-medium">Domain</dt>
        <dd>{domain.domain}</dd>

        <dt className="font-medium">MX host</dt>
        <dd>{domain.mx_host}</dd>

        <dt className="font-medium">SPF policy</dt>
        <dd className="font-mono text-xs">{domain.spf_policy || '—'}</dd>

        <dt className="font-medium">DMARC policy</dt>
        <dd className="font-mono text-xs">{domain.dmarc_policy || '—'}</dd>

        <dt className="font-medium">Active</dt>
        <dd>
          {domain.active ? (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
              active
            </span>
          ) : (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
              inactive
            </span>
          )}
        </dd>

        <dt className="font-medium">Webmail</dt>
        <dd>
          {domain.webmail_enabled ? (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-aurora-100 text-tundra-aurora-800">
              enabled
            </span>
          ) : (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-400">
              disabled
            </span>
          )}
        </dd>

        <dt className="font-medium">Created</dt>
        <dd className="text-tundra-ink-400">{new Date(domain.created_at).toLocaleDateString()}</dd>
      </dl>

      {/* Mailboxes section */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Mailboxes</h2>
          {!showMailboxForm && (
            <Button
              type="button"
              onClick={() => { setShowMailboxForm(true) }}
            >
              + Create mailbox
            </Button>
          )}
        </div>

        {showMailboxForm && (
          <form
            onSubmit={handleCreateMailbox}
            className="mb-5 flex flex-col gap-4 rounded-lg border border-tundra-ink-200 p-4 max-w-md"
          >
            <h3 className="font-medium">New mailbox</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Local part</label>
              <div className="flex items-center gap-1">
                <input
                  value={mbLocalPart}
                  onChange={(e) => { setMbLocalPart(e.target.value) }}
                  className="flex-1 rounded border border-tundra-ink-200 px-3 py-2 text-sm"
                  placeholder="user"
                  required
                />
                <span className="text-sm text-tundra-ink-500">@{domain.domain}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={mbPassword}
                onChange={(e) => { setMbPassword(e.target.value) }}
                className="rounded border border-tundra-ink-200 px-3 py-2 text-sm"
                required
                autoComplete="new-password"
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={mbLoading}>
                Create mailbox
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowMailboxForm(false)
                  setMbLocalPart('')
                  setMbPassword('')
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mailboxes && mailboxes.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Address</th>
                  <th className="px-4 py-3 text-left font-medium">Quota usage</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {mailboxes.data.map((mb) => {
                  const pct = mb.quota_bytes > 0 ? mb.used_bytes / mb.quota_bytes : 0
                  return (
                    <tr key={mb.id} className="hover:bg-tundra-ink-50">
                      <td className="px-4 py-3 font-medium">
                        {mb.local_part}@{domain.domain}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-tundra-ink-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-tundra-lichen"
                              style={{ width: String(Math.round(pct * 100)) + '%' }}
                            />
                          </div>
                          <span className="text-xs text-tundra-ink-500">
                            {String(Math.round(mb.used_bytes / 1048576))} /{' '}
                            {String(Math.round(mb.quota_bytes / 1048576))} MB
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {mb.is_active ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
                            active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
                            inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-tundra-ink-400">No mailboxes yet.</p>
        )}
      </section>

      {/* Aliases section */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Aliases</h2>

        {aliases && aliases.data.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-tundra-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-tundra-ink-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Destinations</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tundra-ink-100">
                {aliases.data.map((a) => (
                  <tr key={a.id} className="hover:bg-tundra-ink-50">
                    <td className="px-4 py-3 font-mono font-medium">{a.source}</td>
                    <td className="px-4 py-3 text-tundra-ink-500">
                      {a.destinations.join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      {a.is_active ? (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-800">
                          active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-600">
                          inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-tundra-ink-400">No aliases yet.</p>
        )}
      </section>

      {/* DKIM modal */}
      {showDkimModal && dkimKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xl rounded-lg border border-tundra-ink-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New DKIM public key</h2>
              <button
                type="button"
                onClick={() => { setShowDkimModal(false) }}
                className="text-tundra-ink-400 hover:text-tundra-ink"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-tundra-ink-500">
              Publish this as a DNS TXT record at{' '}
              <code className="font-mono">{dkimKey.selector}._domainkey.{domain.domain}</code>
            </p>
            <pre className="overflow-x-auto rounded bg-tundra-ink-50 p-4 text-xs font-mono whitespace-pre-wrap break-all">
              {dkimKey.public_key_pem}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(dkimKey.public_key_pem).then(() => {
                    toast.success('Copied to clipboard')
                  })
                }}
              >
                Copy key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
