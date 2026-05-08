---
title: Configuration Reference
description: All tundrad configuration keys with examples.
sidebar:
  order: 4
---

Configuration is loaded by Figment in priority order (later overrides earlier):

1. Built-in defaults
2. `/etc/tundra/tundrad.toml` (or path set by `TUNDRA_CONFIG`)
3. `TUNDRA_`-prefixed environment variables (`__` = nesting separator)
4. `DATABASE_URL` environment variable (convenience alias)

## Full reference

```toml
[server]
listen_addr         = "0.0.0.0"          # Bind address
port                = 7400               # HTTP API port
grpc_port           = 7447               # gRPC port for agent mesh
public_url          = "https://panel.example.com"
shutdown_grace_secs = 30

[database]
url             = "postgres://tundra@/tundra?host=/var/run/postgresql"
max_connections = 50

[valkey]
url      = "redis://localhost:6379"
db_cache = 0
db_queue = 1

[security]
master_key_path        = "/var/lib/tundra/data/master.key"
session_max_age_hours  = 720   # 30 days
require_2fa_for_owners = true
step_up_window_secs    = 300   # 5 minutes

[agent]
heartbeat_interval_secs   = 30
cert_validity_days         = 365
cert_renewal_window_days   = 30

[paths]
data_dir      = "/var/lib/tundra/data"
log_dir       = "/var/lib/tundra/logs"
artifacts_dir = "/var/lib/tundra/artifacts"

[plugins]
sandbox_fuel_per_invocation = 100_000_000   # Wasmtime fuel
sandbox_memory_max_bytes    = 268_435_456   # 256 MB

[telemetry]
otlp_endpoint = ""              # Leave empty to disable OTLP export
log_format    = "json"          # "json" or "pretty"
log_level     = "info"          # Overridden by RUST_LOG
```

## Environment variable mapping

| Env var | TOML equivalent |
|---------|----------------|
| `DATABASE_URL` | `database.url` |
| `TUNDRA_DATABASE__URL` | `database.url` |
| `TUNDRA_DATABASE__MAX_CONNECTIONS` | `database.max_connections` |
| `TUNDRA_SERVER__PORT` | `server.port` |
| `TUNDRA_SECURITY__MASTER_KEY_PATH` | `security.master_key_path` |
| `TUNDRA_TELEMETRY__OTLP_ENDPOINT` | `telemetry.otlp_endpoint` |
| `RUST_LOG` | Controls tracing-subscriber directly |

## Master key

The master key is a 32-byte random value + 32-byte BLAKE3 integrity trailer (64 bytes total on disk).

Generate:
```bash
tundrad master-key generate --path /var/lib/tundra/data/master.key
```

Verify:
```bash
tundrad master-key verify --path /var/lib/tundra/data/master.key
```

**Back this up.** If lost, all encrypted data (TOTP secrets, API keys, env vars, DKIM private keys) is unrecoverable.
