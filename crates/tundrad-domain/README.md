# tundrad-domain

Pure domain types and business logic for the Tundra control plane. **Zero I/O, no database access, no network calls.**

## Rule

This crate must never depend on `sqlx`, `axum`, `reqwest`, or any I/O crate. It defines the canonical Rust types that all other crates in the control plane reason about.

## Contents

| Module | Types |
|--------|-------|
| `operator` | `Operator`, `OperatorRole`, `NewOperator` |
| `session` | `Session`, `NewSession` |
| `audit_log` | `AuditEntry`, `NewAuditEntry`, `AuditActor` |

## Design notes

- All types are plain structs — no SQLx derives, no Axum extractors
- Repository crates (`tundrad-repo`) map between these types and DB rows
- API crates (`tundrad-api`) map between these types and HTTP DTOs
- Business rules that don't touch I/O live here (e.g. role hierarchy checks, permission derivation)
