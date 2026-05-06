---
name: refactor-safely
description: Use when planning or executing a refactor — rename, extract, move, or delete code — to prevent breaking callers or missing affected files
---

# Refactor Safely

## Overview

Tundra spans 20+ Rust crates, a React SPA, proto definitions, and SQL migrations. A rename in one layer silently breaks another if you don't trace all references first. The graph finds them all.

**Core principle:** Preview before applying. Never rename across files without seeing the full impact list first.

## When to Use

- Renaming a public type, function, or const used in multiple crates
- Extracting a module or splitting a large file
- Moving code between crates (e.g., domain type → shared)
- Deleting code you think is unused
- Restructuring panel components or route files

## When NOT to Use

- Single-file rename with no public exports
- Internal-only change with no callers outside the file

## The Process

### Step 1: Get minimal context

```
get_minimal_context(task="refactor <what you're changing>")
```

### Step 2: Understand the current shape

```
query_graph(node_id="<target>", pattern="children_of")   // what it contains
query_graph(node_id="<target>", pattern="callers_of")    // who depends on it
query_graph(node_id="<target>", pattern="imports_of")    // what it pulls in
```

Build the full dependency picture before touching anything.

### Step 3: Find dead code (if removing)

```
refactor_tool(mode="dead_code")
```

Returns unreferenced functions/types. Verify with `callers_of` — graph dead code + zero callers = safe to delete.

### Step 4: Get rename suggestions (if restructuring)

```
refactor_tool(mode="suggest")
```

Community-driven suggestions for what could be extracted or grouped differently.

### Step 5: Preview renames before applying

```
refactor_tool(mode="rename", node_id="...", new_name="...")
```

Returns a `refactor_id` and full list of affected locations. Read the list completely. If unexpected files appear, investigate before proceeding.

### Step 6: Check blast radius

```
get_impact_radius(node_id="<target>")
```

Shows callers two levels up. Callers you didn't expect = the refactor is larger than assumed.

### Step 7: Apply (only after preview is clean)

```
apply_refactor_tool(refactor_id="...")
```

### Step 8: Verify

```
detect_changes()
```

Confirms actual changes match expected scope. Then run `cargo check --workspace` and `pnpm typecheck`.

## Tundra-Specific Considerations

| What you're refactoring | What to check additionally |
|-------------------------|---------------------------|
| Public Rust type in `tundra-shared` | Both Rust callers AND TypeScript `api-types.ts` DTO |
| Route handler signature | `lib.rs` route registration, `openapi.yaml` spec |
| DB column name | All SQLx queries in `tundrad-repo`, any `SELECT *` statements |
| Panel component | All import sites + any lazy-loaded routes in `routeTree.gen.ts` |
| Enum variant | `match` exhaustiveness — Rust will catch missing arms, but check JS too if mirrored |
| Migration table/column | Cannot rename via migration — add new column, migrate data, drop old in sequence |

## Red Flags

- `apply_refactor_tool` touches a migration file → stop, migrations are append-only
- Blast radius includes `tundrad-auth` or `tundrad-crypto` → get a second review
- Dead code analysis says "unused" but it's a Tonic handler → gRPC services aren't locally called
- Panel component appears unused but is in a lazy route → router may load it dynamically
