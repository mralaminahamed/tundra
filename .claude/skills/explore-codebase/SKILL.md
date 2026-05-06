---
name: explore-codebase
description: Use when you need to understand codebase structure, locate code, or trace relationships before making changes or answering architecture questions
---

# Explore Codebase

## Overview

This project has a live knowledge graph (code-review-graph MCP). It is faster and cheaper than grep/glob for finding code. Use graph tools first; fall back to file reads only when the graph doesn't have what you need.

**Core principle:** Start broad, narrow down. Never read files you haven't located via the graph first.

## When to Use

- Starting work in an unfamiliar area of the codebase
- Before touching any Rust crate or panel route you haven't read recently
- Answering "where is X defined / what calls Y / what does Z import"
- Understanding blast radius before a change

## The Process

### Step 1: Orient (always first)

```
get_minimal_context(task="<your task description>")
```

This returns the minimal graph context needed. Do this before any other graph call.

### Step 2: Architecture overview (if unfamiliar area)

```
get_architecture_overview()        // top-level communities
list_communities()                 // named modules
get_community(community_id="...")  // drill into one
```

Tundra community boundaries roughly map to workspace crates:
`tundrad-api` (HTTP routes), `tundrad-repo` (DB), `tundrad-domain` (types),
`tundrad-auth`, `tundrad-crypto`, `tundrad-jobs`, `tundrad-events`,
`tundra-agent-*` family, `panel/` (React SPA).

### Step 3: Find specific symbols

```
semantic_search_nodes(query="route handler for site creation")
semantic_search_nodes(query="WpInstallation struct")
```

Use natural language. Returns nodes with file paths and line numbers.

### Step 4: Trace relationships

```
query_graph(node_id="...", pattern="callers_of")      // who calls this
query_graph(node_id="...", pattern="callees_of")      // what it calls
query_graph(node_id="...", pattern="imports_of")      // what it imports
query_graph(node_id="...", pattern="tests_for")       // its tests
query_graph(node_id="...", pattern="children_of")     // file's symbols
```

### Step 5: Understand execution paths

```
list_flows()                      // all named flows
get_flow(flow_id="...")           // full path through the system
```

## Tundra-Specific Tips

- **Rust crates**: find the handler via `semantic_search_nodes`, then use `callees_of` to trace into repo/domain layers
- **Panel routes**: file-based routing under `panel/src/routes/`; `_auth.*.tsx` = authenticated layout subtree
- **Shared types**: `tundra-shared` crate + `panel/src/lib/api-types.ts` — check both sides for DTO mismatches
- **DB schema**: migrations in `migrations/` are canonical; `tundrad-repo` has the SQLx queries
- **find_large_functions** — useful before refactoring to identify complex code worth understanding first

## Token Efficiency

- Use `detail_level="minimal"` on all calls; escalate to `"standard"` only when minimal is insufficient
- `get_minimal_context` first = skip 2–3 redundant tool calls
- Target: locate any symbol in ≤3 tool calls
