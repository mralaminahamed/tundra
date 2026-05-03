# tundrad-grpc

Tonic 0.13 gRPC service implementations for the Tundra control plane.

## Services

Implements the `tundra.agent.v1.Agent` service defined in `proto/tundra/v1/agent.proto`.

| RPC | Description |
|-----|-------------|
| `Heartbeat` | Agent liveness ping; updates `servers.agent_last_seen_at` |
| `DeploySite` | Stream deployment progress from agent to control plane |
| `StreamMetrics` | Bidirectional metrics stream (agent → control plane) |
| `ReportLogs` | Log line shipping from agent to control plane |
| `FetchDesiredState` | Agent polls for its desired configuration document |

## Transport

mTLS only on port `7447`. No plaintext fallback. The agent presents a short-lived client certificate issued and rotated by `tundrad`. Certificate validation uses the internal mTLS CA stored at `/var/lib/tundra/data/ca/`.

## Code generation

Proto stubs are generated at build time via `build.rs` using `tonic-build`.
