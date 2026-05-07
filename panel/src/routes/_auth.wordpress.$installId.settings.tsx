import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Toggle, type WpInstallation } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/settings')({
  component: WpSettingsTab,
})

function WpSettingsTab() {
  const { installId } = Route.useParams()
  const qc = useQueryClient()

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
  })

  const [coreUpdates, setCoreUpdates] = useState<'disabled' | 'minor' | 'all'>('minor')
  const [pluginUpdates, setPluginUpdates] = useState(false)
  const [themeUpdates, setThemeUpdates] = useState(false)
  const [wpCron, setWpCron] = useState(true)
  const [phpVersion, setPhpVersion] = useState(install?.php_version ?? '8.3')

  const PHP_FALLBACK: string[] = [
    '8.4.7','8.4.6','8.4.5','8.4.4','8.4.3','8.4.2','8.4.1','8.4.0',
    '8.3.21','8.3.20','8.3.19','8.3.18','8.3.17','8.3.16','8.3.15','8.3.14',
    '8.3.13','8.3.12','8.3.11','8.3.10','8.3.9','8.3.8','8.3.7','8.3.6',
    '8.3.5','8.3.4','8.3.3','8.3.2','8.3.1','8.3.0',
    '8.2.28','8.2.27','8.2.26','8.2.25','8.2.24','8.2.23','8.2.22','8.2.21',
    '8.2.20','8.2.19','8.2.18','8.2.17','8.2.16','8.2.15','8.2.14','8.2.13',
    '8.2.12','8.2.11','8.2.10','8.2.9','8.2.8','8.2.7','8.2.6','8.2.5',
    '8.2.4','8.2.3','8.2.2','8.2.1','8.2.0',
    '8.1.31','8.1.30','8.1.29','8.1.28','8.1.27','8.1.26','8.1.25','8.1.24',
    '8.1.23','8.1.22','8.1.21','8.1.20','8.1.19','8.1.18','8.1.17','8.1.16',
    '8.1.15','8.1.14','8.1.13','8.1.12','8.1.11','8.1.10','8.1.9','8.1.8',
    '8.1.7','8.1.6','8.1.5','8.1.4','8.1.3','8.1.2','8.1.1','8.1.0',
    '8.0.30','8.0.29','8.0.28','8.0.27','8.0.26','8.0.25','8.0.24','8.0.23',
    '8.0.22','8.0.21','8.0.20','8.0.19','8.0.18','8.0.17','8.0.16','8.0.15',
    '8.0.14','8.0.13','8.0.12','8.0.11','8.0.10','8.0.9','8.0.8','8.0.7',
    '8.0.6','8.0.5','8.0.4','8.0.3','8.0.2','8.0.1','8.0.0',
    '7.4.33','7.4.32','7.4.31','7.4.30','7.4.29','7.4.28','7.4.27','7.4.26',
    '7.4.25','7.4.24','7.4.23','7.4.22','7.4.21','7.4.20','7.4.19','7.4.16',
    '7.4.15','7.4.14','7.4.13','7.4.12','7.4.11','7.4.10','7.4.9','7.4.8',
    '7.4.7','7.4.6','7.4.5','7.4.4','7.4.3','7.4.2','7.4.1','7.4.0',
  ]

  const sortVersions = (vs: string[]) =>
    vs.filter((v) => /^\d+\.\d+\.\d+$/.test(v)).sort((a, b) => {
      const [aMa = 0, aMi = 0, aP = 0] = a.split('.').map(Number)
      const [bMa = 0, bMi = 0, bP = 0] = b.split('.').map(Number)
      return (bMa - aMa) || (bMi - aMi) || (bP - aP)
    })

  const { data: phpVersions, isLoading: phpLoading } = useQuery<string[]>({
    queryKey: ['php-net-releases'],
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      try {
        const data = await fetch('/api/v1/proxy/php-releases', { credentials: 'include' })
          .then((r) => r.ok ? r.json() as Promise<Record<string, unknown>> : Promise.resolve({}))
        const live = sortVersions(Object.keys(data))
        return live.length >= 10 ? live : sortVersions(PHP_FALLBACK)
      } catch {
        return sortVersions(PHP_FALLBACK)
      }
    },
  })

  // Sync phpVersion state once both install data and version list are loaded
  useEffect(() => {
    const cur = install?.php_version
    if (!cur || !phpVersions?.length) return
    // Full version (X.Y.Z) already in list → select it directly
    if (/^\d+\.\d+\.\d+$/.test(cur) && phpVersions.includes(cur)) {
      setPhpVersion(cur)
      return
    }
    // Major.minor only (X.Y) → find latest patch
    const branch = cur.split('.').slice(0, 2).join('.')
    const latest = phpVersions.find((v) => v.startsWith(branch + '.'))
    if (latest) setPhpVersion(latest)
  }, [install?.php_version, phpVersions])

  const settingsMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/v1/wordpress/installations/${installId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      }).then((r) => r.json() as Promise<{ applied: string[]; errors: string[] }>),
    onSuccess: (data, vars) => {
      if (data.errors.length > 0) {
        toast.error(`Setting failed: ${data.errors[0]}`)
      } else if ('php_version' in vars) {
        toast.success(`PHP ${vars.php_version as string} saved — provisioning started`)
        void qc.invalidateQueries({ queryKey: ['wp-installation', installId] })
      } else {
        toast.success('Saved')
        void qc.invalidateQueries({ queryKey: ['wp-installation', installId] })
      }
    },
    onError: () => toast.error('Failed to save setting'),
  })

  if (!install) return null

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Auto-Update Configuration</span>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-tundra-ink">WordPress Core</p>
              <div className="flex gap-1">
                {(['disabled', 'minor', 'all'] as const).map((v) => (
                  <button key={v} type="button"
                    onClick={() => { setCoreUpdates(v); settingsMut.mutate({ core_auto_update: v }) }}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors ${
                      coreUpdates === v
                        ? 'border-tundra-lichen bg-tundra-lichen text-white'
                        : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
                    }`}>
                    {v === 'minor' ? 'Minor only' : v}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-tundra-ink-100">
              <Toggle label="Plugin Auto-Updates" description="Automatically update all plugins"
                checked={pluginUpdates}
                onChange={(v) => { setPluginUpdates(v); settingsMut.mutate({ plugin_auto_update: v }) }}
                disabled={settingsMut.isPending} />
              <Toggle label="Theme Auto-Updates" description="Automatically update all themes"
                checked={themeUpdates}
                onChange={(v) => { setThemeUpdates(v); settingsMut.mutate({ theme_auto_update: v }) }}
                disabled={settingsMut.isPending} />
              <Toggle label="WP-Cron (built-in scheduler)" description="Disable if using real system cron"
                checked={wpCron}
                onChange={(v) => { setWpCron(v); settingsMut.mutate({ wp_cron: v }) }}
                disabled={settingsMut.isPending} />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Version</span>
            {install?.php_version && (
              <span className="text-xs text-tundra-ink-400">
                Current: <span className="font-mono font-medium text-tundra-ink">{install.php_version}</span>
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            <PhpVersionSelect
              versions={phpVersions ?? []}
              loading={phpLoading}
              value={phpVersion}
              onChange={setPhpVersion}
              currentVersion={install?.php_version ?? null}
            />
            <button
              type="button"
              disabled={settingsMut.isPending || !phpVersion || phpVersion === install?.php_version}
              onClick={() => settingsMut.mutate({ php_version: phpVersion })}
              className="w-full rounded-lg bg-tundra-lichen py-2 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
            >
              {settingsMut.isPending ? 'Applying…' : `Apply PHP ${phpVersion}`}
            </button>
            <p className="text-xs text-tundra-ink-400">
              Saves version preference and triggers agent reconciliation — installs PHP via apt if needed, writes FPM pool config, reloads <span className="font-mono">php{phpVersion.split('.').slice(0,2).join('.')}-fpm</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">WordPress Settings</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'Site URL',     value: install.site_url ?? '—' },
              { label: 'WP Version',   value: install.wp_version ?? '—' },
              { label: 'PHP Version',  value: phpVersion },
              { label: 'Install Path', value: install.install_path ?? '—', mono: true },
              { label: 'WP Subpath',   value: install.wp_path, mono: true },
              { label: 'Multisite',    value: install.multisite ? 'Enabled' : 'Disabled' },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
                <span className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-tundra-ink`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <WpTools installId={installId} />
      </div>
    </div>
  )
}

function wpToolPost(installId: string, path: string) {
  return () =>
    fetch(`/api/v1/wordpress/installations/${installId}/tools/${path}`, {
      method: 'POST', credentials: 'include',
    }).then((r) => r.json() as Promise<{ ok: boolean; message: string }>)
}

function WpTools({ installId }: { installId: string }) {
  const verifyMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/core/verify`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json() as Promise<{ ok: boolean; message: string }>),
    onSuccess: (d) => d.ok ? toast.success('Core verified — no issues') : toast.error(`Issue: ${d.message}`),
    onError: () => toast.error('Verification failed'),
  })

  const flushMut = useMutation({
    mutationFn: wpToolPost(installId, 'flush-rewrites'),
    onSuccess: () => toast.success('Rewrite rules flushed'),
    onError:   () => toast.error('Flush failed'),
  })

  const saltsMut = useMutation({
    mutationFn: wpToolPost(installId, 'regenerate-salts'),
    onSuccess: () => toast.success('Auth keys regenerated — all users will be logged out'),
    onError:   () => toast.error('Failed to regenerate salts'),
  })

  const cacheMut = useMutation({
    mutationFn: wpToolPost(installId, 'clear-cache'),
    onSuccess: () => toast.success('Object cache flushed'),
    onError:   () => toast.error('Failed to clear cache'),
  })

  return (
    <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
      <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Tools</span>
      </div>
      <div className="divide-y divide-tundra-ink-100">
        <ToolRow label="Verify Core Integrity" desc="Check core files against WordPress.org checksums"
          action="Verify" isPending={verifyMut.isPending}
          onClick={() => verifyMut.mutate()} />
        <ToolRow label="Flush Rewrite Rules" desc="Rebuild permalink structure"
          action="Flush" isPending={flushMut.isPending}
          onClick={() => flushMut.mutate()} />
        <ToolRow label="Regenerate Salts" desc="Refresh wp-config.php auth keys and salts"
          action="Regenerate" isPending={saltsMut.isPending}
          onClick={() => saltsMut.mutate()} />
        <ToolRow label="Clear Object Cache" desc="Flush Redis / Memcached object cache"
          action="Clear" isPending={cacheMut.isPending}
          onClick={() => cacheMut.mutate()} />
        <ToolRow label="Export wp-config.php" desc="Download a sanitized copy"
          action="Export"
          onClick={() => { window.location.href = `/api/v1/wordpress/installations/${installId}/tools/wp-config` }} />
      </div>
    </div>
  )
}

// ── PHP EOL/support status ────────────────────────────────────────────────────

const PHP_EOL   = new Set(['5.6', '7.0', '7.1', '7.2', '7.3', '7.4', '8.0'])
const PHP_SEC   = new Set(['8.1']) // security fixes only
// 8.2+ = active support

function phpBranchStatus(branch: string): 'active' | 'security' | 'eol' {
  if (PHP_EOL.has(branch))  return 'eol'
  if (PHP_SEC.has(branch))  return 'security'
  return 'active'
}


// Group sorted versions by major.minor
function groupByBranch(versions: string[]): { branch: string; versions: string[] }[] {
  const map = new Map<string, string[]>()
  for (const v of versions) {
    const branch = v.split('.').slice(0, 2).join('.')
    if (!map.has(branch)) map.set(branch, [])
    map.get(branch)!.push(v)
  }
  return [...map.entries()].map(([branch, vs]) => ({ branch, versions: vs }))
}

// ── PhpVersionSelect component ────────────────────────────────────────────────

function PhpVersionSelect({
  versions, loading, value, onChange, currentVersion,
}: {
  versions: string[]
  loading: boolean
  value: string
  onChange: (v: string) => void
  currentVersion: string | null
}) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const portalRef  = useRef<HTMLDivElement>(null)

  // Recompute position on open + scroll/resize
  useEffect(() => {
    if (!open) return
    const update = () => {
      if (triggerRef.current) setDropdownRect(triggerRef.current.getBoundingClientRect())
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !portalRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Flatten filtered list for keyboard nav
  const filtered = query
    ? versions.filter((v) => v.includes(query))
    : versions

  const grouped = groupByBranch(filtered)

  function select(v: string) {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)) }
    if (e.key === 'Enter' && filtered[highlighted]) { select(filtered[highlighted]!); return }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlighted}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  useEffect(() => { setHighlighted(0) }, [query])

  const branch = value.split('.').slice(0, 2).join('.')
  const status = phpBranchStatus(branch)

  // Label shown in trigger
  const triggerLabel = loading
    ? 'Loading…'
    : value
      ? `PHP ${value}${value === currentVersion ? ' ✓' : ''}${filtered.indexOf(value) === 0 && !query ? ' — latest' : ''}`
      : 'Select version'

  let flatIdx = 0

  const dropdown = open && dropdownRect && createPortal(
    <div
      ref={portalRef}
      style={{
        position: 'fixed',
        top: dropdownRect.bottom + 4,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 9999,
      }}
      className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white shadow-xl"
    >
      <div className="border-b border-tundra-ink-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 shrink-0 text-tundra-ink-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search — e.g. 8.3 or 8.3.21"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent font-mono text-xs text-tundra-ink placeholder:text-tundra-ink-300 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-tundra-ink-300 hover:text-tundra-ink">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      </div>
      <div ref={listRef} className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-3 text-xs text-tundra-ink-400">No versions match "{query}"</p>
        ) : (
          grouped.map(({ branch: br, versions: vs }) => {
            const brStatus = phpBranchStatus(br)
            return (
              <div key={br}>
                <div className="sticky top-0 flex items-center justify-between bg-tundra-ink-50 px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-tundra-ink-400">PHP {br}</span>
                  {brStatus !== 'active' && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${brStatus === 'eol' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                      {brStatus === 'eol' ? 'EOL' : 'Security'}
                    </span>
                  )}
                </div>
                {vs.map((v, i) => {
                  const idx = flatIdx++
                  return (
                    <button
                      key={v}
                      type="button"
                      data-idx={idx}
                      onClick={() => select(v)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left font-mono text-sm transition-colors ${
                        idx === highlighted ? 'bg-tundra-lichen-50 text-tundra-lichen' : 'hover:bg-tundra-ink-50 text-tundra-ink'
                      } ${v === value ? 'font-semibold' : ''}`}
                    >
                      <span>{v}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-1.5 text-xs text-tundra-ink-400">
                        {i === 0 && <span className="rounded bg-tundra-lichen-100 px-1.5 py-0.5 text-[10px] font-medium text-tundra-lichen-700">latest</span>}
                        {v === currentVersion && <span className="rounded bg-tundra-aurora-100 px-1.5 py-0.5 text-[10px] font-medium text-tundra-aurora-700">current</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Trigger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 10) }}
          disabled={loading}
          className="flex h-9 w-full items-center justify-between rounded-lg border border-tundra-ink-200 bg-white px-3 font-mono text-sm text-tundra-ink hover:border-tundra-lichen transition-colors disabled:opacity-60 focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
        >
          <span className={value ? 'text-tundra-ink' : 'text-tundra-ink-400'}>{triggerLabel}</span>
          <svg className={`h-4 w-4 shrink-0 text-tundra-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {dropdown}
      </div>

      {/* EOL/security warning for selected branch */}
      {value && status !== 'active' && (
        <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
          status === 'eol' ? 'border-red-200 bg-red-50 text-red-700' : 'border-yellow-200 bg-yellow-50 text-yellow-700'
        }`}>
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {status === 'eol'
            ? `PHP ${branch} is end-of-life — no security fixes.`
            : `PHP ${branch} receives security fixes only.`}
        </div>
      )}
    </div>
  )
}

function ToolRow({ label, desc, action, onClick, isPending = false }: {
  label: string; desc: string; action: string
  onClick: () => void; isPending?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        <p className="text-xs text-tundra-ink-400">{desc}</p>
      </div>
      <button type="button" onClick={onClick} disabled={isPending}
        className="shrink-0 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors disabled:opacity-50">
        {isPending ? '…' : action}
      </button>
    </div>
  )
}
