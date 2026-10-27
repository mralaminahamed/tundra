<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/07-brand/brand/logos/tundra-lockup-horizontal.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/07-brand/brand/logos/tundra-lockup-horizontal.svg">
  <img src="docs/07-brand/brand/logos/tundra-lockup-horizontal.svg" alt="Tundra" height="40">
</picture>

<br />
<br />

**The open-source server management platform.**  
Manage sites, databases, DNS, mail, and deployments — from a single panel.

<br />

[![Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue?color=4a6fa5)](LICENSE)

<br />

[**Docs**](https://mralaminahamed.github.io/tundra) &nbsp;·&nbsp;
[**Changelog**](CHANGELOG.md) &nbsp;·&nbsp;
[**Discussions**](https://github.com/mralaminahamed/tundra/discussions) &nbsp;·&nbsp;
[**Issues**](https://github.com/mralaminahamed/tundra/issues)

</div>

<br />

---

Tundra is a self-hosted alternative to Plesk and cPanel — built in Rust, with no licensing fees. It manages the full lifecycle of web infrastructure: provisioning, deployments, DNS, databases, mail, backups, and monitoring, all from one panel.

```bash
curl -fsSL https://raw.githubusercontent.com/mralaminahamed/tundra/main/installer/install.sh | sudo bash
```

> Supported by the installer: Ubuntu 24.04, Debian 12/13, RHEL 9/10. After install, visit the printed URL to complete first-time setup.

---

## Status

This project is under development. The statements below were checked against the source. Items not listed here were not assessed.

**Implemented**
- Control plane API: Axum router, SQLx repositories and forward-only migrations on PostgreSQL (`crates/tundrad-api`, `crates/tundrad-repo`, `migrations/`).
- Audit log hash chain, computed by a SQL trigger with `sha3-256` (`migrations/20260503000001_identity_and_access.sql`). Rust code does not verify the chain.
- Deploy release assembly, atomic `current` symlink swap and retention of the five newest releases (`crates/tundra-agent-providers/src/deploy.rs`).
- 13 site templates and 30 DNS templates (`templates/`), and the installer's OS checks (`installer/install.sh`).

**Partial**
- Blue/green deploys: the symlink swap and slot naming work. Starting the slot, the health check and stopping the old slot only write log lines (`deploy.rs`, "Stub: would ...").
- Agent to control plane: the agent polls over HTTPS and identifies itself with an `X-Tundra-Server-Id` header, and the client accepts any server certificate (`crates/tundra-agent-reconciler/src/tundra_client.rs`).
- Wasmtime plugin host: a library with a capability gate and fuel, epoch and memory limits (`crates/tundrad-plugin-host`). No binary uses it yet. The MCP plugin is linked into `tundrad-api`.
- Cross-server site move: eight stages are defined (`crates/tundrad-domain/src/site_move.rs`). The pipeline is a stub that records each stage name and completes the move (`crates/tundrad-api/src/routes/site_moves.rs`).
- CSRF and step-up middleware exist in `crates/tundrad-api/src/middleware/` but are not applied to the router.

**Planned (no implementation found)**
- mTLS gRPC between control plane and agents. `crates/tundra-agent-rpc` has only a plaintext client and no binary starts a gRPC server.
- Deployment rollback. `RollbackSite` is declared in `proto/tundra/v1/agent.proto` but nothing implements it.
- SLSA provenance for releases. See [docs/slsa.md](docs/slsa.md).

**Build and CI**
- GitHub Actions is disabled on this repository, so no workflow currently runs.
- `main` does not compile as a whole. `tundrad-api` and `tundrad-bin` fail because the `sqlx::query!` macros need a `DATABASE_URL` or a committed `.sqlx` offline cache, and neither exists. `tundrad-crypto`, `tundrad-domain`, `tundrad-plugin-github`, `tundrad-plugin-namecheap` and `tundrad-self-backup` fail on dependency API changes (`rand`, `hmac`, `time`, `sha2`). The branch `fix/compile` has fixes for these five, without a PR.
- The other 29 workspace crates built and passed 114 tests locally, with no PostgreSQL or Valkey available. Tests that need those services were not run.
- `cargo fmt --all --check` fails with the pinned stable toolchain because `rustfmt.toml` uses nightly-only options. The code is clean under nightly. Clippy with `-D warnings` also fails.

---

## Features

**Sites & deployments**
- Runtimes: PHP (PHP-FPM), Node.js, Python, Go, Rust, Ruby, .NET
- Blue/green deploys with atomic symlink swap and retention of the 5 newest releases (slot start and health checks are stubs; no rollback operation yet)
- 13 starter templates (WordPress, Laravel, Next.js, Django, Rails, …)
- Daemons and cron-style scheduled tasks per site

**WordPress**
- Full WP-CLI lifecycle: install, configure, reprovision
- Per-install MySQL database isolation with auto-generated credentials
- Plugin and theme management directly from WP.org
- Staging, cloning, and one-click promotion

**File manager**
- In-browser code editor (CodeMirror, 50+ language modes)
- Upload, download (including directory as ZIP), copy, move, delete
- Right-click context menu; API-driven directory tree

**Infrastructure**
- Multi-server fleet with SSH-based agent install (agents use HTTPS today; mTLS gRPC is planned)
- Cross-server site move: eight stages defined, pipeline is a stub
- PowerDNS zone editor + 30 provider-ready DNS templates
- Postfix + Dovecot + Rspamd + DKIM mail stack per domain
- restic + GPG backups to S3, B2, R2, Wasabi, SFTP, or local

**Platform**
- Wasmtime plugin host library with WIT SDK, capability gate and resource limits (not yet wired into `tundrad`)
- MCP server — connect Claude Code, Claude Desktop, Cursor, Zed
- Per-server + per-site metrics, alert rules, delivery channels (email, Slack, Discord)
- Audit log with a SHA-3/256 chain hash computed in SQL; release workflow that calls the SLSA Level 3 generator (no release has run it)

---

## Architecture

```
  Browser / Claude / Cursor
         │  HTTPS + WebSocket
         ▼
  ┌─────────────────────────────┐
  │  tundrad  (control plane)   │
  │  Axum · SQLx                │
  │  PostgreSQL 18 · Valkey 8   │
  └─────────────┬───────────────┘
                │  HTTPS (agent polls)
       ┌────────┴────────┐
       ▼                 ▼
  tundra-agent      tundra-agent
  (server-01)       (server-02)
  Caddy · PHP-FPM   Caddy · Node
  systemd units     systemd units
```

Each managed server runs `tundra-agent`, which polls `/api/v1/agent/deployments` on the control plane over HTTPS. The mTLS gRPC channel on port 7447 and the Unix socket mode for single-host installs are designed (`proto/tundra/v1/agent.proto`, `crates/tundrad-grpc`, `crates/tundra-agent-rpc`) but are not used by the binaries. The Wasmtime plugin host (`crates/tundrad-plugin-host`) is not linked into `tundrad`. PostgreSQL 18 and Valkey 8 are the versions in the Docker Compose bundles under `docs/09-deployment-bundle/`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Quickstart

**One-line install (systemd)**

```bash
curl -fsSL https://raw.githubusercontent.com/mralaminahamed/tundra/main/installer/install.sh | sudo bash
```

**Docker Compose (dev)**

```bash
git clone https://github.com/mralaminahamed/tundra
cd tundra/docs/09-deployment-bundle/dev
cp .env.example .env
docker compose up -d
# open http://localhost:5173
```

**Docker Compose (production)**

```bash
cd tundra/docs/09-deployment-bundle/prod
cp .env.example .env          # set TUNDRA_HOSTNAME, ACME_EMAIL
bash scripts/generate-secrets.sh
docker compose up -d
```

---

## Building

```bash
# Rust workspace
cargo build --release --workspace

# React panel
cd panel && pnpm install && pnpm build

# Tests
cargo test --workspace
cd panel && pnpm typecheck && pnpm lint && pnpm test --run
```

---

## Documentation

Full docs → **[mralaminahamed.github.io/tundra](https://mralaminahamed.github.io/tundra)**

| Guide | |
|---|---|
| [Getting Started](https://mralaminahamed.github.io/tundra/getting-started/introduction/) | Install, enroll a server, deploy your first site |
| [Self-Hosting](https://mralaminahamed.github.io/tundra/self-hosting/overview/) | Docker Compose, systemd, config reference, security hardening |
| [API Reference](https://mralaminahamed.github.io/tundra/api/overview/) | REST endpoints, authentication, pagination, WebSocket events |
| [Plugin Development](https://mralaminahamed.github.io/tundra/plugins/building-plugins/) | Wasmtime sandbox, WIT SDK, host capabilities |
| [MCP Integration](https://mralaminahamed.github.io/tundra/plugins/mcp/) | Connect Claude Code, Claude Desktop, Cursor, Zed |
| [Contributing](https://mralaminahamed.github.io/tundra/contributing/developer-guide/) | Architecture, conventions, hard constraints, PR checklist |

---

## Contributing

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md). Before opening a PR:

```bash
cargo +nightly fmt --all   # rustfmt.toml uses nightly-only options
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd panel && pnpm typecheck && pnpm lint && pnpm test --run
```

The CI workflow (`.github/workflows/ci.yml`) runs these checks with clippy `--all-features`, plus `cargo audit`, `cargo deny check` and `pnpm audit`. Its Rust tests use PostgreSQL 16 and Valkey 8 service containers. The workflow does not run while Actions is disabled (see Status).

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/mralaminahamed/tundra/security/advisories/new) — not as public issues.

---

## License

Apache-2.0 © 2026 [Al Amin Ahamed](https://github.com/mralaminahamed)
