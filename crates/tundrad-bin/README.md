# tundrad-bin

Binary crate that produces the `tundrad` executable — the Tundra control-plane daemon.

## Role

Wires together every library crate (`tundrad-api`, `tundrad-auth`, `tundrad-repo`, `tundrad-config`, `tundrad-telemetry`, …) and exposes three sub-commands:

| Sub-command | Purpose |
|-------------|---------|
| `tundrad serve` | Start the HTTP + gRPC server |
| `tundrad migrate` | Apply pending database migrations |
| `tundrad master-key` | Generate or rotate the master encryption key |

## Startup sequence

1. Load config (`tundrad-config`) — TOML file + `TUNDRA_` env vars
2. Verify master key (`tundrad-crypto`) — refuses to start on integrity failure
3. Run pending migrations (`sqlx migrate run`)
4. Initialise tracing (`tundrad-telemetry`)
5. Connect to PostgreSQL + Valkey
6. Start Axum HTTP server + Tonic gRPC server concurrently

## Build

```bash
cargo build --release -p tundrad-bin
# Binary at: target/release/tundrad
```
