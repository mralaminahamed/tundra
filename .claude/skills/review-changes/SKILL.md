---
name: review-changes
description: Use after completing a feature or before merging to perform a risk-scored review of changed code, check test coverage, and assess blast radius
---

# Review Changes

## Overview

The knowledge graph scores changed code by risk and maps execution paths. Use it to produce a structured review that surfaces what matters without reading every modified line.

**Core principle:** Risk-score first, then read. High-risk untested code blocks merge. Low-risk well-tested code gets a pass.

## When to Use

- After implementing any feature touching multiple files
- Before creating a PR or merging to main
- When asked to review a colleague's changes
- After any migration or schema change

## When NOT to Use

- Single-line typo fix with no logic change — skip to commit
- You've already run the full review process this session

## The Process

### Step 1: Get minimal context

```
get_minimal_context(task="review recent changes")
```

### Step 2: Detect and score changes

```
detect_changes()
```

Returns each changed function with a risk score (0–1) and reason. Focus on anything ≥0.7.

### Step 3: Map affected flows

```
get_affected_flows(changed_nodes=[...])   // use node_ids from detect_changes
```

Shows which named execution paths pass through the changed code. A change in a flow touched by auth, billing, or deployment deserves higher scrutiny.

### Step 4: Check test coverage for high-risk nodes

```
query_graph(node_id="...", pattern="tests_for")
```

Do this for every function with risk ≥0.7. No tests = flag it.

### Step 5: Check blast radius

```
get_impact_radius(node_id="...")     // for highest-risk nodes only
```

Shows callers two levels up. Unexpected callers = hidden coupling = risk.

### Step 6: Read source for critical gaps

```
get_review_context(node_ids=[...])   // token-efficient source snippets
```

Only for untested high-risk functions. Don't read everything.

## Output Format

Group findings by risk tier:

**Critical** (risk ≥0.8, no tests, in auth/billing/deploy flow)
- What changed, why it matters, what test is missing

**Important** (risk ≥0.6, or tested but flow is sensitive)
- What changed, suggested improvement

**Low** (risk <0.6, tested)
- Brief note or skip entirely

End with: merge recommendation (ready / needs fixes / needs discussion).

## Tundra-Specific Risk Signals

| Area | Why risky |
|------|-----------|
| `tundrad-auth` | Session/token/passkey logic; regression = security hole |
| `tundrad-crypto` | `EncryptedField<T>` changes can corrupt stored secrets |
| `migrations/` | Up-only; wrong schema change requires new forward migration |
| `audit_log` writes | Every mutation handler must write audit row — check for missing calls |
| `tundrad-api/src/lib.rs` | Route registration — missing `.patch()` or wrong HTTP verb is silent |
| Panel `routeTree.gen.ts` | Manual maintenance; wrong type maps cause runtime router panics |

## Red Flags

- High-risk function with 0 callers in test files → untested path
- Migration adds NOT NULL column without DEFAULT → breaks existing rows
- Handler missing `audit_log` insert
- `unwrap()` inside an HTTP handler
- Plaintext secret stored in non-`bytea` column
