import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Toggle, type WpInstallation } from '@/components/wp-shared'

export const Route = createFileRoute('/_auth/wordpress/$installId/settings')({
  component: WpSettingsTab,
})

function WpSettingsTab() {
  const { installId } = Route.useParams()

  const { data: install } = useQuery<WpInstallation>({
    queryKey: ['wp-installation', installId],
    queryFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}`).then((r) => r.json()),
  })

  const [coreUpdates, setCoreUpdates] = useState<'disabled' | 'minor' | 'all'>('minor')
  const [pluginUpdates, setPluginUpdates] = useState(false)
  const [themeUpdates, setThemeUpdates] = useState(false)
  const [wpCron, setWpCron] = useState(true)
  const [phpVersion, setPhpVersion] = useState(install?.php_version ?? '8.2')

  const settingsMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/v1/wordpress/installations/${installId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      }).then((r) => r.json() as Promise<{ applied: string[]; errors: string[] }>),
    onSuccess: (data) => {
      if (data.errors.length > 0) {
        toast.error(`Setting failed: ${data.errors[0]}`)
      } else {
        toast.success('Saved')
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
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">PHP Version</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-1">
              {['8.0', '8.1', '8.2', '8.3'].map((v) => (
                <button key={v} type="button" onClick={() => { setPhpVersion(v) }}
                  className={`rounded-lg border py-2 text-sm font-mono font-medium transition-colors ${
                    phpVersion === v
                      ? 'border-tundra-lichen bg-tundra-lichen text-white'
                      : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen'
                  }`}>
                  PHP {v}
                </button>
              ))}
            </div>
            <button type="button"
              onClick={() => toast.info('PHP version change requires system-level provisioning')}
              className="w-full rounded-lg border border-tundra-ink-200 py-2 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
              Apply PHP {phpVersion}
            </button>
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
              { label: 'Install Path', value: install.wp_path, mono: true },
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

function WpTools({ installId }: { installId: string }) {
  const flushMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      }),
    onSuccess: () => toast.success('Flush queued'),
    onError:   () => toast.error('Failed'),
  })

  const verifyMut = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/wordpress/installations/${installId}/core/verify`, {
        method: 'POST',
        credentials: 'include',
      }).then((r) => r.json() as Promise<{ ok: boolean; message: string }>),
    onSuccess: (d) => {
      if (d.ok) toast.success('Core files verified — no issues found')
      else      toast.error(`Integrity issue: ${d.message}`)
    },
    onError: () => toast.error('Verification failed'),
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
          onClick={() => {
            // wp rewrite flush via search-replace stub — real impl would call wp rewrite flush
            toast.info('Flush rewrite rules — coming soon')
          }} />
        <ToolRow label="Regenerate Salts"    desc="Refresh wp-config.php auth keys and salts"
          action="Regenerate" onClick={() => toast.info('Regenerate salts coming soon')} />
        <ToolRow label="Clear Object Cache"  desc="Flush Redis / Memcached object cache"
          action="Clear"      onClick={() => toast.info('Clear cache coming soon')} />
        <ToolRow label="Export wp-config.php" desc="Download a sanitized copy"
          action="Export"     onClick={() => toast.info('Export coming soon')} />
      </div>
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
