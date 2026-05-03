# tundra-agent-bin

Binary crate that produces the `tundra-agent` executable — the per-server agent daemon.

## Role

Runs on every managed server. Communicates with `tundrad` over mTLS gRPC (port 7447 in multi-host mode; Unix domain socket in single-host mode). Responsibilities:

- Sends periodic heartbeats to `tundrad`
- Receives desired-state documents and reconciles actual state (`tundra-agent-reconciler`)
- Provisions and configures services (Nginx, PHP-FPM, PostgreSQL, Valkey, systemd units)
- Streams server and application metrics to `tundrad`
- Ships application logs to `tundrad`

## Startup sequence

1. Load `/var/lib/tundra-agent/agent.toml`
2. Load mTLS client certificate from `credentials/`
3. Connect to `tundrad` gRPC endpoint
4. Start heartbeat loop + reconciler loop + metrics loop

## Build

```bash
cargo build --release -p tundra-agent-bin
# Binary at: target/release/tundra-agent
```
