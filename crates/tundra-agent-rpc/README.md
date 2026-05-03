# tundra-agent-rpc

Tonic gRPC client for the `tundra.agent.v1.Agent` service. Used by `tundra-agent-bin` to communicate with `tundrad`.

## Transport

mTLS over port 7447 (multi-host) or a Unix domain socket (single-host). The agent presents a short-lived client certificate issued by `tundrad`'s internal CA. Certificate rotation is handled transparently — the gRPC channel reconnects with the new certificate before the old one expires.

## Generated code

Stubs are generated from `proto/tundra/v1/agent.proto` at build time via `tonic-build` in `build.rs`.

## Client usage

```rust
let channel = tundra_agent_rpc::connect("https://tundrad-host:7447", tls_config).await?;
let mut client = AgentServiceClient::new(channel);
client.heartbeat(HeartbeatRequest { … }).await?;
```
