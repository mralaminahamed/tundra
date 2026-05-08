# Contributing to Tundra

## Quick start

```bash
git clone https://github.com/mralaminahamed/tundra
cd tundra
cp docs/09-deployment-bundle/dev/.env.example docs/09-deployment-bundle/dev/.env
docker compose -f docs/09-deployment-bundle/dev/docker-compose.yml up -d
```

Full setup: [`guidelines/local-development.md`](../guidelines/local-development.md)
Architecture: [`guidelines/developer-guide.md`](../guidelines/developer-guide.md)

## Before you open a PR

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd panel && pnpm typecheck && pnpm lint && pnpm test --run
```

All four must be clean. CI will block on any failure.

## Hard constraints

These are non-negotiable — PRs that violate them will not be merged:

| Rule | Why |
|------|-----|
| No `openssl-sys` anywhere in the dep tree | `deny.toml` bans it; `rustls` only |
| Up-only migrations | No `down` files; reverting means a new forward migration |
| `EncryptedField<T>` for every secret column | Plaintext secrets in the DB are a security bug |
| `audit_log` row in every state-changing handler | Compliance requirement |
| No `unwrap()` in HTTP handlers | Use `?` + explicit error mapping |
| Parameterised queries only | No `format!()` into SQL |

## Commit style

```
<type>(<scope>): <short imperative summary>

<optional body — the WHY, not the what>
```

Types: `feat` `fix` `chore` `docs` `test` `refactor` `ci`
Scope: crate name or panel route, e.g. `tundrad-auth`, `panel/sites`

## New routes checklist

- [ ] Entry in `proto/openapi.yaml` first (spec-first)
- [ ] Row in `tests/authz_matrix.rs` (unauthed → 401, wrong role → 403, correct → 2xx)
- [ ] `audit_log` insert in handler
- [ ] Route registered in `tundrad-api/src/lib.rs`

## Migrations checklist

- [ ] File named `migrations/<timestamp>_<description>.sql`
- [ ] No `DROP`, `TRUNCATE`, or column removal without a data-safety plan
- [ ] `NOT NULL` columns include a `DEFAULT` or a backfill step
- [ ] `uuidv7()` used for new PK columns

## Security issues

Do **not** open a public issue. See [`SECURITY.md`](SECURITY.md).
