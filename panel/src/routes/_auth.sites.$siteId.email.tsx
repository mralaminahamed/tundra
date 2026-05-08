import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { MailDomain, Mailbox, Alias, ListResponse, Site } from '@/lib/api-types'

export const Route = createFileRoute('/_auth/sites/$siteId/email')({
  component: SiteEmailTab,
})

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (!b || b <= 0) return 'Unlimited'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function generatePassword(): string {
  return Array.from(
    { length: 16 },
    () =>
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'.charAt(
        Math.floor(Math.random() * 70),
      ),
  ).join('')
}

const QUOTA_OPTIONS: { label: string; value: number }[] = [
  { label: 'Unlimited', value: 0 },
  { label: '1 GB', value: 1 * 1024 * 1024 * 1024 },
  { label: '5 GB', value: 5 * 1024 * 1024 * 1024 },
  { label: '10 GB', value: 10 * 1024 * 1024 * 1024 },
]

// ─── sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
      {children}
    </p>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-tundra-ink-100" />
      ))}
    </div>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        active
          ? 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-700'
          : 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-400'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'}`}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ─── mail domain setup card ──────────────────────────────────────────────────

interface MailDomainSetupProps {
  primaryDomain: string | undefined
  onCreated: () => void
}

function MailDomainSetup({ primaryDomain, onCreated }: MailDomainSetupProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    domain: primaryDomain ?? '',
    mx_host: '',
    spf_policy: '',
    dmarc_policy: '',
  })

  const createMut = useMutation({
    mutationFn: () =>
      api<MailDomain>('/mail/domains', {
        method: 'POST',
        body: {
          domain: form.domain,
          mx_host: form.mx_host,
          ...(form.spf_policy ? { spf_policy: form.spf_policy } : {}),
          ...(form.dmarc_policy ? { dmarc_policy: form.dmarc_policy } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail-domains'] })
      toast.success('Mail domain created')
      onCreated()
    },
    onError: () => toast.error('Failed to create mail domain'),
  })

  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })) }

  return (
    <div className="space-y-4">
      <SectionHeader>Mail Domain Setup</SectionHeader>
      <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-tundra-ink-500">
              Domain <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.domain}
              onChange={(e) => { set('domain', e.target.value) }}
              placeholder="mail.example.com"
              className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-tundra-ink-500">
              MX Host <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.mx_host}
              onChange={(e) => { set('mx_host', e.target.value) }}
              placeholder="mail.example.com"
              className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-tundra-ink-500">
              SPF Policy{' '}
              <span className="text-tundra-ink-300 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.spf_policy}
              onChange={(e) => { set('spf_policy', e.target.value) }}
              placeholder="v=spf1 mx ~all"
              className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 font-mono text-sm text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-tundra-ink-500">
              DMARC Policy{' '}
              <span className="text-tundra-ink-300 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.dmarc_policy}
              onChange={(e) => { set('dmarc_policy', e.target.value) }}
              placeholder="v=DMARC1; p=none"
              className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 font-mono text-sm text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            disabled={!form.domain || !form.mx_host || createMut.isPending}
            onClick={() => { createMut.mutate() }}
            className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-tundra-lichen-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMut.isPending ? 'Creating…' : 'Create mail domain'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── mail domain status card ─────────────────────────────────────────────────

interface MailDomainCardProps {
  mailDomain: MailDomain
  onDelete: () => void
  isDeleting: boolean
}

function MailDomainCard({ mailDomain, onDelete, isDeleting }: MailDomainCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="space-y-4">
      <SectionHeader>Mail Domain</SectionHeader>
      <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
            Configuration
          </span>
          <div className="flex items-center gap-2">
            <ActiveBadge active={mailDomain.active} />
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-600">Remove domain?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {isDeleting ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false) }}
                  className="rounded border border-tundra-ink-200 px-2 py-0.5 text-xs text-tundra-ink-500 hover:bg-tundra-ink-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setConfirmDelete(true) }}
                className="rounded border border-red-200 px-2.5 py-0.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-tundra-ink-100 sm:grid-cols-4">
          {[
            { label: 'Domain', value: mailDomain.domain },
            { label: 'MX Host', value: mailDomain.mx_host },
            { label: 'SPF', value: mailDomain.spf_policy || '—' },
            { label: 'DMARC', value: mailDomain.dmarc_policy || '—' },
          ].map(({ label, value }) => (
            <div key={label} className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">
                {label}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-tundra-ink" title={value}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── mailboxes section ────────────────────────────────────────────────────────

interface MailboxesSectionProps {
  mailDomain: MailDomain
}

function MailboxesSection({ mailDomain }: MailboxesSectionProps) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newMb, setNewMb] = useState({ local_part: '', password: '', quota_bytes: 0 })
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: mailboxesData, isLoading } = useQuery({
    queryKey: ['mail-mailboxes', mailDomain.id],
    queryFn: () => api<ListResponse<Mailbox>>(`/mail/domains/${mailDomain.id}/mailboxes`),
  })
  const mailboxes = mailboxesData?.data ?? []

  const createMut = useMutation({
    mutationFn: () =>
      api<Mailbox>('/mail/mailboxes', {
        method: 'POST',
        body: {
          mail_domain_id: mailDomain.id,
          local_part: newMb.local_part,
          password: newMb.password,
          ...(newMb.quota_bytes > 0 ? { quota_bytes: newMb.quota_bytes } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail-mailboxes', mailDomain.id] })
      toast.success(`Mailbox ${newMb.local_part}@${mailDomain.domain} created`)
      setShowCreate(false)
      setNewMb({ local_part: '', password: '', quota_bytes: 0 })
    },
    onError: () => toast.error('Failed to create mailbox'),
  })

  const resetPwMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api(`/mail/mailboxes/${id}/reset-password`, {
        method: 'POST',
        body: { password },
      }),
    onSuccess: (_, { id }) => {
      toast.success('Password updated')
      setResetId(null)
      setResetPw('')
      void qc.invalidateQueries({ queryKey: ['mail-mailboxes', mailDomain.id] })
      // suppress unused warning
      void id
    },
    onError: () => toast.error('Failed to reset password'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api(`/mail/mailboxes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail-mailboxes', mailDomain.id] })
      toast.success('Mailbox deleted')
      setConfirmDeleteId(null)
    },
    onError: () => toast.error('Failed to delete mailbox'),
  })

  const setMb = (k: keyof typeof newMb, v: string | number) => { setNewMb((f) => ({ ...f, [k]: v })) }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader>
          Mailboxes
          <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-medium text-tundra-ink-500 normal-case tracking-normal">
            {mailboxes.length}
          </span>
        </SectionHeader>
        {!showCreate && (
          <button
            type="button"
            onClick={() => { setShowCreate(true) }}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-tundra-lichen-600"
          >
            + Create mailbox
          </button>
        )}
      </div>

      {showCreate && (
        <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-5 space-y-4 mb-4">
          <p className="text-sm font-medium text-tundra-ink">New mailbox</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-tundra-ink-500">
                Local part <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center rounded-lg border border-tundra-ink-200 bg-white overflow-hidden focus-within:border-tundra-lichen">
                <input
                  type="text"
                  value={newMb.local_part}
                  onChange={(e) => { setMb('local_part', e.target.value) }}
                  placeholder="john"
                  className="flex-1 px-3 py-2 text-sm text-tundra-ink placeholder:text-tundra-ink-300 bg-transparent focus:outline-none"
                />
                <span className="pr-3 text-xs text-tundra-ink-400 select-none">
                  @{mailDomain.domain}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-tundra-ink-500">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newMb.password}
                  onChange={(e) => { setMb('password', e.target.value) }}
                  placeholder="Password"
                  className="flex-1 min-w-0 rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 font-mono text-sm text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { setMb('password', generatePassword()) }}
                  title="Generate password"
                  className="shrink-0 rounded-lg border border-tundra-ink-200 bg-white px-2.5 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors"
                >
                  ⟳
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-tundra-ink-500">Quota</label>
              <select
                value={newMb.quota_bytes}
                onChange={(e) => { setMb('quota_bytes', Number(e.target.value)) }}
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm text-tundra-ink focus:border-tundra-lichen focus:outline-none"
              >
                {QUOTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewMb({ local_part: '', password: '', quota_bytes: 0 }) }}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!newMb.local_part || !newMb.password || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-tundra-lichen-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMut.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton />
      ) : mailboxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tundra-ink-200 p-10 text-center">
          <p className="text-sm text-tundra-ink-400">No mailboxes yet.</p>
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs font-medium text-tundra-lichen hover:underline"
            >
              Create first mailbox →
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">Address</th>
                <th className="px-4 py-3 text-left">Quota</th>
                <th className="px-4 py-3 text-left">Used</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {mailboxes.map((m) => {
                const pct =
                  m.quota_bytes > 0 ? Math.min(100, Math.round((m.used_bytes / m.quota_bytes) * 100)) : 0
                const isResetting = resetId === m.id
                const isConfirmingDelete = confirmDeleteId === m.id

                return (
                  <tr key={m.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-tundra-ink">
                      {m.local_part}@{mailDomain.domain}
                    </td>
                    <td className="px-4 py-3 text-xs text-tundra-ink-500">
                      {fmtBytes(m.quota_bytes)}
                    </td>
                    <td className="px-4 py-3">
                      {m.quota_bytes > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-tundra-ink-100">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-400' : 'bg-tundra-lichen'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-tundra-ink-400">{pct}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-tundra-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={m.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      {isResetting ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={resetPw}
                              onChange={(e) => { setResetPw(e.target.value) }}
                              placeholder="New password"
                              className="w-36 rounded border border-tundra-ink-200 bg-white px-2 py-1 font-mono text-xs text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => { setResetPw(generatePassword()) }}
                              title="Generate"
                              className="rounded border border-tundra-ink-200 px-2 py-1 text-xs text-tundra-ink-400 hover:bg-tundra-ink-50"
                            >
                              ⟳
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={!resetPw || resetPwMut.isPending}
                            onClick={() => { resetPwMut.mutate({ id: m.id, password: resetPw }) }}
                            className="rounded border border-tundra-lichen-300 bg-tundra-lichen-50 px-2.5 py-1 text-xs font-medium text-tundra-lichen-700 hover:bg-tundra-lichen-100 disabled:opacity-50"
                          >
                            {resetPwMut.isPending ? '…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setResetId(null); setResetPw('') }}
                            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs text-tundra-ink-400 hover:bg-tundra-ink-50"
                          >
                            ✕
                          </button>
                        </div>
                      ) : isConfirmingDelete ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-red-600">Delete mailbox?</span>
                          <button
                            type="button"
                            disabled={deleteMut.isPending}
                            onClick={() => { deleteMut.mutate(m.id) }}
                            className="rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deleteMut.isPending ? '…' : 'Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmDeleteId(null) }}
                            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs text-tundra-ink-400 hover:bg-tundra-ink-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setResetId(m.id); setResetPw(''); setConfirmDeleteId(null) }}
                            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors"
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmDeleteId(m.id); setResetId(null) }}
                            className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
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

// ─── aliases section ─────────────────────────────────────────────────────────

interface AliasesSectionProps {
  mailDomain: MailDomain
}

function AliasesSection({ mailDomain }: AliasesSectionProps) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newAlias, setNewAlias] = useState({ source: '', destinations: '' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: aliasesData, isLoading } = useQuery({
    queryKey: ['mail-aliases', mailDomain.id],
    queryFn: () => api<ListResponse<Alias>>(`/mail/domains/${mailDomain.id}/aliases`),
  })
  const aliases = aliasesData?.data ?? []

  const createMut = useMutation({
    mutationFn: () =>
      api<Alias>('/mail/aliases', {
        method: 'POST',
        body: {
          mail_domain_id: mailDomain.id,
          source: newAlias.source,
          destinations: newAlias.destinations
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail-aliases', mailDomain.id] })
      toast.success(`Alias ${newAlias.source}@${mailDomain.domain} created`)
      setShowCreate(false)
      setNewAlias({ source: '', destinations: '' })
    },
    onError: () => toast.error('Failed to create alias'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api(`/mail/aliases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail-aliases', mailDomain.id] })
      toast.success('Alias deleted')
      setConfirmDeleteId(null)
    },
    onError: () => toast.error('Failed to delete alias'),
  })

  const setAl = (k: keyof typeof newAlias, v: string) => { setNewAlias((f) => ({ ...f, [k]: v })) }

  const destinationsValid =
    newAlias.destinations
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean).length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeader>
          Aliases
          <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs font-medium text-tundra-ink-500 normal-case tracking-normal">
            {aliases.length}
          </span>
        </SectionHeader>
        {!showCreate && (
          <button
            type="button"
            onClick={() => { setShowCreate(true) }}
            className="rounded-lg bg-tundra-lichen px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-tundra-lichen-600"
          >
            + Create alias
          </button>
        )}
      </div>

      {showCreate && (
        <div className="rounded-xl border border-tundra-ink-200 bg-tundra-ink-50/50 p-5 space-y-4 mb-4">
          <p className="text-sm font-medium text-tundra-ink">New alias</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-tundra-ink-500">
                Source address <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center rounded-lg border border-tundra-ink-200 bg-white overflow-hidden focus-within:border-tundra-lichen">
                <input
                  type="text"
                  value={newAlias.source}
                  onChange={(e) => { setAl('source', e.target.value) }}
                  placeholder="info"
                  className="flex-1 px-3 py-2 text-sm text-tundra-ink placeholder:text-tundra-ink-300 bg-transparent focus:outline-none"
                />
                <span className="pr-3 text-xs text-tundra-ink-400 select-none">
                  @{mailDomain.domain}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-tundra-ink-500">
                Destinations <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newAlias.destinations}
                onChange={(e) => { setAl('destinations', e.target.value) }}
                placeholder="user@example.com, other@example.com"
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm text-tundra-ink placeholder:text-tundra-ink-300 focus:border-tundra-lichen focus:outline-none"
              />
              <p className="text-[10px] text-tundra-ink-400">Separate multiple addresses with commas</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewAlias({ source: '', destinations: '' }) }}
              className="rounded-lg border border-tundra-ink-200 px-4 py-2 text-sm text-tundra-ink-500 hover:bg-tundra-ink-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!newAlias.source || !destinationsValid || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="rounded-lg bg-tundra-lichen px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-tundra-lichen-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMut.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton />
      ) : aliases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tundra-ink-200 p-10 text-center">
          <p className="text-sm text-tundra-ink-400">No aliases yet.</p>
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-3 text-xs font-medium text-tundra-lichen hover:underline"
            >
              Create first alias →
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-tundra-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-tundra-ink-100 bg-tundra-ink-50 text-xs font-semibold uppercase tracking-wide text-tundra-ink-400">
              <tr>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tundra-ink-100">
              {aliases.map((a) => {
                const isConfirmingDelete = confirmDeleteId === a.id
                return (
                  <tr key={a.id} className="hover:bg-tundra-ink-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-tundra-ink">
                      {a.source}@{mailDomain.domain}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {a.destinations.map((d) => (
                          <span
                            key={d}
                            className="inline-block rounded border border-tundra-ink-100 bg-tundra-ink-50 px-1.5 py-0.5 font-mono text-xs text-tundra-ink-600"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={a.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      {isConfirmingDelete ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-red-600">Delete alias?</span>
                          <button
                            type="button"
                            disabled={deleteMut.isPending}
                            onClick={() => deleteMut.mutate(a.id)}
                            className="rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deleteMut.isPending ? '…' : 'Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-tundra-ink-200 px-2.5 py-1 text-xs text-tundra-ink-400 hover:bg-tundra-ink-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(a.id)}
                            className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
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

// ─── root tab component ───────────────────────────────────────────────────────

function SiteEmailTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState<'mailboxes' | 'aliases'>('mailboxes')

  const { data: site } = useQuery({
    queryKey: ['sites', siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  })

  const primaryDomain = site?.primary_domain

  const { data: mailDomainsData, isLoading: mdLoading } = useQuery({
    queryKey: ['mail-domains', primaryDomain],
    queryFn: () =>
      api<ListResponse<MailDomain>>(`/mail/domains?apex=${encodeURIComponent(primaryDomain!)}`, {}),
    enabled: !!primaryDomain,
  })

  const mailDomain = mailDomainsData?.data[0] ?? null

  const deleteDomainMut = useMutation({
    mutationFn: () => api(`/mail/domains/${mailDomain!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mail-domains', primaryDomain] })
      toast.success('Mail domain removed')
    },
    onError: () => toast.error('Failed to remove mail domain'),
  })

  if (mdLoading) {
    return (
      <div className="space-y-4">
        <Skeleton />
      </div>
    )
  }

  if (!mailDomain) {
    return (
      <div className="space-y-6">
        <MailDomainSetup
          primaryDomain={primaryDomain}
          onCreated={() => void qc.invalidateQueries({ queryKey: ['mail-domains', primaryDomain] })}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Mail domain status */}
      <MailDomainCard
        mailDomain={mailDomain}
        onDelete={() => deleteDomainMut.mutate()}
        isDeleting={deleteDomainMut.isPending}
      />

      {/* Sub-tabs */}
      <div>
        <div className="flex gap-0.5 border-b border-tundra-ink-200 mb-4">
          {(['mailboxes', 'aliases'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSubTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                subTab === t
                  ? 'border-tundra-lichen text-tundra-lichen-700'
                  : 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {subTab === 'mailboxes' && <MailboxesSection mailDomain={mailDomain} />}
        {subTab === 'aliases' && <AliasesSection mailDomain={mailDomain} />}
      </div>
    </div>
  )
}
