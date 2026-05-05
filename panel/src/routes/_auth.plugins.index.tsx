import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { SkeletonPage } from '@/components/ui/skeleton'
import { PluginLogo } from '../components/plugin-logo'

export const Route = createFileRoute('/_auth/plugins/')({
  component: PluginsPage,
})

interface Plugin {
  id: string
  plugin_id: string
  version: string
  source: string
  state: 'installed' | 'granted' | 'enabled' | 'disabled' | 'quarantined'
  signature_verified: boolean
  enabled_at: string | null
  created_at: string
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

// ── Shared helpers ─────────────────────────────────────────────────────────────

const STATE_META: Record<Plugin['state'], { pill: string; dot: string }> = {
  enabled:     { pill: 'border-tundra-lichen-300 bg-tundra-lichen-50 text-tundra-lichen-800',  dot: 'bg-tundra-lichen' },
  disabled:    { pill: 'border-tundra-ink-200 bg-tundra-ink-50 text-tundra-ink-500',            dot: 'bg-tundra-ink-300' },
  installed:   { pill: 'border-tundra-aurora-300 bg-tundra-aurora-50 text-tundra-aurora-800',   dot: 'bg-tundra-aurora' },
  granted:     { pill: 'border-yellow-300 bg-yellow-50 text-yellow-800',                         dot: 'bg-yellow-400' },
  quarantined: { pill: 'border-red-300 bg-red-50 text-red-800',                                 dot: 'bg-red-500' },
}

function StatePill({ state }: { state: Plugin['state'] }) {
  const m = STATE_META[state]
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

function TierBadge({ tier, official }: { tier: string; official: boolean }) {
  if (official) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-tundra-lichen-100 text-tundra-lichen-700">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
        Official
      </span>
    )
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-tundra-ink-100 text-tundra-ink-500 capitalize">
      {tier}
    </span>
  )
}

function CapabilityList({ caps }: { caps: string[] }) {
  if (!caps.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {caps.map((c) => (
        <span key={c} className="rounded bg-tundra-ink-100 px-1.5 py-0.5 font-mono text-xs text-tundra-ink-500">
          {c}
        </span>
      ))}
    </div>
  )
}

// ── Available tab ──────────────────────────────────────────────────────────────

function AvailableCard({ p, onInstall, installing }: {
  p: AvailablePlugin
  onInstall: (p: AvailablePlugin) => void
  installing: boolean
}) {
  return (
    <div className={`group relative flex flex-col rounded-xl border bg-white p-5 transition-shadow hover:shadow-md ${
      p.installed ? 'border-tundra-lichen-200' : 'border-tundra-ink-200'
    }`}>
      {/* Stretched link covers the whole card */}
      <Link
        to="/plugins/$pluginId"
        params={{ pluginId: p.plugin_id }}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`View ${p.name} details`}
      />

      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PluginLogo pluginId={p.plugin_id} size={40} className="shrink-0 rounded-xl" />
          <div>
            <h3 className="text-sm font-semibold text-tundra-ink leading-tight group-hover:text-tundra-lichen-700 transition-colors">{p.name}</h3>
            <p className="font-mono text-xs text-tundra-ink-400">{p.plugin_id}</p>
          </div>
        </div>
        {p.installed ? (
          <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-tundra-lichen-300 bg-tundra-lichen-50 px-2.5 py-0.5 text-xs font-medium text-tundra-lichen-800">
            <span className="h-1.5 w-1.5 rounded-full bg-tundra-lichen" />
            Installed
          </span>
        ) : (
          <TierBadge tier={p.tier} official={p.official} />
        )}
      </div>

      {/* Description */}
      <p className="mb-3 flex-1 text-sm text-tundra-ink-500 leading-snug">{p.description}</p>

      {/* Capabilities */}
      {p.capabilities.length > 0 && (
        <div className="mb-3">
          <CapabilityList caps={p.capabilities} />
        </div>
      )}

      {/* Meta */}
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tundra-ink-400">
        <KindBadge kind={p.kind} />
        <span>v{p.version}</span>
        <span className="text-tundra-ink-200">·</span>
        <span>{p.author}</span>
        {!p.signature_verified && (
          <>
            <span className="text-tundra-ink-200">·</span>
            <span className="text-yellow-600 font-medium">⚠ unverified</span>
          </>
        )}
      </div>

      {/* Actions — relative z-10 so they sit above the stretched link */}
      <div className="relative z-10 flex items-center gap-2">
        {p.installed ? (
          <span className="text-xs text-tundra-ink-400">Already installed — manage in Installed tab</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onInstall(p) }}
            disabled={installing}
            className="rounded-lg bg-tundra-lichen px-4 py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
        {p.homepage && (
          <a
            href={p.homepage}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.stopPropagation() }}
            className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-aurora transition-colors"
          >
            Docs ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── Installed tab ──────────────────────────────────────────────────────────────

function InstalledCard({ p, onEnable, onDisable, acting }: {
  p: Plugin
  onEnable: (id: string) => void
  onDisable: (id: string) => void
  acting: boolean
}) {
  return (
    <div className={`group relative flex flex-col rounded-xl border bg-white p-5 transition-shadow hover:shadow-md ${
      p.state === 'quarantined' ? 'border-red-200'
      : p.state === 'enabled'   ? 'border-tundra-lichen-200'
      : 'border-tundra-ink-200'
    }`}>
      {/* Stretched link covers the whole card */}
      <Link
        to="/plugins/$pluginId"
        params={{ pluginId: p.plugin_id }}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`View ${p.manifest.name} details`}
      />

      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`shrink-0 rounded-xl overflow-hidden ${p.state === 'quarantined' ? 'ring-2 ring-red-300' : ''}`}>
            <PluginLogo pluginId={p.plugin_id} size={40} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-tundra-ink leading-tight group-hover:text-tundra-lichen-700 transition-colors">{p.manifest.name}</h3>
            <p className="font-mono text-xs text-tundra-ink-400">{p.plugin_id}</p>
          </div>
        </div>
        <StatePill state={p.state} />
      </div>

      <p className="mb-3 flex-1 text-sm text-tundra-ink-500 leading-snug">{p.manifest.description}</p>

      {p.manifest.capabilities && p.manifest.capabilities.length > 0 && (
        <div className="mb-3">
          <CapabilityList caps={p.manifest.capabilities} />
        </div>
      )}

      {/* Meta */}
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tundra-ink-400">
        <span className={`flex items-center gap-1 ${p.signature_verified ? 'text-tundra-lichen-600' : 'text-yellow-600'}`}>
          {p.signature_verified ? '✓ Verified' : '⚠ Unverified'}
        </span>
        <span className="text-tundra-ink-200">·</span>
        <span>v{p.version}</span>
        <span className="text-tundra-ink-200">·</span>
        <span className="capitalize">{p.source}</span>
        {p.manifest.author && (
          <>
            <span className="text-tundra-ink-200">·</span>
            <span>{p.manifest.author}</span>
          </>
        )}
      </div>

      {/* Actions — relative z-10 so they sit above the stretched link */}
      <div className="relative z-10 flex items-center gap-2">
        {p.state === 'enabled' ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDisable(p.id) }}
            disabled={acting}
            className="rounded-lg border border-tundra-ink-200 px-3 py-1.5 text-xs font-medium text-tundra-ink-600 hover:bg-tundra-ink-50 disabled:opacity-50 transition-colors"
          >
            {acting ? 'Disabling…' : 'Disable'}
          </button>
        ) : p.state === 'quarantined' ? (
          <span className="text-xs font-medium text-red-600">Quarantined — cannot enable</span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEnable(p.id) }}
            disabled={acting}
            className="rounded-lg bg-tundra-lichen px-3 py-1.5 text-xs font-medium text-white hover:bg-tundra-lichen-600 disabled:opacity-50 transition-colors"
          >
            {acting ? 'Enabling…' : 'Enable'}
          </button>
        )}
        {p.manifest.homepage && (
          <a
            href={p.manifest.homepage}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.stopPropagation() }}
            className="ml-auto text-xs text-tundra-ink-400 hover:text-tundra-aurora transition-colors"
          >
            Docs ↗
          </a>
        )}
      </div>

      {p.state === 'enabled' && p.enabled_at && (
        <p className="mt-2 text-xs text-tundra-ink-300">
          Enabled {new Date(p.enabled_at).toLocaleDateString()}
        </p>
      )}

      {p.state === 'quarantined' && (
        <div className="absolute inset-0 rounded-xl bg-red-50/50 pointer-events-none" />
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = 'available' | 'installed'

function PluginsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('available')
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState<string>('')
  const [installingId, setInstallingId] = useState<string | null>(null)

  const { data: availableData, isLoading: availLoading } = useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: () => api<{ data: AvailablePlugin[] }>('/plugins/available'),
  })

  const { data: installedData, isLoading: installedLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api<{ data: Plugin[] }>('/plugins'),
  })

  const installMutation = useMutation({
    mutationFn: (p: AvailablePlugin) =>
      api('/plugins/install', {
        method: 'POST',
        body: {
          plugin_id:    p.plugin_id,
          version:      p.version,
          name:         p.name,
          description:  p.description,
          author:       p.author,
          tier:         p.tier,
          kind:         p.kind,
          official:     p.signature_verified,
          homepage:     p.homepage,
          capabilities: p.capabilities,
          download_url: p.download_url,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'available'] })
      toast.success('Plugin installed — enable it in the Installed tab')
      setInstallingId(null)
      setTab('installed')
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Install failed')
      setInstallingId(null)
    },
  })

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

  const available = availableData?.data ?? []
  const installed = installedData?.data ?? []

  const q = search.toLowerCase()

  const filteredAvailable = available.filter((p) => {
    if (filterTier && p.tier !== filterTier) return false
    if (q && !p.name.toLowerCase().includes(q) && !p.plugin_id.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false
    return true
  })

  const filteredInstalled = installed.filter((p) => {
    if (q && !p.manifest.name.toLowerCase().includes(q) && !p.plugin_id.toLowerCase().includes(q)) return false
    return true
  })

  const enabledCount    = installed.filter((p) => p.state === 'enabled').length
  const quarantined     = installed.filter((p) => p.state === 'quarantined')
  const officialCount   = available.filter((p) => p.official).length

  const TIERS = ['core', 'bundled', 'third-party'] as const

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tundra-ink">Plugins</h1>
          <p className="mt-0.5 text-sm text-tundra-ink-400">
            {available.length} available · {installed.length} installed · {enabledCount} active
          </p>
        </div>
      </div>

      {/* Quarantine warning */}
      {quarantined.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <path d="M12 9v4m0 4h.01" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">
              {quarantined.length} quarantined plugin{quarantined.length !== 1 ? 's' : ''}
            </p>
            <p className="mt-0.5 text-xs text-red-700">
              {quarantined.map((p) => p.manifest.name).join(', ')} — review and remove if untrusted.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-0.5 border-b border-tundra-ink-200">
        {([['available', `Available (${String(officialCount)}+ official)`], ['installed', `Installed (${String(installed.length)})`]] as const).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setSearch(''); setFilterTier('') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-tundra-lichen text-tundra-lichen-700'
                : 'border-transparent text-tundra-ink-400 hover:text-tundra-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + filter row */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder={tab === 'available' ? 'Search plugins…' : 'Search installed…'}
          value={search}
          onChange={(e) => { setSearch(e.target.value) }}
          className="h-9 w-56 rounded-lg border border-tundra-ink-200 px-3 text-sm focus:border-tundra-lichen focus:outline-none focus:ring-1 focus:ring-tundra-lichen"
        />
        {tab === 'available' && (
          <div className="flex gap-1.5">
            {TIERS.map((tier) => {
              const count = available.filter((p) => p.tier === tier).length
              if (!count) return null
              return (
                <button
                  key={tier}
                  onClick={() => { setFilterTier(filterTier === tier ? '' : tier) }}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    filterTier === tier
                      ? 'border-tundra-lichen bg-tundra-lichen text-white'
                      : 'border-tundra-ink-200 text-tundra-ink-500 hover:border-tundra-lichen hover:text-tundra-lichen-700'
                  }`}
                >
                  {tier}
                  <span className={`rounded-full px-1 text-xs ${filterTier === tier ? 'bg-white/20' : 'bg-tundra-ink-100 text-tundra-ink-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Available tab ── */}
      {tab === 'available' && (
        <>
          {availLoading && <SkeletonPage />}
          {!availLoading && filteredAvailable.length === 0 && (
            <div className="rounded-xl border border-tundra-ink-200 py-14 text-center">
              <p className="text-sm text-tundra-ink-400">No plugins match the filter.</p>
            </div>
          )}
          {filteredAvailable.length > 0 && (
            <>
              {/* Official section */}
              {filteredAvailable.some((p) => p.official) && (
                <div className="mb-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
                    Official · Signed by Tundra Core Team
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredAvailable.filter((p) => p.official).map((p) => (
                      <AvailableCard
                        key={p.plugin_id}
                        p={p}
                        installing={installingId === p.plugin_id && installMutation.isPending}
                        onInstall={(plug) => {
                          setInstallingId(plug.plugin_id)
                          installMutation.mutate(plug)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Community / third-party section */}
              {filteredAvailable.some((p) => !p.official) && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-tundra-ink-400">
                    Community · Enable at your own risk
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredAvailable.filter((p) => !p.official).map((p) => (
                      <AvailableCard
                        key={p.plugin_id}
                        p={p}
                        installing={installingId === p.plugin_id && installMutation.isPending}
                        onInstall={(plug) => {
                          setInstallingId(plug.plugin_id)
                          installMutation.mutate(plug)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Installed tab ── */}
      {tab === 'installed' && (
        <>
          {installedLoading && <SkeletonPage />}
          {!installedLoading && filteredInstalled.length === 0 && (
            <div className="rounded-xl border border-tundra-ink-200 py-14 text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-tundra-ink-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-medium text-tundra-ink-500">
                {installed.length === 0 ? 'No plugins installed yet' : 'No installed plugins match the search'}
              </p>
              {installed.length === 0 && (
                <button
                  type="button"
                  onClick={() => { setTab('available') }}
                  className="mt-3 text-sm font-medium text-tundra-lichen hover:underline"
                >
                  Browse available plugins →
                </button>
              )}
            </div>
          )}
          {filteredInstalled.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredInstalled.map((p) => (
                <InstalledCard
                  key={p.id}
                  p={p}
                  acting={enableMutation.isPending || disableMutation.isPending}
                  onEnable={(id) => { enableMutation.mutate(id) }}
                  onDisable={(id) => { disableMutation.mutate(id) }}
                />
              ))}
            </div>
          )}
          {/* Security note */}
          {installed.length > 0 && (
            <div className="mt-6 rounded-lg border border-tundra-ink-100 bg-tundra-ink-50 p-4 text-xs text-tundra-ink-500">
              <p className="mb-1.5 text-sm font-semibold text-tundra-ink-700">Plugin security</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Wasm plugins run in a sandboxed Wasmtime environment with capability-gated host calls</li>
                <li>MCP plugins connect over stdio or HTTP — review declared scopes before enabling</li>
                <li>Unverified signatures mean the plugin has not passed supply-chain checks</li>
                <li>Quarantined plugins failed policy checks and cannot be enabled until cleared</li>
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
