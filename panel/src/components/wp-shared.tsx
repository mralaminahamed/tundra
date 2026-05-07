// Shared types and components for the WordPress detail sub-routes.
import { Switch } from '@/components/ui/switch'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WpInstallation {
  id: string
  site_id: string
  wp_version: string | null
  php_version: string | null    // not yet in API; reserved for future
  wp_path: string
  db_name: string | null
  db_user: string | null
  db_host: string | null
  db_prefix: string | null
  admin_email: string | null
  admin_user: string | null
  site_title: string | null
  site_url: string | null
  multisite: boolean
  ssl_active: boolean | null    // not yet in API; reserved for future
  disk_usage_mb: number | null  // not yet in API; reserved for future
  state: 'provisioning' | 'active' | 'error' | 'removing'
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface WpPlugin {
  id: number
  slug: string
  name: string
  version: string | null
  author: string | null
  description: string | null
  active: boolean
  update_available: boolean
  new_version: string | null
}

export interface WpTheme {
  id: number
  slug: string
  name: string
  version: string | null
  author: string | null
  description: string | null
  active: boolean
  update_available: boolean
  new_version: string | null
  screenshot_url: string | null
}

export interface WpUser {
  ID: number
  user_login: string
  user_email: string
  display_name: string
  user_registered: string
  roles: string
}

export interface WpBackup {
  id: string
  created_at: string
  size_bytes: number | null
  type: 'manual' | 'scheduled'
  status: 'complete' | 'running' | 'failed'
  note: string | null
}

// ── Shared components ─────────────────────────────────────────────────────────

export function StatePill({ state }: { state: WpInstallation['state'] }) {
  const map: Record<string, string> = {
    provisioning: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',
    active:       'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',
    error:        'border-red-300 bg-red-50 text-red-800',
    removing:     'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',
  }
  const dot: Record<string, string> = {
    provisioning: 'bg-tundra-aurora animate-pulse',
    active:       'bg-tundra-lichen',
    error:        'bg-red-500',
    removing:     'bg-tundra-ink-300',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[state] ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[state] ?? ''}`} />
      {state}
    </span>
  )
}

export function UpdateBadge({ newVersion }: { newVersion: string }) {
  return (
    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
      {newVersion} available
    </span>
  )
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-tundra-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs text-tundra-ink-400">{description}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export function SitePreview({ url }: { url: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-tundra-ink-200">
      <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 truncate rounded-md border border-tundra-ink-200 bg-white px-3 py-1 text-xs text-tundra-ink-500">
          {url ?? 'https://example.com'}
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-xs text-tundra-aurora hover:underline">
            Open ↗
          </a>
        )}
      </div>
      <div className="relative flex h-52 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="flex items-center gap-2 bg-[#23282d] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#00b9eb">
              <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.5 14.5l-3-8.5c.5.1.9.1 1.3.1.5 0 1-.05 1-.05l1.2 3.5 1.3-3.6c.5.05.9.1 1.4.1.1 0 .2 0 .3-.01l-3 8.5-1.5-.05z"/>
            </svg>
            <span className="text-[10px] text-gray-400">WordPress</span>
          </div>
          <div className="ml-2 flex gap-3">
            {['Dashboard', 'Posts', 'Pages', 'Appearance', 'Plugins'].map((item) => (
              <span key={item} className="text-[10px] text-gray-500">{item}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white/60">
          <div className="text-center">
            <div className="mx-auto mb-2 h-6 w-36 rounded bg-tundra-ink-100" />
            <div className="mx-auto h-3 w-24 rounded bg-tundra-ink-50" />
          </div>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#21759B] px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#1a6284]">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Website
            </a>
          ) : (
            <span className="text-xs text-tundra-ink-400">No site URL configured</span>
          )}
        </div>
      </div>
    </div>
  )
}
