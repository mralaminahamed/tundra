import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Toggle, CardSection } from '@/components/site-shared'
import { LoadingIcon } from '@/components/icons'

export const Route = createFileRoute('/_auth/wordpress/$installId/security')({
  component: WpSecurityTab,
})

interface WpSettings {
  search_indexing: boolean
  debug_mode: boolean
  wp_cron: boolean
  file_editing_disabled: boolean
}

interface ScanResult {
  type: string
  ok: boolean
  message: string
}

const SCAN_ITEMS = [
  {
    id: 'integrity',
    label: 'File Integrity Check',
    desc: 'Verify core files against WordPress.org checksums',
    icon: (
      <svg className="h-4 w-4 text-tundra-lichen-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    id: 'users',
    label: 'Admin Accounts',
    desc: 'Detect accounts with unexpected admin privileges',
    icon: (
      <svg className="h-4 w-4 text-tundra-lichen-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: null,
    label: 'Malware Scan',
    desc: 'Scan PHP files for malicious code',
    icon: (
      <svg className="h-4 w-4 text-tundra-ink-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    id: null,
    label: 'Brute Force Log',
    desc: 'Review failed login attempts and blocked IPs',
    icon: (
      <svg className="h-4 w-4 text-tundra-ink-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
]

function WpSecurityTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()

  const [maintenance, setMaintenance] = useState(false)
  const [searchIndexing, setSearchIndexing] = useState(true)
  const [debugMode, setDebugMode] = useState(false)
  const [wpCron, setWpCron] = useState(true)
  const [fileEditingDisabled, setFileEditingDisabled] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [activeScan, setActiveScan] = useState<string | null>(null)

  const { data: settings, isLoading: settingsLoading } = useQuery<WpSettings>({
    queryKey: ['wp-settings', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/settings`, { credentials: 'include' })
        .then((r) => r.json()),
  })

  useEffect(() => {
    if (!settings) return
    setSearchIndexing(settings.search_indexing)
    setDebugMode(settings.debug_mode)
    setWpCron(settings.wp_cron)
    setFileEditingDisabled(settings.file_editing_disabled)
  }, [settings])

  const settingsMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/wordpress/installations/${installId}/settings`, {
        method: 'PATCH',
        body,
      }) as Promise<{ applied: string[]; errors: string[] }>,
    onSuccess: (data) => {
      if (data.errors.length > 0) toast.error(`Failed: ${data.errors[0]}`)
      else { toast.success('Saved'); void qc.invalidateQueries({ queryKey: ['wp-settings', installId] }) }
    },
    onError: () => toast.error('Failed to save'),
  })

  const scanMut = useMutation({
    mutationFn: (scanType: string) => {
      setActiveScan(scanType)
      return fetch(`/api/v1/wordpress/installations/${installId}/security/scan/${scanType}`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json() as Promise<{ ok: boolean; result: unknown; scan_type: string }>)
    },
    onSuccess: (data) => {
      setActiveScan(null)
      const msg = typeof data.result === 'string'
        ? data.result
        : Array.isArray(data.result)
          ? data.result.map((u: Record<string, string>) =>
              `${u.user_login} (${u.user_email}) — ID ${u.ID}`
            ).join('\n')
          : JSON.stringify(data.result, null, 2)
      setScanResult({ type: data.scan_type, ok: data.ok, message: msg })
      if (data.ok) toast.success('Scan complete — no issues found')
      else toast.warning('Scan complete — issues detected')
    },
    onError: () => { setActiveScan(null); toast.error('Scan failed') },
  })

  const isPending = settingsMut.isPending

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-tundra-ink-400">
        <LoadingIcon size={18} className="animate-spin mr-2" /> Loading settings…
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Left column ───────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <CardSection title="Site Visibility & Access">
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle
              label="Search Engine Indexing"
              description="Allow search engines to crawl and index this site"
              checked={searchIndexing}
              onChange={(v) => { setSearchIndexing(v); settingsMut.mutate({ search_indexing: v }) }}
              disabled={isPending}
            />
            <Toggle
              label="Maintenance Mode"
              description="Show a maintenance page to visitors while you work"
              checked={maintenance}
              onChange={(v) => { setMaintenance(v); settingsMut.mutate({ maintenance_mode: v }) }}
              disabled={isPending}
            />
            <Toggle
              label="Disable File Editing"
              description="Remove the theme/plugin editor from WordPress admin (recommended)"
              checked={fileEditingDisabled}
              onChange={(v) => { setFileEditingDisabled(v); settingsMut.mutate({ file_editing_disabled: v }) }}
              disabled={isPending}
              badge={
                fileEditingDisabled ? (
                  <span className="rounded-full bg-tundra-lichen-100 px-1.5 py-0.5 text-[10px] font-medium text-tundra-lichen-700">enabled</span>
                ) : (
                  <span className="rounded-full bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">recommended</span>
                )
              }
            />
          </div>
        </CardSection>

        <CardSection title="Developer">
          <div className="divide-y divide-tundra-ink-100 px-4">
            <Toggle
              label="WordPress Debug Mode"
              description="Enable WP_DEBUG — development environments only"
              checked={debugMode}
              onChange={(v) => { setDebugMode(v); settingsMut.mutate({ debug_mode: v }) }}
              disabled={isPending}
              badge={
                debugMode ? (
                  <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">active</span>
                ) : undefined
              }
            />
            <Toggle
              label="WP-Cron"
              description="Built-in scheduler — disable if using real system cron"
              checked={wpCron}
              onChange={(v) => { setWpCron(v); settingsMut.mutate({ wp_cron: v }) }}
              disabled={isPending}
            />
          </div>
        </CardSection>

        {/* SSL quick-link */}
        <Link
          to="/sites/$siteId/ssl"
          params={{ siteId: '' }}
          className="flex items-center justify-between rounded-xl border border-tundra-ink-200 bg-white px-4 py-3 hover:bg-tundra-ink-50 transition-colors"
          onClick={(e) => { e.preventDefault(); toast.info('Navigate to the SSL tab to manage certificates') }}
        >
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4 text-tundra-lichen-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-tundra-ink">SSL Certificate</p>
              <p className="text-xs text-tundra-ink-400">Manage HTTPS, renew certificates</p>
            </div>
          </div>
          <svg className="h-4 w-4 text-tundra-ink-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>

      {/* ── Right column ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <CardSection title="Security Scans">
          <div className="divide-y divide-tundra-ink-100">
            {SCAN_ITEMS.map(({ id, label, desc, icon }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-start gap-3">
                  {icon}
                  <div>
                    <p className="text-sm font-medium text-tundra-ink">{label}</p>
                    <p className="text-xs text-tundra-ink-400">{desc}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={scanMut.isPending || !id}
                  onClick={() => id ? scanMut.mutate(id) : toast.info(`${label} coming soon`)}
                  className="shrink-0 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50"
                >
                  {activeScan === id && scanMut.isPending ? (
                    <LoadingIcon size={12} className="animate-spin" />
                  ) : id ? 'Scan' : 'Soon'}
                </button>
              </div>
            ))}
          </div>
        </CardSection>

        {scanResult && (
          <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
            <div className="flex items-center justify-between border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${scanResult.ok ? 'bg-tundra-lichen' : 'bg-yellow-400'}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
                  {scanResult.type} — {scanResult.ok ? 'clean' : 'issues found'}
                </span>
              </div>
              <button type="button" onClick={() => setScanResult(null)} className="text-tundra-ink-300 hover:text-tundra-ink transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="max-h-52 overflow-auto p-4 text-xs text-tundra-ink font-mono whitespace-pre-wrap leading-relaxed">
              {scanResult.message || 'No output'}
            </pre>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Security Checklist</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'File editor disabled', ok: fileEditingDisabled },
              { label: 'Debug mode off',        ok: !debugMode },
              { label: 'Search indexing on',    ok: searchIndexing },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-tundra-ink">{label}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${ok ? 'text-tundra-lichen-700' : 'text-yellow-700'}`}>
                  {ok ? (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01" /></svg>
                  )}
                  {ok ? 'OK' : 'Check'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
