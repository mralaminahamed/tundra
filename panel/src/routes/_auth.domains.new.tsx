import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Domain } from '@/lib/api-types'
import { ShieldIcon, GlobeIcon, ClipboardIcon } from '@/components/icons'

export const Route = createFileRoute('/_auth/domains/new')({
  component: AddDomainPage,
})

const DNS_OPTIONS: {
  value: Domain['dns_managed_by']
  label: string
  desc: string
  icon: ReactNode
  color: string
}[] = [
  {
    value: 'tundra',
    label: 'Tundra DNS',
    desc: 'Tundra manages the DNS zone. Full record editor, templates, and automatic propagation.',
    icon: <ShieldIcon size={22} />,
    color: 'border-tundra-lichen ring-tundra-lichen bg-tundra-lichen/5',
  },
  {
    value: 'external',
    label: 'External DNS',
    desc: 'DNS hosted elsewhere (Cloudflare, Route 53, etc.). Records in Tundra are informational.',
    icon: <GlobeIcon size={22} />,
    color: 'border-tundra-aurora ring-tundra-aurora bg-tundra-aurora/5',
  },
  {
    value: 'registrar',
    label: 'Registrar DNS',
    desc: 'DNS managed at your domain registrar. Tundra tracks registration details only.',
    icon: <ClipboardIcon size={22} />,
    color: 'border-tundra-ink-400 ring-tundra-ink-300 bg-tundra-ink-50',
  },
]

function AddDomainPage() {
  const router = useRouter()
  const [apex,         setApex]         = useState('')
  const [dnsManagedBy, setDnsManagedBy] = useState<Domain['dns_managed_by']>('tundra')
  const [autoRenew,    setAutoRenew]    = useState(true)
  const [notes,        setNotes]        = useState('')
  const [expires,      setExpires]      = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Simple apex validation
  const apexClean = apex.trim().toLowerCase()
  const apexValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(apexClean)
  const showApexError = apexClean.length > 3 && !apexValid

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!apexValid) return
    setError(null)
    setLoading(true)
    try {
      const domain = await api<Domain>('/domains', {
        method: 'POST',
        body: {
          apex: apexClean,
          dns_managed_by: dnsManagedBy,
          auto_renew: autoRenew,
          notes: notes.trim() || null,
          registration_expires_at: expires ? `${expires}T00:00:00Z` : null,
        },
      })
      toast.success(`${domain.apex} added`)
      void router.navigate({ to: '/domains/$domainId', params: { domainId: domain.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setLoading(false)
    }
  }

  const selectedOpt = DNS_OPTIONS.find((o) => o.value === dnsManagedBy)!

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-tundra-ink-400">
        <Link to="/domains" className="hover:text-tundra-ink transition-colors">Domains</Link>
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        <span className="text-tundra-ink font-medium">Add domain</span>
      </div>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-tundra-ink">Add domain</h1>
        <p className="mt-1 text-sm text-tundra-ink-500">Register an apex domain for DNS management, registration tracking, or both.</p>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">

        {/* ── Domain name ── */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="flex items-center gap-3 border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-tundra-lichen text-sm text-white font-bold">1</div>
            <div>
              <p className="text-sm font-semibold text-tundra-ink">Domain name</p>
              <p className="text-xs text-tundra-ink-400">Enter the apex (root) domain — no www or subdomains</p>
            </div>
          </div>
          <div className="p-5">
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <svg className="h-4 w-4 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
                </svg>
              </div>
              <input
                required
                type="text"
                value={apex}
                onChange={(e) => { setApex(e.target.value) }}
                placeholder="example.com"
                className={`w-full rounded-lg border pl-9 pr-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-1 ${
                  showApexError
                    ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-300'
                    : apexClean && apexValid
                    ? 'border-tundra-lichen bg-tundra-lichen/5 focus:border-tundra-lichen focus:ring-tundra-lichen'
                    : 'border-tundra-ink-200 bg-white focus:border-tundra-lichen focus:ring-tundra-lichen'
                }`}
              />
              {apexClean && apexValid && (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 text-tundra-lichen" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                </div>
              )}
            </div>
            {showApexError && (
              <p className="mt-1.5 text-xs text-red-600">Enter a valid apex domain (e.g. example.com)</p>
            )}
          </div>
        </div>

        {/* ── DNS management ── */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="flex items-center gap-3 border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-tundra-lichen text-sm text-white font-bold">2</div>
            <div>
              <p className="text-sm font-semibold text-tundra-ink">DNS management</p>
              <p className="text-xs text-tundra-ink-400">Where will DNS records for this domain be managed?</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            {DNS_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => { setDnsManagedBy(opt.value) }}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  dnsManagedBy === opt.value
                    ? `${opt.color} ring-1`
                    : 'border-tundra-ink-200 hover:border-tundra-ink-300 bg-white'
                }`}>
                <div className="mb-2">{opt.icon}</div>
                <p className="text-sm font-semibold text-tundra-ink">{opt.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-tundra-ink-500">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Tundra DNS nameserver preview */}
          {dnsManagedBy === 'tundra' && (
            <div className="mx-5 mb-5 rounded-lg border border-tundra-lichen-200 bg-tundra-lichen-50 p-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-medium text-tundra-lichen-800">
                <ShieldIcon size={12} /> Point your registrar to these nameservers after adding:
              </p>
              <div className="flex flex-wrap gap-2">
                {['ns1.tundra.local', 'ns2.tundra.local'].map((ns) => (
                  <span key={ns} className="rounded-md border border-tundra-lichen-200 bg-white px-2.5 py-1 font-mono text-xs text-tundra-ink">{ns}</span>
                ))}
              </div>
            </div>
          )}
          {dnsManagedBy === 'external' && (
            <div className="mx-5 mb-5 rounded-lg border border-tundra-aurora-200 bg-tundra-aurora-50 p-3">
              <p className="flex items-center gap-1 text-xs text-tundra-aurora-800">
                <GlobeIcon size={12} /> DNS is managed at your external provider. Tundra will store records for reference, but they won't be authoritative.
              </p>
            </div>
          )}
          {dnsManagedBy === 'registrar' && (
            <div className="mx-5 mb-5 rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-3">
              <p className="flex items-center gap-1 text-xs text-tundra-ink-600">
                <ClipboardIcon size={12} /> Tundra will track registration details (expiry, auto-renew) only. DNS changes must be made at your registrar.
              </p>
            </div>
          )}
        </div>

        {/* ── Registration details ── */}
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="flex items-center gap-3 border-b border-tundra-ink-100 bg-tundra-ink-50 px-5 py-3.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-tundra-ink-400 text-sm text-white font-bold">3</div>
            <div>
              <p className="text-sm font-semibold text-tundra-ink">Registration <span className="font-normal text-tundra-ink-400">(optional)</span></p>
              <p className="text-xs text-tundra-ink-400">Track expiry and renewal for this domain</p>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Expiry date</label>
              <input type="date" value={expires} onChange={(e) => { setExpires(e.target.value) }}
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={autoRenew} onChange={(e) => { setAutoRenew(e.target.checked) }}
                  className="h-4 w-4 rounded accent-tundra-lichen" />
                <span className="text-sm text-tundra-ink-600">Auto-renew registration</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-tundra-ink-600">Notes</label>
              <input type="text" value={notes} onChange={(e) => { setNotes(e.target.value) }}
                placeholder="e.g. Client domain, expires soon…"
                className="w-full rounded-lg border border-tundra-ink-200 bg-white px-3 py-2 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen" />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Summary + actions */}
        {apexClean && apexValid && (
          <div className="rounded-xl border border-tundra-ink-100 bg-tundra-ink-50 px-4 py-3">
            <p className="text-xs text-tundra-ink-500">
              Adding <span className="font-mono font-semibold text-tundra-ink">{apexClean}</span> with <span className="font-medium text-tundra-ink">{selectedOpt.label}</span>
              {expires && <>, expires <span className="font-medium text-tundra-ink">{expires}</span></>}
              {autoRenew && <> · auto-renew on</>}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={!apexClean || !apexValid || loading}
            className="rounded-lg bg-tundra-lichen px-6 py-2.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors">
            {loading ? 'Adding…' : 'Add domain'}
          </button>
          <Link to="/domains"
            className="rounded-lg border border-tundra-ink-200 px-5 py-2.5 text-sm text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
