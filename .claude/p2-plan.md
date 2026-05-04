# P2 Single-host MVP — Execution Plan

Branch: `p2-mvp` off `p1-foundation`

## Tasks

- [ ] T1: Proto + gRPC scaffold — proto3 definitions, tundra-proto crate with prost/tonic codegen
- [ ] T2: Agent CA (PKI) — CA bootstrap, agent cert issuance, rotation, SAN binding
- [ ] T3: Agent crates — tundra-agent-bin, tundra-agent-rpc, tundra-agent-reconciler, tundra-agent-providers (nginx/php-fpm/systemd/pkg), tundra-agent-metrics, tundra-agent-logs
- [ ] T4: Server enrolment — migrations (servers/agent_credentials/services/packages/firewall_rules), REST endpoints, setup token flow, gRPC cert exchange
- [ ] T5: Sites + Applications + Deployments — migrations (sites/applications/deployments/env_vars/releases/aliases/health_checks), REST endpoints, domain service
- [ ] T6: Deploy pipeline — DeploySite RPC impl, fetch→build→assemble→health-check→promote stages, atomic symlink, streaming progress, rollback
- [ ] T7: ACME (tundra-acme) — migrations (certificates/acme_accounts), HTTP-01 + DNS-01, auto-renewal job, pebble integration test
- [ ] T8: WebSocket + Valkey events — /ws/v1/events, subscription model, event catalog, Valkey pub/sub, 5-min replay
- [ ] T9: Job queue (tundrad-jobs) — durable jobs table worker, Valkey simple-job queue, per-kind concurrency
- [ ] T10: Panel UI — /servers, /servers/new wizard, /servers/:id, /sites, /sites/new wizard, /sites/:id with tabs + live deploy view
- [ ] T11: E2e Playwright specs — setup-wizard, add-server, create-site, deploy-rollback
- [ ] T12: Commits + v0.2.0 tag

## Dependency graph

T1 → T2, T3, T4
T2 → T4
T3 + T4 → T5, T6
T5 → T7, T8, T9
T8, T9 → T10
T10 → T11
T11 → T12

## Parallel rounds

Round 1: T1 (proto scaffold)
Round 2: T2 (PKI) ‖ T3 (agent crates) — parallel
Round 3: T4 (server enrolment) → starts after T2 done
Round 4: T5 (sites domain) ‖ T6 (deploy pipeline) — after T4
Round 5: T7 (ACME) ‖ T8 (WebSocket) ‖ T9 (jobs) — after T5
Round 6: T10 (panel) — after T8+T9
Round 7: T11 (e2e) → T12 (tag)

## Exit criteria

- cargo check --workspace clean
- cargo test --workspace (unit) passing
- pnpm typecheck + pnpm lint clean
- Integration tests pass with Docker
- Playwright e2e passes against docker-compose stack
