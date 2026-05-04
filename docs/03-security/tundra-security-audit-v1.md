# Tundra — Security Audit (Engineering Edition)

> The technical security reference for Tundra. STRIDE threat model, controls catalog, attack trees, cryptographic design, and the testing posture that backs all of it.
> Companion to the Operator Edition; this document picks up where that one says "see the Engineering Edition."

---

## 1. Purpose & Scope

This document is the engineering-facing security specification for Tundra. It exists so that:

- Anyone modifying authentication, authorization, cryptography, the agent protocol, the plugin sandbox, or the audit pipeline has a reference they can validate their change against.
- Reviewers can map a code change to a documented threat and a documented control.
- A future security audit (internal or external) has a starting point that already enumerates the assets, threats, controls, and testing approach.

**Scope.** The Tundra control plane (`tundrad`), the agent (`tundra-agent`), the CLI (`tundra`), the Wasm plugin sandbox (Wasmtime), the panel UI (Vite/React), and the data at rest in PostgreSQL 18 + on-disk paths. Excludes the host OS itself except where Tundra issues hardening guidance, and excludes third-party services Tundra integrates with (DNS providers, ACME directories, SMTP relays, object storage backends) except at the trust boundary.

**Threat model methodology.** STRIDE per asset, with attack trees for the four highest-impact compromise scenarios. Controls are mapped back to OWASP ASVS L2 where applicable.

---

## 2. Trust Boundaries

Tundra has six trust boundaries. Crossing any of them requires authentication, authorization, input validation, and audit.

```
┌────────────────────────────────────────────────────────────────────┐
│  External: browsers, CI runners, MCP clients, webhooks (inbound)   │
└────────────────────────────────────────────────────────────────────┘
                              │  TLS 1.3, session/API token, CSRF
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  tundrad (control plane)                                           │
│  ─ panel REST  ─ webhook receivers  ─ MCP server  ─ admin gRPC     │
└────────────────────────────────────────────────────────────────────┘
                              │  mTLS, per-agent client cert
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  tundra-agent (per managed server)                                 │
│  ─ executes shell, manages systemd, edits config, talks to PG/MX   │
└────────────────────────────────────────────────────────────────────┘
                              │  Unix sockets, file ACLs, drop-priv
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  Workloads on managed server                                       │
│  ─ web servers (Caddy/nginx)  ─ PHP-FPM pools  ─ Postfix/Dovecot   │
│  ─ MariaDB/Postgres  ─ site filesystems (per-site uid)             │
└────────────────────────────────────────────────────────────────────┘

Lateral boundary: plugins (Wasm) ↔ tundrad host process
                   capability grants, fuel/memory limits
```

The trust boundaries are:

1. **Browser ↔ panel.** TLS, session cookies, CSRF, content security policy.
2. **External integration ↔ panel.** API tokens (REST), MCP session tokens, webhook signatures.
3. **Control plane ↔ agent.** mTLS with per-agent client certificates issued by the Tundra-internal CA.
4. **Agent ↔ workload.** OS-level isolation: per-site Unix UID/GID, filesystem ACLs, `chroot` for PHP-FPM pools where supported, systemd unit hardening for managed services.
5. **Plugin sandbox ↔ host.** Wasmtime isolation, capability-based interface (only what the plugin manifest declares can be called), fuel/memory limits, no ambient network or filesystem.
6. **Tundra ↔ third-party services.** Outbound TLS verification, per-provider credentials encrypted at rest, ACME challenge isolation.

---

## 3. Asset Inventory

| Asset                        | Location                                                  | Sensitivity                    | Owner           |
|------------------------------|-----------------------------------------------------------|--------------------------------|-----------------|
| Operator passwords           | `operators.password_hash` (Argon2id)                      | Critical                       | Identity module |
| Passkeys                     | `passkeys` table (public key + counter)                   | High (impersonation if forged) | Identity module |
| TOTP secrets                 | `operators.totp_secret_encrypted` (AES-256-GCM)           | Critical                       | Identity module |
| Recovery codes               | `operators.recovery_codes_encrypted` (AES-256-GCM)        | Critical                       | Identity module |
| Session tokens               | HttpOnly cookies + `sessions` table                       | High                           | Identity module |
| API tokens                   | `api_tokens.token_hash` (SHA-256, prefix shown)           | High                           | Identity module |
| **Master key**               | `/var/lib/tundra/master.key` (mode 0400, root)            | **Catastrophic**               | Crypto module   |
| Per-column data keys         | Derived via HKDF from master key, in memory only          | Catastrophic                   | Crypto module   |
| Agent CA private key         | `/var/lib/tundra/ca/ca.key` (mode 0400)                   | Critical                       | Agent module    |
| Agent client certs (private) | On agent host, mode 0400, owned by `tundra-agent`         | High (per server)              | Agent module    |
| JWKS signing keys            | `/var/lib/tundra/jwks/` (rotating)                        | High                           | Identity module |
| Third-party provider secrets | Encrypted columns in `plugin_settings`, etc.              | High                           | Plugin module   |
| Audit log                    | `audit_log` (append-only by convention) + Parquet archive | High (integrity)               | Audit module    |
| Site filesystems             | `/srv/sites/<uid>/...` per managed site                   | Variable (operator data)       | Sites module    |
| Backups                      | Operator-configured target + self-backup target           | Critical                       | Backups module  |
| Mail content                 | Postfix queue, Dovecot maildirs on managed servers        | Variable (operator data)       | Mail module     |

The two assets whose compromise is **catastrophic** (no realistic recovery without operator intervention) are the **master key** and the **agent CA private key**. Section 8 covers their lifecycle in detail.

---

## 4. STRIDE — Per-Asset Analysis

STRIDE: **S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege.

### 4.1 Operator identities

| Threat                             | Vector                             | Control                                                                                                                                                                          |
|------------------------------------|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — credential stuffing        | Reused password leaked elsewhere   | HIBP k-anonymity check on set; rate limit 10/IP/hour; per-account lockout warning at 5 failed attempts; passkeys preferred and surfaced as default option                        |
| **S** — passkey forgery            | WebAuthn implementation flaw       | Use `webauthn-rs` (vetted upstream); enforce attestation conveyance preference where operator opts in; counter monotonicity check on every assertion                             |
| **T** — session hijack             | XSS, network MITM, cookie theft    | HttpOnly + `Secure` + `SameSite=Strict` cookies; CSP `default-src 'self'`; HSTS with preload; no `Authorization: Bearer` in browser flows; rotate session ID on privilege change |
| **R** — repudiation of action      | Operator denies destructive action | Audit log records actor, IP, user-agent, request ID, before/after diff for mutating actions; append-only convention; out-of-band Parquet archive                                 |
| **I** — TOTP secret disclosure     | DB read by attacker                | TOTP secret encrypted at rest under master-key-derived data key; never logged; never returned by any API after initial enrolment QR                                              |
| **D** — lockout via password spray | Mass-fail to lock accounts         | Per-IP rate limit precedes per-account counter; per-account lockout never *blocks* sign-in, only forces step-up via passkey or recovery code                                     |
| **E** — role escalation            | Privilege check bypass             | Centralized `Authz` service; every handler calls `authz.require(actor, action, resource)`; integration test asserts every route declares its required permission                 |

**Argon2id parameters.** memory_cost = 64 MiB, time_cost = 3, parallelism = 1. Reviewed annually. Re-hash on next sign-in if parameters change. Version stored in hash prefix.

**Sessions.** Cookie holds opaque 256-bit ID. Server-side row in `sessions` records `operator_id`, `ip_inet`, `user_agent`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`. Revoked rows are kept for the audit window (90 days) before purge. Sliding expiry: `last_seen_at` updated on activity, max session lifetime is 30 days regardless.

**Step-up.** Operations classified `sensitive` (delete server, rotate master key, issue API token with cluster-admin scope) require fresh authentication within the last 5 minutes. The handler asserts `session.last_full_auth_at > now() - interval '5 minutes'`, returning HTTP 401 with `WWW-Authenticate: TundraStepUp` if not. The panel responds by re-prompting for password/passkey without losing form state.

### 4.2 Master key

| Threat                       | Vector                                                 | Control                                                                                                                                                                                                                                      |
|------------------------------|--------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — fake master key      | Attacker replaces file to decrypt their own ciphertext | Master key file checksummed against startup expectation in `tundrad.toml` lock file; mismatch refuses to start                                                                                                                               |
| **T** — silent corruption    | Disk error mangles the key                             | Key file is 32 bytes raw + 32-byte BLAKE3 of the key appended; load verifies hash before use; mismatch refuses to start with operator-facing error pointing at the recovery procedure                                                        |
| **R** — N/A                  |                                                        |                                                                                                                                                                                                                                              |
| **I** — file disclosure      | Read by another process                                | File is mode 0400 owned by `tundra:tundra`; `tundrad` runs with `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`; only the data dir is `ReadWritePaths`; key never logged, never serialised, never sent over the agent protocol |
| **D** — denial of decryption | File deleted                                           | Documented recovery from offline GPG copy; refusal to start with clear log message                                                                                                                                                           |
| **E** — N/A                  |                                                        |                                                                                                                                                                                                                                              |

**Derivation.** The master key is the input keying material. Per-column-family data keys are derived via HKDF-SHA256 with a per-family info string, e.g. `tundra:v1:identity:totp_secret`, `tundra:v1:plugin_settings:secret`. Rotation of a column family means re-encrypting that column under a new info string; rotation of the master key means re-wrapping all derived keys (Tundra never persists derived keys; rotation is achieved by re-encrypting all ciphertexts under HKDF of the new master, in a streamed background job).

**File format.**

```
+--------+------------------+----------------------+
| Bytes  | Content                                 |
+--------+------------------+----------------------+
| 0..32  | Master key material (32 bytes)          |
| 32..64 | BLAKE3-256 of bytes 0..32               |
+--------+------------------+----------------------+
```

Total 64 bytes. Mode 0400. Owner `tundra:tundra`.

### 4.3 Agent fleet

| Threat                                                             | Vector                                             | Control                                                                                                                                                                                                                                                                                                            |
|--------------------------------------------------------------------|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — rogue agent                                                | Attacker presents forged client cert               | Internal CA; every agent cert SAN includes `URI:tundra-agent://server-<uuid>`; control plane rejects if SAN doesn't match an enrolled `servers.id` and `agent_credentials.cert_serial`                                                                                                                             |
| **T** — replay of agent message                                    | Captured ciphertext replayed                       | TLS 1.3 forbids replay of 0-RTT for our endpoints; gRPC Heartbeat carries monotonically increasing nonce; control plane rejects nonce ≤ last seen for that agent                                                                                                                                                   |
| **R** — agent denies action                                        | Compromised agent claims it never received command | Every command from control plane is recorded in `audit_log` with `agent_request_id`; agent records the same in its local journal; reconciliation job flags divergence                                                                                                                                              |
| **I** — eavesdrop                                                  | Network attacker on the path                       | mTLS 1.3 only; no plaintext fallback; cipher suites restricted to AEAD: `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`, `TLS_AES_128_GCM_SHA256`                                                                                                                                                         |
| **D** — flood control plane with heartbeats                        | Compromised or buggy agent                         | Per-agent rate limit (100 RPS heartbeat, 10 RPS for other RPCs); circuit breaker opens at sustained breach, `agent_credentials.suspended_at` set, agent must be re-enrolled                                                                                                                                        |
| **E** — agent escalates from "managed" to "admin" of control plane | Bug in command surface                             | The agent ↔ control-plane RPC is unidirectional in command flow: control plane *commands*, agent *reports*. The agent has no RPC that mutates control-plane state other than recording stream output and metrics. Authz check on the few that exist asserts the agent identity matches the resource's `server_id`. |

**Certificate lifecycle.** Issued at enrolment via setup token. Subject: `CN=tundra-agent`, SAN includes `URI:tundra-agent://server-<uuid>`. Validity 90 days. Auto-renewed at 30 days remaining via gRPC `RenewCertificate` over the existing mTLS channel. CA root stored at `/var/lib/tundra/ca/ca.key` mode 0400. CA certificate distributed to agents in their bundle; rotation procedure documented in the deployment runbook (24-hour trust-on-overlap).

**Setup tokens.** 32-byte random, base64url. Single-use, expire in 24 hours, scoped to one server enrolment. Stored as SHA-256 hash. Cleared on use.

### 4.4 Plugin sandbox

| Threat                                   | Vector                                     | Control                                                                                                                                                                                                                            |
|------------------------------------------|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — plugin impersonates another      | Plugin claims a capability it doesn't have | Capability registry derived from signed plugin manifest; runtime check on every host-call; capabilities are `<plugin_id>:<verb>:<resource>` strings, not bearer tokens                                                             |
| **T** — plugin tampers with audit log    | Direct DB write                            | Plugins have no DB connection; all DB reads go through declared, parameterised SQL declared in the plugin manifest and validated at install time; mutations require the plugin to invoke a host-side capability that itself audits |
| **R** — N/A                              |                                            |                                                                                                                                                                                                                                    |
| **I** — plugin reads memory it shouldn't | Wasm sandbox escape                        | Wasmtime with epoch-based deadlines, fuel limits, memory limits, no `wasi-filesystem` preopens, no `wasi-sockets` by default; capability bestowed via WIT interface                                                                |
| **D** — plugin consumes all CPU/memory   | Infinite loop, allocation bomb             | Fuel limit per invocation (default 10 million); memory limit per instance (default 128 MiB); epoch-based interruption every 100ms; OOM aborts the invocation only                                                                  |
| **E** — plugin escapes sandbox           | Wasmtime CVE                               | Pin to vetted Wasmtime release; subscribe to security advisories; track via `cargo-deny`; defence in depth: `tundrad` runs unprivileged; even a hypothetical Wasm escape lands in `tundra:tundra`, not root                        |

**WIT contracts.** Every host-import is declared in a versioned WIT file. Plugins compile against the declared interface; the runtime refuses to load a plugin whose imports don't match the WIT contract version it declares.

**Declared SQL.** A plugin that needs to read its own settings does so via host-call `plugin.settings.get`, not by issuing arbitrary SQL. A plugin that wants to record a custom event does so via host-call `audit.record`, which adds the plugin id as actor and disallows mutation of pre-existing rows.

### 4.5 Audit log

| Threat                                             | Vector                                                      | Control                                                                                                                                                                                                                           |
|----------------------------------------------------|-------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — forged actor                               | Compromised handler writes audit row with someone else's ID | The audit row is written by the same transaction as the action; actor is taken from the request's authenticated principal, not the request body                                                                                   |
| **T** — log entry deleted                          | DB compromise                                               | Append-only by convention enforced at the application layer (no `DELETE` on `audit_log` from any handler); periodic Parquet archive to write-once object storage; checksum chain (each row's `chain_hash = BLAKE3(prev_chain_hash || row_canonical_json)`) detects retroactive edits |
| **R** — N/A (this is the anti-repudiation control) |                                                             |                                                                                                                                                                                                                                   |
| **I** — sensitive data in log                      | Engineer logs request body                                  | Redaction pipeline: known-sensitive field names (`password`, `token`, `secret`, `private_key`, `recovery_code`) are replaced with `<redacted:N-bytes>` before persistence; audit records include `redactions_applied` count       |
| **D** — log table bloat                            | High-traffic action floods log                              | Partitioning by month; cold partitions detached and archived to Parquet quarterly; retention 90 days online + 7 years archive                                                                                                     |
| **E** — N/A                                        |                                                             |                                                                                                                                                                                                                                   |

**Chain hash.** Each row carries a `chain_hash` column populated by trigger:

```sql
CREATE FUNCTION audit_log_chain_hash() RETURNS TRIGGER AS $$
DECLARE
    prev_hash BYTEA;
    canonical JSONB;
BEGIN
    SELECT chain_hash INTO prev_hash
    FROM audit_log
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1;

    IF prev_hash IS NULL THEN
        prev_hash := '\x00'::BYTEA;
    END IF;

    canonical := jsonb_build_object(
        'id',           NEW.id,
        'occurred_at',  NEW.occurred_at,
        'actor_type',   NEW.actor_type,
        'actor_id',     NEW.actor_id,
        'action',       NEW.action,
        'resource',     NEW.resource,
        'before',       NEW.before,
        'after',        NEW.after
    );

    NEW.chain_hash := digest(
        prev_hash || convert_to(canonical::TEXT, 'UTF8'),
        'sha3-256'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

A periodic verification job recomputes the chain end-to-end and alerts on divergence. The chain isn't tamper-proof against an attacker with `tundrad` and DB write — it's tamper-evident, which is the realistic guarantee for a single-host design.

### 4.6 Workload data on managed servers

| Threat                              | Vector                                   | Control                                                                                                                                                                                              |
|-------------------------------------|------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — site A reads site B's files | Path traversal, symlink, shared web user | Each site runs under its own Unix UID; document root is `/srv/sites/<uid>/web`, mode 0750, owned by site UID, group `tundra`; PHP-FPM pool runs as site UID with `open_basedir` set to the site root |
| **T** — site modifies system config | Vulnerable app writes to `/etc`          | Sites have no write permission outside their site root; managed config files are owned by `tundra-agent` and protected with file ACLs                                                                |
| **R** — N/A                         |                                          |                                                                                                                                                                                                      |
| **I** — backup contents leak        | Backup target compromise                 | Backups encrypted with operator-supplied GPG public key before leaving the agent; no plaintext at rest in operator's S3 bucket                                                                       |
| **D** — disk exhaustion by one site | Unbounded log growth                     | Per-site quota enforced via XFS project quotas (where available) or filesystem-level disk quota; soft warning at 80%, hard refusal at 100%                                                           |
| **E** — site escalates to root      | LFI in PHP                               | Site UID isolation contains the blast radius; agent runs as `tundra-agent`, not root, and uses sudoers rules with explicit command allow-list for the few privileged operations needed               |

---

## 5. Cryptographic Design

### 5.1 At rest

| Use case                                           | Algorithm                                             | Key source                                                 |
|----------------------------------------------------|-------------------------------------------------------|------------------------------------------------------------|
| Operator passwords                                 | Argon2id, m=64MiB t=3 p=1                             | Random salt per password                                   |
| Operator TOTP, recovery codes, integration secrets | AES-256-GCM (AEAD)                                    | HKDF-SHA256 from master key, per-column-family info string |
| API token storage                                  | SHA-256 (token_hash); prefix shown for identification | N/A (one-way)                                              |
| Setup tokens                                       | SHA-256 (token_hash)                                  | N/A (one-way)                                              |
| Backup encryption                                  | OpenPGP (operator-supplied recipient public key)      | Operator-managed                                           |
| Self-backup encryption                             | OpenPGP (operator-supplied recipient public key)      | Operator-managed                                           |
| Master key file integrity                          | BLAKE3-256 trailer                                    | N/A (integrity)                                            |
| Audit chain                                        | SHA3-256 over canonical JSON + previous chain hash    | N/A (integrity)                                            |

**The `EncryptedField<T>` SQLx type.** Custom decode/encode that:

1. On encode: serialises `T` to canonical JSON, generates a 96-bit random nonce, encrypts under the family data key, prepends a 1-byte version + the nonce + the ciphertext + the 128-bit auth tag.
2. On decode: parses version, splits nonce/ct/tag, decrypts, deserialises.

A `KeyRing` singleton holds the master key (loaded once at startup, zeroised on shutdown) and lazily derives family keys. Family keys live in memory only.

### 5.2 In transit

| Surface                         | Protocol         | Notes                                                                                     |
|---------------------------------|------------------|-------------------------------------------------------------------------------------------|
| Browser ↔ panel                 | TLS 1.3 only     | Behind operator's reverse proxy (Caddy default); HSTS with preload; no plaintext fallback |
| External integration ↔ REST API | TLS 1.3 only     | Same termination                                                                          |
| Webhook ↔ panel                 | TLS 1.3 inbound  | Each provider has a signing secret stored encrypted; signature verified before processing |
| Control plane ↔ agent (gRPC)    | mTLS 1.3 only    | Internal CA; pinned cipher suites                                                         |
| Tundra ↔ third-party APIs       | TLS 1.3 outbound | System trust store; per-provider pinning available but off by default                     |
| Tundra ↔ ACME                   | TLS 1.3 outbound | Standard Let's Encrypt / configured directory                                             |

**Cipher restrictions.** `rustls` is configured with the explicit cipher list above. No CBC, no RC4, no SHA-1 anywhere except where forced by upstream protocols (e.g., some DKIM verifications).

### 5.3 Random number generation

All cryptographically relevant randomness uses `getrandom`/`rand::thread_rng()` backed by the OS CSPRNG. We never read `/dev/urandom` directly except in the install script when generating the master key, and even there we use 32 bytes from `/dev/urandom` and immediately verify with `od -A n -t u1 -N 1` only as a sanity check.

### 5.4 Key rotation

| Key                | Cadence                                                | Procedure                                                                                                      |
|--------------------|--------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Operator passwords | On parameter upgrade only                              | Re-hash on next sign-in                                                                                        |
| Session tokens     | On privilege change, on sign-out, automatic at 30 days | Server-side row revoked, cookie cleared                                                                        |
| API tokens         | Operator-driven                                        | New token issued, old revoked at operator's choice                                                             |
| TOTP secrets       | Operator-driven (re-enrol)                             | New secret, old discarded                                                                                      |
| Master key         | Recommended annually or on suspicion                   | `tundra master-key rotate` (see deployment runbook §9.2)                                                       |
| Agent CA           | Recommended every 5 years or on suspicion              | 24h trust-on-overlap procedure (deployment runbook §9.3)                                                       |
| Agent client certs | Auto, every 90 days, renewed at 30 days remaining      | gRPC `RenewCertificate`                                                                                        |
| JWKS signing keys  | Quarterly                                              | New key added, old kept for verification of in-flight tokens; old discarded after `max_token_lifetime` elapses |

---

## 6. Authentication & Session Management

### 6.1 Sign-in flows

The panel offers three sign-in methods. They are presented in this order of preference, configurable per operator:

1. **Passkey** — WebAuthn assertion. Resident credentials supported. Counter-monotonicity enforced. Allowed credential IDs filtered by `username` lookup so an attacker can't enumerate registered passkeys.
2. **Password + TOTP** — Argon2id verify, then TOTP verify in the same form submission. The flow does not reveal *which* factor failed; the response is "credentials invalid" for any failure mode.
3. **Password + recovery code** — Last-resort path. Recovery codes are 10 codes of 16 hex chars, each single-use, presented at TOTP enrolment. Stored encrypted under master key. On use, the consumed code is marked, and the operator is shown how many remain. Below 3 remaining triggers a banner.

### 6.2 Sign-up

There is no public sign-up. The first operator (Owner) is created during setup. Subsequent operators are invited by a sufficiently privileged operator. Invitation is a 24-hour single-use token that lets the recipient set a password and enrol a passkey.

### 6.3 Session model

Sessions are server-side. The cookie is `tundra_session=<256-bit base64url>`, `HttpOnly; Secure; SameSite=Strict; Path=/`. The server-side row records the principal, IP, user-agent, last activity, and last full-auth time. CSRF is defended via SameSite=Strict + a double-submit token on state-changing requests.

### 6.4 API tokens

API tokens are an alternative principal type for non-browser callers. Format: `tnd_<env>_<random base64url>`, e.g., `tnd_prod_5xK9...`. The prefix `tnd_<env>_` is shown in the UI for identification; the rest is unrecoverable after issuance. Storage is `SHA-256(token)`. Tokens carry scopes (`sites:read`, `deploys:write`, etc.) and an optional IP allowlist.

---

## 7. Authorization

Authorization is RBAC with optional resource-scoped grants. Every handler ends with:

```rust
authz.require(actor, Action::SiteDelete, Resource::Site(site_id)).await?;
```

The `Authz` service resolves the actor's roles, applies global and resource-scoped grants, and decides. There is no "deny by default with implicit allow at the role level"; the resolution always materialises a permission set and requires the requested action to be present.

### 7.1 Built-in roles

| Role          | Scope                                                                 |
|---------------|-----------------------------------------------------------------------|
| **Owner**     | All actions, including delete-server and master-key-rotate            |
| **Admin**     | All actions except delete-server, master-key-rotate, billing settings |
| **Operator**  | All site/database/mail/backup actions on assigned servers             |
| **Read-only** | Read all resources, no mutations                                      |

Custom roles are defined as a permission set; resource-scoped grants attach a role to an `(operator, resource)` pair.

### 7.2 Action enumeration

All actions are enumerated in code:

```rust
pub enum Action {
    // Servers
    ServerRead, ServerCreate, ServerUpdate, ServerDelete,
    // Sites
    SiteRead, SiteCreate, SiteUpdate, SiteDelete, SiteDeploy, SiteRollback,
    // Backups
    BackupRead, BackupCreate, BackupRestore,
    // ... etc
}
```

A test asserts that every route handler declares its required action, and that every declared action exists in the enum.

### 7.3 Plugin capabilities

Plugins receive a per-instance capability set on grant. The capability is a string of the form `<verb>:<resource>` and is checked at the host-call boundary. The capability grant is auditable and revocable.

---

## 8. Operational Security

### 8.1 systemd hardening

The deployment runbook (engineering edition, §3.4) carries the canonical unit. The relevant directives are:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `PrivateDevices=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `ProtectKernelTunables=true`
- `ProtectKernelModules=true`
- `ProtectKernelLogs=true`
- `ProtectControlGroups=true`
- `RestrictRealtime=true`
- `RestrictNamespaces=true`
- `LockPersonality=true`
- `RestrictSUIDSGID=true`
- `SystemCallFilter=@system-service`
- `SystemCallArchitectures=native`
- `CapabilityBoundingSet=` (empty — no caps)
- `AmbientCapabilities=` (empty)

`MemoryDenyWriteExecute=` is **not** set because Wasmtime requires JIT pages. `tundrad` does not need any other writable-executable region; future hardening could move Wasm to interpreter-only mode for environments that demand W^X.

### 8.2 File permissions

| Path                         | Mode | Owner         | Notes                        |
|------------------------------|------|---------------|------------------------------|
| `/var/lib/tundra/master.key` | 0400 | tundra:tundra | Loaded once, then unchanged  |
| `/var/lib/tundra/ca/ca.key`  | 0400 | tundra:tundra | CA private key               |
| `/var/lib/tundra/ca/ca.crt`  | 0444 | tundra:tundra | CA certificate (public)      |
| `/var/lib/tundra/jwks/`      | 0700 | tundra:tundra | JWKS rotation directory      |
| `/var/lib/tundra/plugins/`   | 0750 | tundra:tundra | Plugin Wasm modules          |
| `/etc/tundra/tundrad.toml`   | 0640 | tundra:tundra | Config                       |
| `/var/log/tundra/`           | 0750 | tundra:tundra | Logs (also goes to journald) |

### 8.3 Network exposure

`tundrad` listens on:

- `127.0.0.1:8447` — panel REST + WebSocket (terminated by Caddy on 443)
- `127.0.0.1:9447` — admin gRPC (CLI only)
- `0.0.0.0:7447` — agent gRPC (mTLS, inbound from agents)

The agent listens on:

- `127.0.0.1:9550` — local admin socket (Unix socket preferred, TCP fallback for `tundra-agent` CLI)

No other ports are opened by Tundra. The deployment runbook prescribes the host firewall to allow only 22, 80, 443 inbound on the control-plane host (with 7447 only from known agent IPs if the operator wants belt-and-braces).

### 8.4 Outbound egress

Tundra makes outbound calls for: ACME, DNS provider APIs (per plugin), object-storage backends (per backup target), package mirrors, MCP-side LLM calls (if MCP plugin enabled). The egress list is documented per plugin manifest. Operators can enforce egress restrictions at the host firewall; Tundra does not currently provide an in-process egress allowlist (planned, see §11).

---

## 9. Attack Trees

### 9.1 Compromise of the panel session of an Owner

**Goal.** Attacker gains an authenticated browser session for the Owner.

```
Owner session compromise
├─ A. Phish password
│   ├─ A1. Owner is using passkey only
│   │     → A fails (no password to phish)
│   ├─ A2. Owner has TOTP
│   │     → A advances; attacker still needs TOTP code
│   │       └─ A2a. Real-time relay phishing site
│   │             → Defended in part by WebAuthn binding to origin if passkey was used
│   └─ A3. Owner has only password
│         → A succeeds → step-up still required for sensitive actions
├─ B. Steal session cookie
│   ├─ B1. XSS in panel
│   │     → CSP, escaping discipline, security tests
│   ├─ B2. Network MITM
│   │     → TLS 1.3, HSTS preload
│   └─ B3. Malware on Owner's device
│         → Out of Tundra's control; mitigated by short session lifetime, step-up, audit
└─ C. Forge session
    └─ C1. Predict 256-bit random ID
          → 2^-128 collision; not viable
```

Mitigations along the tree are in §6 (passkeys, step-up), §3.1 trust boundary (CSP/HSTS), §4.1 (audit and out-of-band review).

### 9.2 Compromise of an agent

**Goal.** Attacker has root on a managed server and the agent's client cert.

```
Agent compromise
├─ A. Agent issues malicious commands to control plane
│     → Agent has no command-emit RPCs that mutate other servers; bounded blast radius
├─ B. Agent reports falsified state
│     → Reconciliation job compares agent-reported state to control-plane expectation; divergence flagged
├─ C. Agent attempts to enumerate other servers
│     → Each agent's client cert SAN binds it to a server UUID; control plane rejects RPCs whose target server doesn't match the cert's SAN
└─ D. Lateral movement to control plane
      → Agent has no shell access to control plane; only the gRPC surface
      └─ D1. Exploit a parser bug in the gRPC server
            → Defence in depth: tundrad runs unprivileged; Wasm plugin sandbox unrelated; fuzzing of agent message handlers (§10.4)
```

Operator response procedure is in the operator security audit, §7.2.

### 9.3 Compromise of the master key

**Goal.** Attacker has the contents of `/var/lib/tundra/master.key`.

This is a catastrophic event. The attacker can decrypt every encrypted column and every encrypted backup whose PGP-encrypted layer they also have. The defence is **prevention** (operator-host hardening; key never copied beyond the host except as offline GPG-encrypted backup) and **detection** (any anomalous decrypt operation is recorded by application-level audit; the master key file is monitored for `read` events via `auditd` if the operator enables it).

The recovery procedure is `tundra master-key rotate` (deployment runbook §9.2), preceded by:

1. Revoke all API tokens.
2. Revoke all sessions.
3. Rotate every third-party provider credential (DNS, object storage, SMTP, etc.) at the *provider*, since the encrypted-at-rest secret is no longer secret.
4. Re-enrol every passkey (the public key in the DB is fine, but the operator should treat the host as suspect end-to-end).

There is no scenario where rotating the master key is sufficient if the host itself was compromised; it is necessary but not sufficient.

### 9.4 Plugin sandbox escape

**Goal.** A malicious plugin gains code execution outside the Wasm sandbox.

```
Plugin escape
├─ A. Wasmtime CVE
│     → Pin to vetted release; subscribe to advisories; cargo-deny tracks
├─ B. Capability misuse
│     → Capabilities are checked per-call; manifests are signed and reviewed at install time
├─ C. SQL injection via declared queries
│     → Queries are parameterised; parameters typed; type mismatch at host-call boundary rejects
└─ D. Resource exhaustion DoS
      → Fuel + memory + epoch limits per invocation; OOM aborts only that invocation
```

Even if A or B succeed, the attacker lands in `tundra:tundra`, not root. A second exploit is required to escalate beyond.

---

## 10. Security Testing

### 10.1 Static analysis

- `cargo clippy --all-targets -- -D warnings` (CI gate).
- `cargo audit` against the GitHub advisory database (CI gate, scheduled re-run nightly).
- `cargo deny check` (licences, banned crates, advisories) (CI gate).
- TypeScript: `tsc --noEmit` + ESLint with `@typescript-eslint/strict` (CI gate).

### 10.2 Dependency posture

- All Rust dependencies pinned to exact versions in `Cargo.lock`.
- A weekly Renovate run opens PRs for upstream updates; security-tagged updates are auto-approved if CI passes.
- Wasmtime is treated specially: any update bumps the security review checklist regardless of changelog phrasing.

### 10.3 Authn/authz tests

- For every route, an integration test asserts:
  - Unauthenticated request returns 401.
  - Authenticated request without permission returns 403.
  - Authenticated request with permission returns 2xx (or the documented business-logic response).
- The test harness enumerates routes from the router and fails if a route is missing test coverage.

### 10.4 Fuzzing

- The agent gRPC handlers and the audit log canonicaliser are fuzzed with `cargo fuzz` (libFuzzer). Targets in `crates/tundrad/fuzz/`.
- Run nightly in CI for 5 minutes per target as a smoke; longer runs (1 hour per target) on the release branch before tag.

### 10.5 Penetration testing

- Internal red-team exercise once per major version. Out-of-scope without an external auditor under contract; this section documents the cadence rather than the findings.
- The threat model in §4 and the attack trees in §9 are the brief.

### 10.6 Security regression suite

A dedicated `tests/security/` directory carries regression tests for every fixed security issue. Each test references the issue ID in a comment header and is annotated `#[cfg(test)]` such that removing it requires explicit reviewer attention.

---

## 11. Known Gaps & Roadmap

This section records security work that is **not** in the current implementation, with the intent that it appears in subsequent versions of this document with a status update.

| Item                                                | Target         | Notes                                                                                                     |
|-----------------------------------------------------|----------------|-----------------------------------------------------------------------------------------------------------|
| In-process egress allowlist for plugins             | v1.4           | Today operators must use host firewall; we want a per-plugin manifest declaration honoured at the runtime |
| Hardware security module integration for master key | v2.0           | YubiHSM, AWS KMS, GCP KMS as alternative master-key custodians                                            |
| TPM-backed agent client certs                       | v2.0           | Where the host has a TPM, bind the agent client cert private key to it                                    |
| Continuous compliance reporting (CIS / SOC2-style)  | v1.5           | Self-assessment dashboard for operators who need to demonstrate posture                                   |
| External penetration test                           | Pre-1.0 stable | Subject to budget/availability                                                                            |
| Reproducible builds                                 | Pre-1.0 stable | Source-to-binary verification via SLSA Level 3+                                                           |
| Per-route CSP nonces                                | v1.3           | Today CSP is page-wide                                                                                    |
| Subresource Integrity for any CDN-loaded assets     | n/a today      | Tundra does not load CDN assets in the panel; if that ever changes, SRI mandatory                         |

---

## 12. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                               |
|---------|----------|----------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial engineering security audit. STRIDE per asset, attack trees for the four highest-impact compromises, cryptographic design, authn/authz model, operational security posture, security testing approach, known gaps and roadmap. |

**Companion Documents:**

- `tundra-security-overview-v1.md` — operator-facing summary
- `tundra-database-schema-v1.md` — table definitions, column-level encryption surface
- `tundra-api-specification-v1.md` — REST/gRPC/WebSocket surface, authn header semantics
- `tundra-deployment-runbook-v1.md` — master-key rotation, agent CA rotation, systemd hardening
- `tundra-test-plan-v1.md` — test pyramid including the security regression suite referenced in §10.6
- `tundra-plugin-architecture-plan-v1.md` — Wasm sandbox, capability system, WIT contracts
- `tundra-technical-implementation-plan-v2.md` — overall architecture context

**Planned Follow-up Documents:**

- `tundra-incident-response-playbook-v1.md` — step-by-step response procedures with comms templates
- `tundra-compliance-mapping-v1.md` — control-to-framework mapping (CIS, SOC2 CC, ISO 27001)
- `tundra-key-ceremony-v1.md` — formal procedure for master-key generation, rotation, and offline backup
