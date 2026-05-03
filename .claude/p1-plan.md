# P1 Foundation — Execution Plan

Branch: `p1-foundation` off `main`

## Tasks

- [ ] T1: `tundrad-crypto` — master key, HKDF, AES-256-GCM, EncryptedField<T>, KeyRing, Argon2id
- [ ] T2: DB migrations — Identity & Access tables + Internal tables + seed system roles
- [ ] T3: `tundrad-repo` — repositories for operators/sessions/passkeys/audit_log, Soft<T>
- [ ] T4: `tundrad-auth` — HIBP, TOTP, WebAuthn, session lifecycle, step-up, API token mint/verify, Authz
- [ ] T5: `tundrad-api` skeleton — /healthz, /readyz, /auth/*, /operators, /operators/me/tokens, /audit-log
- [ ] T6: `tundrad-config` (figment layers) + `tundrad-telemetry` (tracing-subscriber + OTLP)
- [ ] T7: `tundrad-bin` — serve/migrate/master-key subcommands, systemd-notify
- [ ] T8: Panel UI shell — Tailwind tokens, TanStack Router routes, shadcn components, auth/dashboard pages
- [ ] T9: Integration tests — auth_password_flow, auth_passkey_flow, audit_chain, authz_matrix, operators_invite, tokens_lifecycle
- [ ] T10: Coverage gate — crypto 95%/100%, auth 95%/95%, audit chain 95%/90%
- [ ] T11: Commit series + v0.1.0 tag

## Exit Criteria

- `cargo check --workspace` clean
- `cargo test --workspace` all pass
- `cargo clippy --workspace -- -D warnings` clean
- `cargo fmt --all -- --check` clean
- `pnpm typecheck` clean
- `pnpm lint` clean
- Coverage targets met
