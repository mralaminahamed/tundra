import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Toggle, type WpInstallation } from '@/lib/wp-shared'

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

  const patchSetting = (key: string, value: unknown) => {
    void api(`/wordpress/installations/${installId}/settings`, {
      method: 'PATCH',
      body: { [key]: value },
    }).catch(() => null)
  }

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
                    onClick={() => { setCoreUpdates(v); patchSetting('core_auto_update', v) }}
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
                checked={pluginUpdates} onChange={(v) => { setPluginUpdates(v); patchSetting('plugin_auto_update', v) }} />
              <Toggle label="Theme Auto-Updates" description="Automatically update all themes"
                checked={themeUpdates} onChange={(v) => { setThemeUpdates(v); patchSetting('theme_auto_update', v) }} />
              <Toggle label="WP-Cron (built-in scheduler)" description="Disable if using real system cron"
                checked={wpCron} onChange={(v) => { setWpCron(v); patchSetting('wp_cron', v) }} />
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
              onClick={() => { patchSetting('php_version', phpVersion); toast.success('PHP version queued for update') }}
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

        <div className="overflow-hidden rounded-xl border border-tundra-ink-200 bg-white">
          <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Tools</span>
          </div>
          <div className="divide-y divide-tundra-ink-100">
            {[
              { label: 'WP-CLI Console',      desc: 'Run WP-CLI commands interactively',         action: 'Open' },
              { label: 'Regenerate Salts',    desc: 'Refresh wp-config.php auth keys and salts', action: 'Regenerate' },
              { label: 'Flush Rewrite Rules', desc: 'Rebuild permalink structure',               action: 'Flush' },
              { label: 'Clear Object Cache',  desc: 'Flush Redis / Memcached object cache',      action: 'Clear' },
              { label: 'Export wp-config.php', desc: 'Download a sanitized copy',               action: 'Export' },
            ].map(({ label, desc, action }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-tundra-ink">{label}</p>
                  <p className="text-xs text-tundra-ink-400">{desc}</p>
                </div>
                <button type="button" onClick={() => toast.info(`${label} coming soon`)}
                  className="shrink-0 rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 transition-colors">
                  {action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
