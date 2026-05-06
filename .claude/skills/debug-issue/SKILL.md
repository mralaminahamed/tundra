---
name: debug-issue
description: Use when encountering unexpected behavior, failing tests, API errors, or runtime panics in Tundra — before proposing any fix
---

# Debug Issue

## Overview

Graph-powered debugging traces call chains and recent changes in seconds. Random guessing on a codebase this size wastes hours.

**Core principle:** Understand before fixing. A wrong fix in auth, crypto, or migrations can corrupt data or create security holes.

## When to Use

- Test failure with unclear root cause
- API returning wrong status or body
- Panel route not rendering / navigation broken
- Rust compilation error involving multiple crates
- Docker dev stack behaving differently than expected

## The Process

### Step 1: Get minimal context

```
get_minimal_context(task="debug <symptom description>")
```

Always first. Orients graph for your specific investigation.

### Step 2: Locate the failure site

```
semantic_search_nodes(query="<error message fragment or function name>")
```

Find the exact node. Note its file path and line.

### Step 3: Check recent changes

```
detect_changes()
```

Most bugs are introduced by recent changes. High-risk score on a recently changed function near the failure site = strong lead.

### Step 4: Trace the call chain

```
query_graph(node_id="...", pattern="callers_of")   // who triggered this
query_graph(node_id="...", pattern="callees_of")   // what it delegates to
```

Trace up until you find where bad data originates. Fix at source, not at symptom.

### Step 5: Check affected flows

```
get_affected_flows(changed_nodes=[...])
```

Confirms which execution path passes through the broken function. Helps rule out unrelated code.

### Step 6: Read the source only for the failing node

```
get_review_context(node_ids=["<failing_node_id>"])
```

Don't read entire files. One node at a time until root cause is clear.

## Tundra-Specific Debugging Map

| Symptom | Where to look first |
|---------|---------------------|
| 401 on valid session | `tundrad-auth` session extractor, cookie name |
| 403 unexpected | RBAC scope check in handler, `authz_matrix.rs` test coverage |
| 500 from API handler | `unwrap()` on None, missing `?` propagation |
| Rust compile error in `tundrad-api` | Check `routes/mod.rs` pub declaration + `lib.rs` route registration |
| Panel route blank / crashes | `routeTree.gen.ts` type map mismatch; check FileRoutesByFullPath |
| TanStack Query stuck loading | `queryFn` fetch URL typo, `refetchInterval` returning wrong value |
| Migration fails | NOT NULL without DEFAULT, or type mismatch on existing rows |
| Encrypted field panics | Wrong `EncryptedField<T>` type parameter, or master key format |
| WP provisioning stuck | State never updated to `active`/`error` — check tokio::spawn task panicked silently |
| Docker: `sqlx: not found` | `/cargo/bin` not in PATH; check docker-compose.override.yml |

## Red Flags — Stop and Investigate Deeper

- You've tried 2 different fixes and neither worked → wrong root cause, re-read call chain
- Fix requires changing 5+ files → you're patching a symptom, not a cause
- Error message mentions a type you don't recognize → read the type definition first
- "It works locally but not in Docker" → env var, volume mount, or PATH difference
- Test passes in isolation but fails in suite → shared state / missing test isolation

## After Finding Root Cause

Only then: write a minimal failing test (per `superpowers:test-driven-development`), then fix.
