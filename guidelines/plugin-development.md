# Tundra — Plugin Development

Plugin author guide: write core plugins (native Rust) or third-party plugins (WebAssembly), register templates, contribute source badges, and add management UI.

---

## Plugin tiers

| Tier            | Execution                                        | Trust      | Who                                                       |
|-----------------|--------------------------------------------------|------------|-----------------------------------------------------------|
| **Core**        | Native Rust, compiled into `tundrad`             | Full trust | Tundra project (e.g., WordPress, MCP server)              |
| **Bundled**     | Native Rust, dynamically loaded `.so`            | Full trust | First-party, optional install (e.g., Cloudflare, Mailgun) |
| **Third-party** | WebAssembly Component Model (WASIp2) in Wasmtime | Sandboxed  | Anyone                                                    |

Third-party plugins run in a sandbox — they cannot access the master key, speak directly to the database, or open arbitrary network connections. All actions go through host-provided imports that enforce permissions and write audit rows.

---

## What a plugin can do

- Define new HTTP endpoints (under a namespaced path)
- Register one-click templates (shown in the site creation wizard)
- Contribute source badges to the sites list and detail pages
- Define new CLI subcommands
- Subscribe to and emit panel events
- Schedule background jobs
- Declare UI pages (declarative spec — no arbitrary JS in the panel)

What third-party plugins cannot do:
- Read or write the database directly (mediated access only)
- Open arbitrary network connections (declared hosts only, capability-gated)
- Access the master key
- Spawn host processes

---

## Core plugin anatomy

A core plugin lives in `crates/tundrad-plugin-<name>/` and implements the `Plugin` trait from `tundrad-plugin-host`:

```rust
use tundrad_plugin_host::{Plugin, PluginManifest, PluginTier};
use async_trait::async_trait;

pub struct MyPlugin;

#[async_trait]
impl Plugin for MyPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.my-plugin".into(),
            name: "My Plugin".into(),
            description: "Does something useful.".into(),
            version: "1.0.0".into(),
            tier: PluginTier::Core,
            ..Default::default()
        }
    }
}
```

### Plugin ID convention

`com.tundra.<name>` for first-party. Third-party: reverse domain notation — `com.example.my-plugin`.

### Register the plugin

In `crates/tundrad-api/src/routes/plugins.rs`, add the manifest to `official_catalog()`. The plugin will appear in the panel under Plugins.

### Add REST endpoints

Register routes in `crates/tundrad-api/src/lib.rs` under a namespaced path:

```rust
.nest("/api/v1/my-plugin", routes::my_plugin::router())
```

Put the handlers in `crates/tundrad-api/src/routes/my_plugin.rs`.

---

## Registering templates

Plugins can contribute site templates that appear in the creation wizard. Templates are stored in the `plugin_templates` table and served by `GET /api/v1/templates` alongside the built-in templates.

Templates are only shown when the owning plugin is enabled.

### Migration

```sql
-- In your plugin's migration file
INSERT INTO plugin_templates (plugin_id, template_id, manifest)
VALUES (
  'com.tundra.my-plugin',
  'my-template-id',
  '{
    "id": "my-template-id",
    "name": "My Template",
    "description": "One-click deploy for My Framework.",
    "version": "1.0.0",
    "icon": "my-icon",
    "runtime": { "kind": "nodejs", "version": "22" },
    "source": { "kind": "skeleton" },
    "build_command": "npm ci && npm run build",
    "start_command": "node dist/index.js",
    "listen_port": 3000,
    "tags": ["nodejs", "framework"],
    "env": {},
    "post_create": []
  }'::jsonb
);
```

### Template manifest fields

| Field             | Type     | Description                                                            |
|-------------------|----------|------------------------------------------------------------------------|
| `id`              | string   | Unique across all templates (e.g., `wordpress`)                        |
| `name`            | string   | Display name in wizard                                                 |
| `description`     | string   | Short description                                                      |
| `version`         | string   | Template version                                                       |
| `icon`            | string   | Icon identifier                                                        |
| `runtime.kind`    | string   | `static`, `php`, `laravel`, `nodejs`, `python`, `go`, `ruby`, `dotnet` |
| `runtime.version` | string   | Default version (e.g., `"8.4"`, `"22"`)                                |
| `build_command`   | string?  | Default build command                                                  |
| `start_command`   | string?  | Default start command                                                  |
| `listen_port`     | int?     | Default listen port                                                    |
| `tags`            | string[] | Searchable tags                                                        |
| `env`             | object   | Default env vars                                                       |
| `post_create`     | string[] | Commands run after provisioning                                        |

---

## Contributing source badges

When a site was created from a plugin's template, the sites list and detail page can show a custom badge instead of the generic "Template" badge.

In `panel/src/lib/source-badge.ts`, add an entry to `PLUGIN_TEMPLATE_BADGES`:

```typescript
export const PLUGIN_TEMPLATE_BADGES: PluginTemplateBadge[] = [
  // ... existing entries ...
  {
    pluginId: 'com.tundra.my-plugin',
    templateIds: ['my-template-id', 'my-other-template'],
    badge: { label: 'My Plugin', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  },
]
```

The badge appears when:
- `site.source_kind === 'template'`
- `site.source_config.template_id` is in the plugin's `templateIds`
- The plugin is currently enabled (from the `['plugins-nav']` query)

---

## Adding WordPress-style management UI

For plugins that manage per-site resources (like the WordPress plugin managing installations), the pattern is:

1. **Migration** — create your resource tables with `site_id` FK
2. **REST endpoints** — `/api/v1/<plugin-name>/<resource>/...`
3. **Panel routes** — `panel/src/routes/_auth.<plugin-name>.tsx` (list) + `_auth.<plugin-name>.$resourceId.tsx` (detail)
4. **Conditional nav** — show the sidebar item only when the plugin is enabled (see `panel/src/routes/_auth.tsx`)

### Conditional sidebar item

In `_auth.tsx`, the WordPress plugin shows its nav item by checking the `['plugins-nav']` query:

```typescript
const wordpressEnabled = installedPlugins.some(
  (p) => p.plugin_id === 'com.tundra.wordpress' && p.state === 'enabled'
)
```

Use the same pattern for your plugin. After enabling/disabling via the Plugins page, the sidebar updates immediately because the plugins page invalidates `['plugins-nav']` on toggle.

---

## Panel query key conventions

| Key               | Shape                          | Used for                                  |
|-------------------|--------------------------------|-------------------------------------------|
| `['plugins']`     | `{ data: Plugin[] }`           | Plugins management page (full object)     |
| `['plugins-nav']` | `{ plugin_id, state }[]`       | Auth layout sidebar + source badge checks |
| `['templates']`   | `{ data: TemplateManifest[] }` | Site creation wizard                      |

Use `['plugins-nav']` (not `['plugins']`) when you only need plugin IDs and state — it avoids a shape conflict with the plugins page cache.

---

## Database conventions

Every table you add must follow workspace conventions:

```sql
CREATE TABLE plugin_my_resources (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  -- your columns
  state         TEXT NOT NULL CHECK (state IN ('active', 'removing')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON plugin_my_resources
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
```

Prefix table names with `plugin_<plugin-slug>_` to avoid conflicts.

---

## Third-party (WASM) plugins

Third-party plugins compile to a WebAssembly Component and implement the WIT interface declared in `proto/wit/host.wit`.

The WIT world is `tundra:plugin/host@1.0.0`. You can author the plugin in Rust, Go (TinyGo), Python (componentize-py), or JavaScript (jco).

### Rust example skeleton

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[dependencies]
tundra-plugin-sdk = "1.0"
wit-bindgen = "0.30"
```

```rust
use tundra_plugin_sdk::prelude::*;

struct MyPlugin;

impl Plugin for MyPlugin {
    fn manifest() -> PluginManifest {
        PluginManifest {
            id: "com.example.my-plugin".into(),
            name: "My Plugin".into(),
            version: "1.0.0".into(),
            ..Default::default()
        }
    }
}

export_plugin!(MyPlugin);
```

Build to WASM Component:
```bash
cargo build --target wasm32-wasip2 --release
wasm-tools component new target/wasm32-wasip2/release/my_plugin.wasm \
  -o my-plugin.wasm
```

### Install a third-party plugin

```bash
tundra plugin install /path/to/my-plugin.wasm
```

Or from a registry URL:
```bash
tundra plugin install https://plugins.example.com/my-plugin@1.0.0.wasm
```

Capabilities must be declared and granted before the plugin can use them:
```bash
tundra plugin grant com.example.my-plugin net:api.example.com
tundra plugin grant com.example.my-plugin path:/var/lib/tundra/plugins/my-plugin
```

---

## Full reference

- `docs/05-extensibility/tundra-plugin-architecture-plan-v1.md` — complete architecture, WIT contracts, capability model
- `docs/05-extensibility/tundra-additional-core-plugins-v1.md` — reference implementations (MCP server, Cloudflare DNS, Mailgun)
- `docs/05-extensibility/tundra-plesk-migration-plan-v1.md` — Plesk migration plugin (the reference core plugin)
- `proto/wit/` — WIT interface definitions
