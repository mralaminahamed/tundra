import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Toggle } from '@/components/site-shared'

export const Route = createFileRoute('/_auth/sites/$siteId/ssl')({
  component: SiteSslTab,
})

interface SslData {
  issuer: string
  expires: string
  algorithm: string
  sans_count: number
  days_remaining: number
  force_https: boolean
  hsts_enabled: boolean
}

function SiteSslTab() {
  const { siteId } = Route.useParams()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites', siteId, 'ssl'],
    queryFn: () => api<SslData>(`/sites/${siteId}/ssl`),
    retry: false,
  })

  // Optimistic local state for toggles — initialise from API data when available
  const [forceHttps, setForceHttps] = useState<boolean | null>(null)
  const [hstsEnabled, setHstsEnabled] = useState<boolean | null>(null)

  const effectiveForceHttps = forceHttps ?? data?.force_https ?? true
  const effectiveHsts = hstsEnabled ?? data?.hsts_enabled ?? false

  const settingsMutation = useMutation({
    mutationFn: (patch: { force_https?: boolean; hsts_enabled?: boolean }) =>
      api(`/sites/${siteId}/ssl/settings`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId, 'ssl'] })
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

  function handleRequestCert() {
    toast.info('Certificate provisioning coming soon')
  }

  function handleRenew() {
    toast.info('Certificate renewal coming soon')
  }

  const certDetails = data
    ? [
        { label: 'Issuer',    value: data.issuer },
        { label: 'Expires',   value: data.expires },
        { label: 'Algorithm', value: data.algorithm },
        { label: 'SANs',      value: `${data.sans_count} domain${data.sans_count !== 1 ? 's' : ''}` },
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
          ) : isError || !data ? (
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
              <button type="button" onClick={handleRequestCert}
                className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 transition-colors">
                Request certificate
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-tundra-lichen-200 bg-tundra-lichen-50 p-4">
                <svg className="h-8 w-8 text-tundra-lichen-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <p className="font-semibold text-tundra-lichen-800">Certificate active</p>
                  <p className="text-xs text-tundra-lichen-600">
                    {data.issuer} · Valid for {data.days_remaining} day{data.days_remaining !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {certDetails.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between border-b border-tundra-ink-100 py-2 text-sm last:border-0">
                  <span className="text-tundra-ink-400">{label}</span>
                  <span className="font-medium text-tundra-ink">{value ?? '—'}</span>
                </div>
              ))}

              <div className="pt-1">
                <button type="button" onClick={handleRenew}
                  className="w-full rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                  Renew now
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
