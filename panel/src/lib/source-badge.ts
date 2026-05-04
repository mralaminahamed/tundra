import type { Site } from './api-types'

export interface SourceMeta {
  label: string
  cls: string
}

// Base source kind → badge. Plugins extend this via PLUGIN_TEMPLATE_BADGES.
export const BASE_SOURCE_META: Record<string, SourceMeta> = {
  github:   { label: 'GitHub',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  gitlab:   { label: 'GitLab',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  template: { label: 'Template', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  blank:    { label: 'Blank',    cls: 'bg-stone-100 text-stone-500 border-stone-200' },
  tarball:  { label: 'Tarball',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
}

// Plugin-contributed template_id → badge mappings.
// Each entry says: "when source_kind=template and template_id matches one of these,
// show this badge instead of the generic Template badge."
export interface PluginTemplateBadge {
  pluginId: string           // the plugin that owns these template IDs
  templateIds: string[]      // e.g. ['wordpress', 'woocommerce']
  badge: SourceMeta
}

export const PLUGIN_TEMPLATE_BADGES: PluginTemplateBadge[] = [
  {
    pluginId: 'com.tundra.wordpress',
    templateIds: ['wordpress', 'woocommerce'],
    badge: { label: 'WordPress', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  },
]

/**
 * Resolve the display badge for a site given the list of enabled plugin IDs.
 * Returns null if no badge should be shown.
 */
export function resolveBadge(
  site: Pick<Site, 'source_kind' | 'source_config'>,
  enabledPluginIds: string[],
): SourceMeta | null {
  const { source_kind, source_config } = site
  if (!source_kind) return null

  if (source_kind === 'template' && source_config?.template_id) {
    const tid = source_config.template_id
    for (const pb of PLUGIN_TEMPLATE_BADGES) {
      if (
        pb.templateIds.includes(tid) &&
        enabledPluginIds.includes(pb.pluginId)
      ) {
        return pb.badge
      }
    }
    // Fall through to generic template badge if no plugin claims this template_id
  }

  return BASE_SOURCE_META[source_kind] ?? { label: source_kind, cls: 'bg-stone-100 text-stone-500 border-stone-200' }
}
