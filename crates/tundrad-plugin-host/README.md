# tundrad-plugin-host

Wasmtime-based sandbox for executing Tundra plugins. Enforces capability gates, fuel limits, and memory limits.

## Isolation model

Each plugin runs in a dedicated Wasmtime `Engine` + `Store`. The host exposes a WIT-defined interface (`tundra:plugin/host@v1`) that gates all outbound operations through capability checks.

## Limits (per plugin invocation)

| Resource | Limit |
|----------|-------|
| Fuel (CPU) | 1 billion units (configurable per plugin) |
| Linear memory | 64 MiB (configurable, hard cap 256 MiB) |
| Epoch deadline | 5 seconds wall-clock |

## Capability model

Plugins declare required capabilities in their manifest. `tundrad` prompts the operator to grant capabilities at install time. Capabilities are stored in `plugin_capabilities` and checked on every host-call dispatch.

| Capability | What it allows |
|------------|----------------|
| `db:read` | SELECT on scoped tables |
| `db:write` | INSERT/UPDATE on scoped tables |
| `http:outbound` | Outbound HTTP to allowlisted hosts |
| `shell:exec` | Execute pre-approved shell commands on managed servers |

## Plugin data

Each plugin gets a private key-value store (`plugin_kv`) and a disk quota (`plugin_data_quotas`). Direct filesystem access outside the quota path is denied.
