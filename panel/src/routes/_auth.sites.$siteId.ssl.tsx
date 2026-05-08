import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Toggle } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/ssl')({
  component: SiteSslTab,
})

/** Certificate DTO returned by GET /api/v1/sites/{id}/ssl */
interface CertificateDto {
  id: string
  site_id: string | null
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'failed'
  issuer: string
  common_name: string
  san: string[]
  not_before: string | null
  not_after: string | null
  auto_renew: boolean
  last_renewed_at: string | null
  acme_order_url: string | null
  created_at: string
}

/** Parse an ISO-8601 date string and return a human-readable label + days remaining. */
function parseExpiry(not_after: string | null): { label: string; days: number } | null {
  if (!not_after) return null
  const expires = new Date(not_after)
  const now = new Date()
  const days = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const label = expires.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  return { label, days }
}

function SiteSslTab() {
  const { siteId } = Route.useParams()
  const qc = useQueryClient()

  // Certificate data from the API
  const { data: cert, isLoading, isError } = useQuery({
    queryKey: ['sites', siteId, 'ssl'],
    queryFn: () => api<CertificateDto>(`/sites/${siteId}/ssl`),
    retry: false,
    // Auto-refresh when the certificate is pending so the UI reflects the
    // background ACME task completing.
    refetchInterval: (query) => {
      const d = query.state.data
      const status = d && typeof d === 'object' && 'status' in d ? (d as CertificateDto).status : undefined
      return status === 'pending' ? 3000 : false
    },
  })

  // Request a new certificate
  const requestMut = useMutation({
    mutationFn: () => api<CertificateDto>(`/sites/${siteId}/ssl`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'ssl'] })
      toast.success('Certificate request submitted — provisioning in progress')
    },
    onError: (e: Error) => { toast.error(e.message) },
  })

  // Force-renew an existing certificate
  const renewMut = useMutation({
    mutationFn: () => api<CertificateDto>(`/sites/${siteId}/ssl/renew`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'ssl'] })
      toast.success('Renewal initiated — provisioning in progress')
    },
    onError: (e: Error) => { toast.error(e.message) },
  })

  // Optimistic local state for the HTTPS-settings toggles (settings API not yet implemented)
  const [forceHttps, setForceHttps] = useState<boolean | null>(null)
  const [hstsEnabled, setHstsEnabled] = useState<boolean | null>(null)

  const effectiveForceHttps = forceHttps ?? true
  const effectiveHsts = hstsEnabled ?? false

  const settingsMutation = useMutation({
    mutationFn: (patch: { force_https?: boolean; hsts_enabled?: boolean }) =>
      api(`/sites/${siteId}/ssl/settings`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'ssl'] })
    },
    onError: () => {
      toast.error('Failed to update SSL settings')
    },
  })

  function handleForceHttpsChange(v: boolean) {
    setForceHttps(v)
    toast.promise(
      settingsMutation.mutateAsync({ force_https: v }),
      {
        loading: 'Updating…',
        success: `Force HTTPS ${v ? 'enabled' : 'disabled'}`,
        error: 'Update failed',
      },
    )
  }

  function handleHstsChange(v: boolean) {
    setHstsEnabled(v)
    toast.promise(
      settingsMutation.mutateAsync({ hsts_enabled: v }),
      {
        loading: 'Updating…',
        success: `HSTS ${v ? 'enabled' : 'disabled'}`,
        error: 'Update failed',
      },
    )
  }

  const expiry = parseExpiry(cert?.not_after ?? null)

  const certDetails = cert
    ? [
        { label: 'Issuer',     value: cert.issuer },
        { label: 'Domain',     value: cert.common_name },
        { label: 'Expires',    value: expiry?.label ?? '—' },
        { label: 'SANs',       value: `${String(cert.san.length)} domain${cert.san.length !== 1 ? 's' : ''}` },
        { label: 'Status',     value: cert.status },
      ]
    : []

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Certificate status */}
      <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Certificate</span>
        </div>
        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 rounded-xl bg-tundra-ink-100" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-tundra-ink-100 last:border-0">
                  <div className="h-3 w-16 rounded bg-tundra-ink-100" />
                  <div className="h-3 w-24 rounded bg-tundra-ink-100" />
                </div>
              ))}
            </div>
          ) : isError || !cert ? (
            /* No certificate yet — prompt to request one */
            <>
              <div className="flex items-center gap-3 rounded-xl border border-tundra-ink-200 bg-tundra-ink-50 p-4">
                <svg className="h-8 w-8 text-tundra-ink-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="font-semibold text-tundra-ink-700">SSL not configured</p>
                  <p className="text-xs text-tundra-ink-400">No certificate is provisioned for this site.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={requestMut.isPending}
                onClick={() => { requestMut.mutate() }}
                className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors disabled:opacity-60"
              >
                {requestMut.isPending ? 'Requesting…' : 'Request certificate'}
              </button>
            </>
          ) : cert.status === 'pending' ? (
            /* ACME provisioning in progress */
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <svg className="h-8 w-8 text-amber-500 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-800">Provisioning in progress</p>
                <p className="text-xs text-amber-600">The ACME challenge is being validated. This usually takes under a minute.</p>
              </div>
            </div>
          ) : cert.status === 'failed' ? (
            /* Provisioning failed — show error + retry button */
            <>
              <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <svg className="h-8 w-8 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-red-700">Provisioning failed</p>
                  <p className="text-xs text-red-500">The ACME challenge could not be validated. Check that port 80 is reachable.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={renewMut.isPending}
                onClick={() => { renewMut.mutate() }}
                className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors disabled:opacity-60"
              >
                {renewMut.isPending ? 'Retrying…' : 'Retry provisioning'}
              </button>
            </>
          ) : (
            /* Active / expired certificate details */
            <>
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${
                cert.status === 'active'
                  ? 'border-tundra-lichen-200 bg-tundra-lichen-50'
                  : 'border-amber-200 bg-amber-50'
              }`}>
                <svg className={`h-8 w-8 shrink-0 ${cert.status === 'active' ? 'text-tundra-lichen-600' : 'text-amber-500'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <p className={`font-semibold ${cert.status === 'active' ? 'text-tundra-lichen-800' : 'text-amber-800'}`}>
                    {cert.status === 'active' ? 'Certificate active' : 'Certificate expired'}
                  </p>
                  <p className={`text-xs ${cert.status === 'active' ? 'text-tundra-lichen-600' : 'text-amber-600'}`}>
                    {cert.issuer}
                    {expiry ? ` · ${cert.status === 'active' ? `Valid for ${String(expiry.days)} day${expiry.days !== 1 ? 's' : ''}` : `Expired ${expiry.label}`}` : ''}
                  </p>
                </div>
              </div>

              {certDetails.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between border-b border-tundra-ink-100 py-2 text-sm last:border-0">
                  <span className="text-tundra-ink-400">{label}</span>
                  <span className="font-medium text-tundra-ink">{value}</span>
                </div>
              ))}

              <div className="pt-1">
                <button
                  type="button"
                  disabled={renewMut.isPending}
                  onClick={() => renewMut.mutate()}
                  className="w-full rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-60"
                >
                  {renewMut.isPending ? 'Renewing…' : 'Renew now'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">HTTPS Settings</span>
          </div>
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle label="Force HTTPS" description="Redirect all HTTP traffic to HTTPS automatically"
              checked={effectiveForceHttps} onChange={handleForceHttpsChange} />
            <Toggle label="HSTS" description="Strict Transport Security — instructs browsers to only use HTTPS"
              checked={effectiveHsts} onChange={handleHstsChange} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Custom Certificate</span>
            <span className="ml-auto rounded-full bg-tundra-ink-100 px-2 py-0.5 text-[10px] font-medium text-tundra-ink-500">
              Support request required
            </span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-tundra-ink-400">
              Upload your own certificate and private key to replace the auto-issued Let's Encrypt certificate.
              Custom certificate upload requires a support request.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Certificate (PEM)</label>
              <textarea rows={3} placeholder="-----BEGIN CERTIFICATE-----"
                className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tundra-ink-500">Private Key (PEM)</label>
              <textarea rows={3} placeholder="-----BEGIN PRIVATE KEY-----"
                className="w-full resize-none rounded-lg border border-tundra-ink-200 px-3 py-2 font-mono text-xs focus:border-tundra-lichen focus:outline-none" />
            </div>
            <button type="button" onClick={() => toast.info('Custom certificate upload requires a support request')}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
              Install certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
