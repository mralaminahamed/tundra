# Tundra — Complete Documentation Suite v1.0

> The full Tundra specification, build, and operations suite assembled in a single archive.
> 23 markdown documents, 7 visual previews, 2 file bundles (brand assets + Docker compose stacks). 28 items in total.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Suite Version:** v1.0
**Suite Date:** May 2026
**Status:** Implementation-ready specification + build prompts + deployment artefacts

---

## What's Inside

This archive bundles the complete Tundra documentation set: every architectural specification, every operational runbook, every security control, every test contract, every build prompt, plus the
brand identity and deployable Docker stacks. Read it as a coherent whole or pick the section you need.

The folder numbers are a recommended reading order for a **new contributor**. They are not a precedence ordering; every document is self-contained.

```
tundra-suite-v1.0/
├── README.md                            ← you are here
│
├── 01-architecture/                     System design and contracts
│   ├── tundra-technical-implementation-plan-v3.md    (anchor; read first)
│   ├── tundra-database-schema-v1.md
│   ├── tundra-api-specification-v1.md
│   └── tundra-frontend-ui-spec-v1.md
│
├── 02-operations/                       Install, upgrade, recover
│   ├── tundra-deployment-runbook-v1.md          (engineering edition)
│   └── tundra-deployment-overview-v1.md         (operator edition)
│
├── 03-security/                         Threat model and operator posture
│   ├── tundra-security-audit-v1.md              (engineering: STRIDE + controls)
│   └── tundra-security-overview-v1.md           (operator: plain-language)
│
├── 04-quality/                          Test contracts and UAT
│   ├── tundra-test-plan-v1.md                   (engineering)
│   └── tundra-acceptance-checklist-v1.md        (operator UAT)
│
├── 05-extensibility/                    Plugins, migration
│   ├── tundra-plugin-architecture-plan-v1.md
│   ├── tundra-additional-core-plugins-v1.md
│   └── tundra-plesk-migration-plan-v1.md
│
├── 06-mcp-server/                       AI agent integration (the MCP plugin)
│   ├── tundra-mcp-server-spec-v1.md             (engineering)
│   ├── tundra-mcp-server-operator-v1.md         (operator)
│   └── tundra-mcp-server-cookbook-v1.md         (worked examples)
│
├── 07-brand/                            Visual identity
│   ├── tundra-brand-guidelines-v1.md
│   ├── tundra-brand-assets-v1.zip               (59 brand assets)
│   └── preview-*.png                            (7 visual previews)
│
├── 08-build-prompts/                    Claude Code phase-by-phase
│   └── tundra-claude-code-prompts-v1.md         (P0 → P9 + PV verify)
│
├── 09-deployment-bundle/                Docker compose stacks
│   └── tundra-docker-v1.zip                     (dev / prod / e2e + Dockerfiles)
│
└── 10-historical/                       Superseded but preserved
    └── tundra-technical-implementation-plan-v2.md
```

---

## Reading-Order Recommendations

### For a new engineer joining the project

1. `01-architecture/tundra-technical-implementation-plan-v3.md` — overall architecture and the documentation map
2. `01-architecture/tundra-database-schema-v1.md` — the data model
3. `01-architecture/tundra-api-specification-v1.md` — the contract you'll implement against
4. `04-quality/tundra-test-plan-v1.md` — how you'll verify your work
5. `03-security/tundra-security-audit-v1.md` — the threat model your code must respect
6. `08-build-prompts/tundra-claude-code-prompts-v1.md` — the phase-by-phase build sequence

### For a new operator deploying Tundra

1. `02-operations/tundra-deployment-overview-v1.md` — install + first-time setup
2. `04-quality/tundra-acceptance-checklist-v1.md` — verify it works
3. `03-security/tundra-security-overview-v1.md` — what's your responsibility
4. `06-mcp-server/tundra-mcp-server-operator-v1.md` — if you're enabling AI access
5. `02-operations/tundra-deployment-runbook-v1.md` — only when you hit something that needs depth

### For a security reviewer

1. `03-security/tundra-security-audit-v1.md` — full threat model (STRIDE + attack trees)
2. `01-architecture/tundra-technical-implementation-plan-v3.md` §6–§9 — architectural commitments
3. `01-architecture/tundra-database-schema-v1.md` §9 — encryption surface
4. `04-quality/tundra-test-plan-v1.md` §10 — security testing posture
5. `06-mcp-server/tundra-mcp-server-spec-v1.md` §13 — MCP-specific threat model

### For someone integrating Tundra with Claude / Cursor / Zed

1. `06-mcp-server/tundra-mcp-server-operator-v1.md` — understand the trust model
2. `06-mcp-server/tundra-mcp-server-cookbook-v1.md` — concrete configuration recipes
3. `06-mcp-server/tundra-mcp-server-spec-v1.md` — only when you need wire-level detail

### For a frontend-only contributor

1. `01-architecture/tundra-frontend-ui-spec-v1.md` — design tokens, components, route map
2. `07-brand/tundra-brand-guidelines-v1.md` — visual identity that backs the tokens
3. `01-architecture/tundra-api-specification-v1.md` — the API surface the panel consumes
4. `04-quality/tundra-test-plan-v1.md` §3.2 + §5.3 — TS/Vitest/Playwright posture

---

## File Inventory (with sizes)

| Folder               | File                                       | Bytes   |
|----------------------|--------------------------------------------|---------|
| 01-architecture      | tundra-technical-implementation-plan-v3.md | 62,395  |
| 01-architecture      | tundra-database-schema-v1.md               | 57,260  |
| 01-architecture      | tundra-api-specification-v1.md             | 30,847  |
| 01-architecture      | tundra-frontend-ui-spec-v1.md              | 86,389  |
| 02-operations        | tundra-deployment-runbook-v1.md            | 26,299  |
| 02-operations        | tundra-deployment-overview-v1.md           | 17,501  |
| 03-security          | tundra-security-audit-v1.md                | 37,421  |
| 03-security          | tundra-security-overview-v1.md             | 17,531  |
| 04-quality           | tundra-test-plan-v1.md                     | 27,889  |
| 04-quality           | tundra-acceptance-checklist-v1.md          | 21,746  |
| 05-extensibility     | tundra-plugin-architecture-plan-v1.md      | 59,068  |
| 05-extensibility     | tundra-additional-core-plugins-v1.md       | 51,813  |
| 05-extensibility     | tundra-plesk-migration-plan-v1.md          | 58,158  |
| 06-mcp-server        | tundra-mcp-server-spec-v1.md               | 52,017  |
| 06-mcp-server        | tundra-mcp-server-operator-v1.md           | 25,101  |
| 06-mcp-server        | tundra-mcp-server-cookbook-v1.md           | 27,832  |
| 07-brand             | tundra-brand-guidelines-v1.md              | 27,402  |
| 07-brand             | tundra-brand-assets-v1.zip                 | 772,626 |
| 07-brand             | preview-color-system.png                   | 68,564  |
| 07-brand             | preview-lockup-horizontal.png              | 17,207  |
| 07-brand             | preview-mark-construction.png              | 118,343 |
| 07-brand             | preview-og-card-dark.png                   | 37,377  |
| 07-brand             | preview-og-card-light.png                  | 38,144  |
| 07-brand             | preview-readme-banner.png                  | 29,026  |
| 07-brand             | preview-typography.png                     | 154,241 |
| 08-build-prompts     | tundra-claude-code-prompts-v1.md           | 80,793  |
| 09-deployment-bundle | tundra-docker-v1.zip                       | 31,317  |
| 10-historical        | tundra-technical-implementation-plan-v2.md | 75,113  |

**Document totals.** 23 markdown files (~890 KB combined). Every spec is signed in its **Document Control** section showing version, date, author, and changelog entry.

---

## Document Catalogue

### 01 — Architecture (4 documents)

The system's design contracts. These are the documents that should not change without a corresponding code change.

- **`tundra-technical-implementation-plan-v3.md`** — the anchor. Architecture overview, technology stack, functional module breakdown, roadmap (9 phases, 9 milestones M0→M8), comparison matrix,
  glossary. v3 supersedes v2 by reframing the deep schema/API/security/deployment/test sections as anchor sections that delegate to the dedicated companion documents.
- **`tundra-database-schema-v1.md`** — the canonical PostgreSQL 18 schema. 73 tables across 14 modules, full DDL, encrypted-column discipline, partitioning policy, soft-delete conventions, up-only
  migration discipline, encryption-at-rest design.
- **`tundra-api-specification-v1.md`** — REST + gRPC + WebSocket surface. OpenAPI 3.1 spec-first, complete endpoint specs with curl examples, gRPC service map, WebSocket event catalog.
- **`tundra-frontend-ui-spec-v1.md`** — panel UI design tokens, components, route map, wizard flows. Vite 8 + React 19 + TS 5.7 strict + Tailwind 4 + shadcn/ui + TanStack Router/Query + Zustand +
  RHF/Zod + Formik/Yup for wizards.

### 02 — Operations (2 documents)

How Tundra is installed, upgraded, recovered.

- **`tundra-deployment-runbook-v1.md`** — engineering edition. Manual install, full hardened systemd unit, master-key rotation, agent CA rotation, cross-server site migration, troubleshooting trees.
- **`tundra-deployment-overview-v1.md`** — operator edition. One-liner install, first-time setup, upgrades, self-backup, restore, "when to read the engineering edition."

### 03 — Security (2 documents)

Threat model and operator posture.

- **`tundra-security-audit-v1.md`** — engineering edition. STRIDE per asset, attack trees for the four highest-impact compromises, cryptographic design, authentication/authorisation model, operational
  hardening, security testing posture, known gaps and roadmap.
- **`tundra-security-overview-v1.md`** — operator edition. Plain-language summary, IoCs, incident response procedures, vulnerability reporting.

### 04 — Quality (2 documents)

Test contracts and UAT.

- **`tundra-test-plan-v1.md`** — engineering edition. Test pyramid, harness internals (Rust integration, plugin sandbox, panel components, Playwright e2e), coverage targets, CI gates, performance and
  security testing posture, reference test code per layer.
- **`tundra-acceptance-checklist-v1.md`** — operator edition. UAT-style verification: post-install/post-upgrade smoke, identity, server enrolment, site provisioning, deploys, databases, mail, backups,
  the quarterly restore drill, subsystem sign-off, telemetry health, recommended cadence.

### 05 — Extensibility (3 documents)

The Wasm sandbox and the core plugins it hosts.

- **`tundra-plugin-architecture-plan-v1.md`** — Wasmtime sandbox model, capability system, WIT contracts, plugin lifecycle, host APIs.
- **`tundra-additional-core-plugins-v1.md`** — Namecheap (registrar), GitHub App, MCP server (the MCP §4 here is now superseded by the dedicated `06-mcp-server/` documents).
- **`tundra-plesk-migration-plan-v1.md`** — Plesk-source migration plugin: 6-state machine, mail bridge, cutover strategies (scheduled vs zero-downtime).

### 06 — MCP Server (3 documents)

AI-agent integration via the Model Context Protocol.

- **`tundra-mcp-server-spec-v1.md`** — engineering reference. Architecture (in-process embedding rationale), full transport behaviour (stdio + Streamable HTTP), complete tool catalog with JSON
  Schemas, scope×mode resolution matrix, plugin-owned schema with retention, audit pipeline, MCP-specific STRIDE entries.
- **`tundra-mcp-server-operator-v1.md`** — operator guide. Mental model (plugin/token/session), scope choice guidance, minting workflow, token handover patterns, daily/weekly/monthly habits, incident
  procedures, team patterns, FAQ.
- **`tundra-mcp-server-cookbook-v1.md`** — integration recipes. Worked configs for Claude Desktop, Claude Code, Cursor, Zed, cloud agents. End-to-end conversations: deploy via Claude, incident
  response, routine ops. Troubleshooting recipes, patterns by use case.

### 07 — Brand (1 document + assets)

Visual identity.

- **`tundra-brand-guidelines-v1.md`** — marks, lockups, typography, colour, OG cards, sub-brand templates.
- **`tundra-brand-assets-v1.zip`** — 59 production-ready files: SVG marks, lockups, OG card templates (light/dark), favicons, README banners, typography specimens, CSS tokens.
- **`preview-*.png`** — seven inline previews of the brand system rendered out for quick visual reference.

### 08 — Build Prompts (1 document)

Phase-by-phase Claude Code prompts.

- **`tundra-claude-code-prompts-v1.md`** — 11 prompts: P0 bootstrap, P1–P9 per-phase, PV reusable verify. Each prompt has a doc-read gate before any code is written, ordered implementation steps that
  reference the spec docs by name + section, exit criteria, and an explicit commit list.

### 09 — Deployment Bundle (1 archive)

Three Docker compose stacks plus the Dockerfiles they share.

- **`tundra-docker-v1.zip`** — `dev/` (source-mounted, hot-reload), `prod/` (prebuilt images, persistent volumes, secrets, hardening), `e2e/` (test mode, tmpfs state, multi-server profile). Plus 4
  multi-stage Dockerfiles for `tundrad`, `tundra-agent`, `panel-ui`, `workload`. Top-level README explains stack selection. 27 files total.

### 10 — Historical (1 document)

Superseded artefacts kept for traceability.

- **`tundra-technical-implementation-plan-v2.md`** — the previous version of the architecture plan. Superseded by v3 (in `01-architecture/`). Kept here so the audit trail of design evolution is
  complete.

---

## Suite-Wide Conventions

Every document in this suite follows the same conventions:

- **Tone.** Formal, professional, addressing a senior technical colleague. Plain prose; minimal bullet-listing where prose works.
- **Authorship.** Al Amin Ahamed personally — GitHub/X `@mralaminahamed` — never Codexpert Inc.
- **Versioning.** Every document carries a Document Control table at the end with a version, date, author, and changelog entry.
- **Cross-references.** Documents reference each other by exact filename, e.g., `tundra-database-schema-v1.md §3.1`. Cross-references are stable: filenames don't change without bumping the major.
- **No emoji as iconography.** Where icons are referenced (Lucide React in the UI, SVGs in diagrams), they're named explicitly. Plain emoji are reserved for inline punctuation.
- **Stack pins.** Every spec that mentions tooling is pinned to the May-2026 stable: Rust 1.95, Tokio, Axum 0.8, Tonic 0.13, SQLx 0.8, PostgreSQL 18, Valkey 8, Wasmtime, Vite 8, React 19, TS 5.7,
  Tailwind 4.

---

## How to Use This Archive

### As a reference

Drop the unpacked archive into any project. Read the relevant section. Cross-references work as intra-document links if your reader supports them; otherwise the filename + section anchor is
unambiguous.

### As a build kit

1. Place the markdown files in `docs/specs/` of your Tundra repo.
2. Place `09-deployment-bundle/tundra-docker-v1.zip`'s contents at the repo root.
3. Run the prompts from `08-build-prompts/tundra-claude-code-prompts-v1.md` against Claude Code, in order.
4. Reach `v1.0.0` after roughly 45 weeks of solo development (or ~6 months with one assisting developer).

### As a portfolio artefact

The suite stands on its own as a worked example of spec-first software engineering: 18 documents covering architecture, schema, API, deployment, security, testing, extensibility, AI integration,
brand, and a phase-by-phase build plan. Total ~890 KB of markdown.

---

## Companion Note: What's NOT in This Archive

For completeness, here's what was **not** bundled (and why):

- **The v3 plan's earlier draft, v2.** Included in `10-historical/` for traceability but marked superseded.
- **The legacy v1 plan** (which used different component names — `forged`, `forge-agent` etc.). Not preserved; the rename to Tundra was treated as a renaming, not a fork.
- **Source code.** This archive is documentation + prompts + brand + Docker stacks. The Tundra source code lives in the project's git repository; the prompts in `08-build-prompts/` are the bridge.
- **Container images.** Dockerfiles are in `09-deployment-bundle/`; building them produces the runtime images.

---

## Document Control (this README)

| Version | Date     | Author         | Changes                                                                                                                                                             |
|---------|----------|----------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial suite manifest. 28 items in 10 categorised folders. Reading-order recommendations per audience role. Per-folder document catalogue. Suite-wide conventions. |
