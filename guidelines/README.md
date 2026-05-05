# Tundra Guidelines

Practical guides organised by audience. Start with the one that matches your role.

## For operators

| Guide | What it covers |
|-------|---------------|
| [Getting Started](getting-started.md) | Install, add a server, deploy a site, plugins, upgrade |
| [Local Development](local-development.md) | Run from source, Docker Compose, port map, config reference |

## For developers

| Guide | What it covers |
|-------|---------------|
| [Developer Guide](developer-guide.md) | Architecture, conventions, testing, hard constraints, PR checklist |
| [Plugin Development](plugin-development.md) | Core plugins, WASM sandbox, templates, source badges, management UI |

## For integrators

| Guide | What it covers |
|-------|---------------|
| [API Reference](api-reference.md) | REST endpoints, auth, errors, pagination, WebSocket events |
| [MCP Integration](mcp-integration.md) | Connect Claude, Cursor, Zed; token scopes; HTTP and stdio transports |

---

## Deep-reference documents (`docs/`)

| Document | What it covers |
|----------|---------------|
| [Architecture](../docs/01-architecture/tundra-technical-implementation-plan-v3.md) | Component topology, technology stack, all 17 phases |
| [Database Schema](../docs/01-architecture/tundra-database-schema-v1.md) | PostgreSQL 18 schema — 73 tables, 14 modules |
| [API Specification](../docs/01-architecture/tundra-api-specification-v1.md) | Full REST + gRPC + WebSocket spec |
| [Deployment Runbook](../docs/02-operations/tundra-deployment-runbook-v1.md) | Manual install, upgrade rollback, disaster recovery |
| [Security Audit](../docs/03-security/tundra-security-audit-v1.md) | STRIDE threat model, controls catalog |
| [Plugin Architecture](../docs/05-extensibility/tundra-plugin-architecture-plan-v1.md) | Wasmtime sandbox, WIT contracts, capability system |
| [MCP Server Spec](../docs/06-mcp-server/tundra-mcp-server-spec-v1.md) | MCP server engineering spec |
| [MCP Cookbook](../docs/06-mcp-server/tundra-mcp-server-cookbook-v1.md) | Worked MCP integration examples |
| [Security Overview](../docs/security.md) | Hardening checklist, trust model |
| [Upgrade Guide](../docs/UPGRADING.md) | Migration policy, major-version upgrade notes |
