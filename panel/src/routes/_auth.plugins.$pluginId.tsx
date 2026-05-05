import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { PluginLogo } from '../components/plugin-logo'

export const Route = createFileRoute('/_auth/plugins/$pluginId')({
  component: PluginDetailPage,
})

// time::OffsetDateTime serializes as [year, dayOfYear, hour, min, sec, ns, tzH, tzM, tzS]
function fmtTs(v: number[] | string | null | undefined): string {
  if (!v) return '—'
  if (typeof v === 'string') return new Date(v).toLocaleString()
  if (Array.isArray(v) && v.length >= 6) {
    const [year, dayOfYear, hour, min, sec] = v as number[]
    const d = new Date(year, 0, dayOfYear - 1)
    d.setHours(hour, min, sec)
    return d.toLocaleString()
  }
  return '—'
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface InstalledPlugin {
  id: string
  plugin_id: string
  version: string
  source: string
  state: 'installed' | 'granted' | 'enabled' | 'disabled' | 'quarantined'
  signature_verified: boolean
  enabled_at: number[] | string | null
  created_at: number[] | string
  manifest: {
    name: string
    description: string
    author: string
    homepage?: string
    capabilities?: string[]
  }
}

interface AvailablePlugin {
  plugin_id: string
  name: string
  description: string
  author: string
  version: string
  tier: 'core' | 'bundled' | 'third-party'
  kind: 'native' | 'wasm' | 'mcp'
  official: boolean
  homepage: string | null
  capabilities: string[]
  download_url: string | null
  signature_verified: boolean
  installed: boolean
}

// ── Static changelog data ──────────────────────────────────────────────────────

const CHANGELOGS: Record<string, Array<{ version: string; date: string; changes: string[] }>> = {
  'com.tundra.wordpress': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: WordPress + WooCommerce site templates',
      'Plugin/theme manager (install, activate, deactivate)',
      'Danger zone: uninstall with data wipe option',
      'Per-install detail view with tabbed plugin/theme management',
    ]},
  ],
  'com.tundra.github': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: GitHub App integration',
      'Push and PR webhook triggers',
      'Deployment status callbacks',
      'PR preview environment support',
      'Secrets injection from GitHub repository secrets',
    ]},
  ],
  'com.tundra.namecheap': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Namecheap domain + DNS management',
      'ACME DNS-01 challenge automation for Let\'s Encrypt',
      'Auto-renewal support via Namecheap API',
      'DNS record CRUD (A, AAAA, CNAME, MX, TXT)',
    ]},
  ],
  'com.tundra.mcp-server': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Model Context Protocol server',
      'Claude Desktop, Cursor, and Claude Code client support',
      'Scoped API token generation per MCP session',
      'Read-only tools: list servers, sites, deployments',
      'Write tools: deploy site, restart server',
    ]},
  ],
  'com.tundra.plesk-migration': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Plesk Obsidian 18.0.70+ migration',
      'Zero-downtime site migration with DNS cutover',
      'Mailbox and database migration included',
      'Dry-run mode with pre-flight compatibility checks',
    ]},
  ],
  'com.tundra.cloudflare-dns': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Cloudflare DNS provider',
      'Zone management and record CRUD',
      'ACME DNS-01 challenge support',
      'Proxy toggle per record',
    ]},
  ],
  'com.tundra.mailgun': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Mailgun SMTP relay',
      'Per-domain sender routing',
      'Delivery event webhooks',
      'API key stored encrypted via EncryptedField<T>',
    ]},
  ],
  'com.tundra.slack-alerts': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Slack notification routing',
      'Per-server and per-site channel assignment',
      'Deployment, alert, and maintenance event types',
      'Block Kit formatted messages',
    ]},
  ],
  'com.tundra.discord-alerts': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: Discord webhook notifications',
      'Per-server and per-site webhook routing',
      'Rich embeds for deployment and alert events',
    ]},
  ],
  'com.tundra.s3-backup': [
    { version: '1.0.0', date: '2025-04-01', changes: [
      'Initial release: S3-compatible backup storage',
      'AWS S3, Wasabi, Backblaze B2, Cloudflare R2 support',
      'Restic snapshot integration',
      'Lifecycle rule configuration',
      'Client-side AES-256-GCM encryption before upload',
    ]},
  ],
}

// ── Plugin screenshot/preview mockups ─────────────────────────────────────────

function PluginScreenshot({ pluginId }: { pluginId: string }) {
  const mockups: Record<string, ReactNode> = {
    'com.tundra.wordpress': (
      <div className="rounded-lg border border-tundra-ink-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <span className="flex-1 rounded bg-white border border-tundra-ink-200 px-3 py-0.5 text-xs text-tundra-ink-400 font-mono">
            tundra.local/wordpress/installations/…
          </span>
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-tundra-ink">myblog.example.com</span>
            <span className="rounded-full border border-tundra-lichen-300 bg-tundra-lichen-50 px-2 py-0.5 text-xs text-tundra-lichen-700">WP 6.7</span>
          </div>
          <div className="flex gap-1 mb-3">
            {['Plugins', 'Themes', 'Danger Zone'].map((t) => (
              <span key={t} className={`rounded px-2.5 py-1 text-xs font-medium ${t === 'Plugins' ? 'bg-tundra-lichen text-white' : 'text-tundra-ink-400'}`}>{t}</span>
            ))}
          </div>
          <div className="space-y-2">
            {[
              { name: 'WooCommerce', ver: '9.5', active: true },
              { name: 'Yoast SEO', ver: '24.0', active: true },
              { name: 'Contact Form 7', ver: '5.9', active: false },
            ].map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded border border-tundra-ink-100 px-3 py-2 text-xs">
                <span className="font-medium text-tundra-ink">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-tundra-ink-400">v{p.ver}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.active ? 'bg-tundra-lichen-50 text-tundra-lichen-700' : 'bg-tundra-ink-50 text-tundra-ink-400'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),

    'com.tundra.github': (
      <div className="rounded-lg border border-tundra-ink-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <span className="flex-1 rounded bg-white border border-tundra-ink-200 px-3 py-0.5 text-xs text-tundra-ink-400 font-mono">
            tundra.local/sites/…/deployments
          </span>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-tundra-ink-400 mb-2">Recent Deployments</p>
          {[
            { ref: 'main', sha: 'a1b2c3d', status: 'succeeded', time: '2m ago' },
            { ref: 'feature/checkout', sha: 'e4f5a6b', status: 'running', time: '5m ago' },
            { ref: 'main', sha: 'c7d8e9f', status: 'failed', time: '1h ago' },
          ].map((d) => (
            <div key={d.sha} className="flex items-center gap-3 rounded border border-tundra-ink-100 px-3 py-2 text-xs">
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                d.status === 'succeeded' ? 'bg-tundra-lichen' :
                d.status === 'running' ? 'bg-tundra-aurora animate-pulse' : 'bg-red-400'
              }`} />
              <span className="font-mono text-tundra-ink-500">{d.sha}</span>
              <span className="font-medium text-tundra-ink flex-1">{d.ref}</span>
              <span className="text-tundra-ink-400">{d.time}</span>
            </div>
          ))}
        </div>
      </div>
    ),

    'com.tundra.mcp-server': (
      <div className="rounded-lg border border-tundra-ink-200 bg-[#1e1e2e] overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#181825] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/60" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
            <span className="h-3 w-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-white/40 font-mono">Claude Desktop — MCP</span>
        </div>
        <div className="p-4">
          <p className="text-xs text-white/40 mb-3 font-mono">Available tools (8)</p>
          <div className="space-y-1.5">
            {[
              'list_servers', 'get_server', 'list_sites', 'get_site',
              'deploy_site', 'list_deployments', 'restart_server', 'list_databases',
            ].map((tool) => (
              <div key={tool} className="flex items-center gap-2 text-xs">
                <span className="text-[#89b4fa] font-mono">{tool}</span>
                <span className="text-white/20">─</span>
                <span className="text-white/40">fn</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),

    'com.tundra.cloudflare-dns': (
      <div className="rounded-lg border border-tundra-ink-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-tundra-ink">DNS Records — example.com</span>
        </div>
        <div className="p-3 space-y-1.5">
          {[
            { type: 'A',     name: '@',    value: '1.2.3.4',         proxy: true },
            { type: 'CNAME', name: 'www',  value: 'example.com',     proxy: true },
            { type: 'MX',    name: '@',    value: 'mail.example.com', proxy: false },
            { type: 'TXT',   name: '@',    value: 'v=spf1 ...',      proxy: false },
          ].map((r) => (
            <div key={r.type + r.name} className="grid grid-cols-4 items-center gap-2 text-xs border-b border-tundra-ink-50 pb-1.5">
              <span className="rounded bg-orange-50 px-1.5 py-0.5 font-mono font-bold text-orange-600 text-center">{r.type}</span>
              <span className="font-mono text-tundra-ink">{r.name}</span>
              <span className="text-tundra-ink-400 truncate">{r.value}</span>
              {r.proxy
                ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-600 text-center">Proxied</span>
                : <span className="rounded-full bg-tundra-ink-50 px-2 py-0.5 text-[10px] text-tundra-ink-400 text-center">DNS only</span>}
            </div>
          ))}
        </div>
      </div>
    ),

    'com.tundra.s3-backup': (
      <div className="rounded-lg border border-tundra-ink-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-tundra-ink">Backup Storage — S3 Configuration</span>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-tundra-ink-400 mb-1">Provider</p>
              <span className="rounded bg-yellow-50 border border-yellow-200 px-2 py-1 font-medium text-yellow-800">AWS S3</span>
            </div>
            <div>
              <p className="text-tundra-ink-400 mb-1">Encryption</p>
              <span className="rounded bg-tundra-lichen-50 border border-tundra-lichen-200 px-2 py-1 font-medium text-tundra-lichen-700">AES-256-GCM</span>
            </div>
          </div>
          <div>
            <p className="text-tundra-ink-400 mb-1">Bucket</p>
            <code className="block rounded bg-tundra-ink-50 px-2 py-1 font-mono text-tundra-ink">my-tundra-backups</code>
          </div>
          <div className="flex items-center justify-between border-t border-tundra-ink-100 pt-2">
            <span className="text-tundra-ink-500">Last snapshot</span>
            <span className="font-medium text-tundra-ink">3h ago · 2.4 GB</span>
          </div>
        </div>
      </div>
    ),
  }

  // Generic fallback screenshot
  if (!mockups[pluginId]) {
    const name = pluginId.split('.').pop() ?? 'plugin'
    return (
      <div className="rounded-lg border border-tundra-ink-200 bg-white overflow-hidden shadow-sm">
        <div className="border-b border-tundra-ink-100 bg-tundra-ink-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-tundra-ink capitalize">{name} — Configuration</span>
        </div>
        <div className="flex h-32 items-center justify-center p-6">
          <p className="text-sm text-tundra-ink-300">Plugin preview not available</p>
        </div>
      </div>
    )
  }

  return mockups[pluginId]
}

// ── Shared badge components ───────────────────────────────────────────────────

const STATE_META: Record<string, { pill: string; dot: string }> = {
  enabled:     { pill: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',  dot: 'bg-tundra-lichen' },
  disabled:    { pill: 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',            dot: 'bg-tundra-ink-300' },
  installed:   { pill: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',   dot: 'bg-tundra-aurora' },
  granted:     { pill: 'border-yellow-300 bg-yellow-50 text-yellow-800',                         dot: 'bg-yellow-400' },
  quarantined: { pill: 'border-red-300 bg-red-50 text-red-800',                                 dot: 'bg-red-500' },
}

function StatePill({ state }: { state: string }) {
  const m = STATE_META[state] ?? STATE_META['disabled']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {state}
    </span>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, string> = {
    native: 'bg-tundra-ink-100 text-tundra-ink-600',
    wasm:   'bg-purple-100 text-purple-700',
    mcp:    'bg-tundra-aurora-100 text-tundra-aurora-700',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${map[kind] ?? 'bg-tundra-ink-100 text-tundra-ink-600'}`}>
      {kind.toUpperCase()}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'capabilities' | 'changelog' | 'meta'

function PluginDetailPage() {
  const { pluginId } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: installedData } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api<{ data: InstalledPlugin[] }>('/plugins'),
  })

  const { data: availableData } = useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: () => api<{ data: AvailablePlugin[] }>('/plugins/available'),
  })

  const installed = installedData?.data?.find((p) => p.plugin_id === pluginId) ?? null
  const available = availableData?.data?.find((p) => p.plugin_id === pluginId) ?? null

  const name        = installed?.manifest.name ?? available?.name ?? pluginId
  const description = installed?.manifest.description ?? available?.description ?? ''
  const author      = installed?.manifest.author ?? available?.author ?? ''
  const version     = installed?.version ?? available?.version ?? ''
  const tier        = available?.tier ?? 'third-party'
  const kind        = available?.kind ?? 'wasm'
  const official    = available?.official ?? false
  const homepage    = installed?.manifest.homepage ?? available?.homepage ?? null
  const caps        = installed?.manifest.capabilities ?? available?.capabilities ?? []
  const sigVerified = installed?.signature_verified ?? available?.signature_verified ?? false
  const changelog   = CHANGELOGS[pluginId] ?? []

  const enableMutation = useMutation({
    mutationFn: (id: string) => api(`/plugins/${id}/enable`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      void queryClient.invalidateQueries({ queryKey: ['plugins-nav'] })
      toast.success('Plugin enabled')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Enable failed'),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => api(`/plugins/${id}/disable`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      void queryClient.invalidateQueries({ queryKey: ['plugins-nav'] })
      toast.success('Plugin disabled')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Disable failed'),
  })

  const installMutation = useMutation({
    mutationFn: () => {
      if (!available) throw new Error('Plugin not found')
      return api('/plugins/install', {
        method: 'POST',
        body: {
          plugin_id:    available.plugin_id,
          version:      available.version,
          name:         available.name,
          description:  available.description,
          author:       available.author,
          tier:         available.tier,
          kind:         available.kind,
          official:     available.signature_verified,
          homepage:     available.homepage,
          capabilities: available.capabilities,
          download_url: available.download_url,
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'available'] })
      toast.success('Plugin installed — you can now enable it')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Install failed'),
  })

  const acting = enableMutation.isPending || disableMutation.isPending || installMutation.isPending

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-2 text-sm text-tundra-ink-400">
        <Link to="/plugins" className="hover:text-tundra-ink transition-colors">Plugins</Link>
        <span>/</span>
        <span className="text-tundra-ink">{name}</span>
      </nav>

      {/* Hero */}
      <div className="mb-6 flex flex-col gap-5 rounded-2xl border border-tundra-ink-200 bg-white p-6 sm:flex-row sm:items-start">
        {/* Logo */}
        <div className="shrink-0">
          <PluginLogo pluginId={pluginId} size={72} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h1 className="text-xl font-bold text-tundra-ink">{name}</h1>
            {official && (
              <span className="inline-flex items-center gap-1 rounded bg-tundra-lichen-100 px-1.5 py-0.5 text-xs font-medium text-tundra-lichen-700">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Official
              </span>
            )}
            {installed && <StatePill state={installed.state} />}
          </div>

          <p className="text-sm text-tundra-ink-400 mb-3 leading-relaxed">{description}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tundra-ink-400 mb-4">
            <KindBadge kind={kind} />
            {version && <span>v{version}</span>}
            <span className="capitalize">{tier}</span>
            {author && <><span className="text-tundra-ink-200">·</span><span>{author}</span></>}
            {sigVerified
              ? <span className="text-tundra-lichen-600">✓ Signature verified</span>
              : <span className="text-yellow-600">⚠ Unverified</span>}
          </div>

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-2">
            {!installed && available && (
              <button
                type="button"
                onClick={() => { installMutation.mutate() }}
                disabled={acting}
                className="rounded-lg bg-tundra-lichen px-4 py-1.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
              >
                {installMutation.isPending ? 'Installing…' : 'Install'}
              </button>
            )}
            {installed && installed.state !== 'quarantined' && (
              installed.state === 'enabled' ? (
                <button
                  type="button"
                  onClick={() => { disableMutation.mutate(installed.id) }}
                  disabled={acting}
                  className="rounded-lg border border-tundra-ink-200 px-4 py-1.5 text-sm font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
                >
                  {disableMutation.isPending ? 'Disabling…' : 'Disable'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { enableMutation.mutate(installed.id) }}
                  disabled={acting}
                  className="rounded-lg bg-tundra-lichen px-4 py-1.5 text-sm font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
                >
                  {enableMutation.isPending ? 'Enabling…' : 'Enable'}
                </button>
              )
            )}
            {installed?.state === 'quarantined' && (
              <span className="text-sm font-medium text-red-600">Quarantined — cannot enable</span>
            )}
            {homepage && (
              <a
                href={homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-tundra-ink-400 hover:text-tundra-aurora transition-colors"
              >
                Docs ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-0.5 border-b border-tundra-ink-200">
        {(['overview', 'capabilities', 'changelog', 'meta'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? 'border-tundra-lichen text-tundra-lichen-700'
                : 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
            }`}
          >
            {t}
            {t === 'changelog' && changelog.length > 0 && (
              <span className="ml-1.5 rounded-full bg-tundra-ink-100 px-1.5 py-0.5 text-xs text-tundra-ink-500">
                {changelog.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-tundra-ink">About this plugin</h2>
            <p className="text-sm text-tundra-ink-500 leading-relaxed mb-4">{description}</p>
            {caps.length > 0 && (
              <>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">Required Capabilities</h3>
                <div className="flex flex-wrap gap-1.5">
                  {caps.map((c) => (
                    <span key={c} className="rounded bg-tundra-ink-100 px-2 py-0.5 font-mono text-xs text-tundra-ink-500">{c}</span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-tundra-ink">Preview</h2>
            <PluginScreenshot pluginId={pluginId} />
          </div>
        </div>
      )}

      {/* ── Capabilities ── */}
      {tab === 'capabilities' && (
        <div className="max-w-xl">
          {caps.length === 0 ? (
            <p className="text-sm text-tundra-ink-400">No capabilities declared.</p>
          ) : (
            <div className="space-y-2">
              {caps.map((c) => {
                const [scope, access] = c.split(':')
                return (
                  <div key={c} className="flex items-center gap-3 rounded-lg border border-tundra-ink-100 px-4 py-3">
                    <span className="font-mono text-sm text-tundra-ink">{c}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="rounded bg-tundra-ink-100 px-2 py-0.5 text-xs text-tundra-ink-500 capitalize">{scope}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        access === 'write' ? 'bg-yellow-50 text-yellow-700' : 'bg-tundra-lichen-50 text-tundra-lichen-700'
                      }`}>{access}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-6 rounded-lg border border-tundra-ink-100 bg-tundra-ink-50 p-4 text-xs text-tundra-ink-500">
            <p className="mb-1 font-semibold text-tundra-ink-700">Capability model</p>
            <p>Native plugins declare capabilities at install time. The plugin host enforces them — any host call outside the declared scope is rejected, even for signed official plugins.</p>
          </div>
        </div>
      )}

      {/* ── Changelog ── */}
      {tab === 'changelog' && (
        <div className="max-w-xl">
          {changelog.length === 0 ? (
            <p className="text-sm text-tundra-ink-400">No changelog available.</p>
          ) : (
            <div className="relative pl-5">
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-tundra-ink-100" />
              <div className="space-y-6">
                {changelog.map((entry, i) => (
                  <div key={entry.version} className="relative">
                    <div className={`absolute -left-5 mt-1 h-3 w-3 rounded-full border-2 border-white ${
                      i === 0 ? 'bg-tundra-lichen' : 'bg-tundra-ink-300'
                    }`} />
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-sm font-bold text-tundra-ink">v{entry.version}</span>
                      <span className="text-xs text-tundra-ink-400">
                        {new Date(entry.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                      {i === 0 && (
                        <span className="rounded-full bg-tundra-lichen-100 px-2 py-0.5 text-xs font-medium text-tundra-lichen-700">Latest</span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {entry.changes.map((c) => (
                        <li key={c} className="flex items-start gap-2 text-sm text-tundra-ink-500">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-tundra-ink-300 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Meta ── */}
      {tab === 'meta' && (
        <div className="max-w-xl space-y-2">
          {[
            { label: 'Plugin ID',  value: pluginId },
            { label: 'Version',    value: version || '—' },
            { label: 'Tier',       value: tier },
            { label: 'Kind',       value: kind.toUpperCase() },
            { label: 'Author',     value: author || '—' },
            { label: 'Homepage',   value: homepage ?? '—', link: homepage ?? undefined },
            { label: 'Signature',  value: sigVerified ? 'Verified ✓' : 'Unverified ⚠' },
            ...(installed ? [
              { label: 'Internal ID', value: installed.id },
              { label: 'Source',      value: installed.source },
              { label: 'State',       value: installed.state },
              { label: 'Installed',   value: fmtTs(installed.created_at) },
              { label: 'Enabled at',  value: fmtTs(installed.enabled_at) },
            ] : []),
          ].map(({ label, value, link }) => (
            <div key={label} className="flex items-start gap-4 rounded-lg border border-tundra-ink-100 px-4 py-2.5 text-sm">
              <span className="w-28 shrink-0 text-tundra-ink-400">{label}</span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer"
                  className="text-tundra-aurora hover:underline break-all">{value}</a>
              ) : (
                <span className="font-mono text-tundra-ink break-all">{value}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
