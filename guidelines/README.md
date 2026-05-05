# Tundra Guidelines

Practical guides for every audience. Pick the one that fits your role.

| Guide                                       | Who it's for                                 |
|---------------------------------------------|----------------------------------------------|
| [Getting Started](getting-started.md)       | Operators installing and running Tundra      |
| [Local Development](local-development.md)   | Running Tundra from source, ports, config    |
| [Developer Guide](developer-guide.md)       | Contributors building or modifying Tundra    |
| [MCP Guide](mcp-guide.md)                   | AI agents and Claude/Cursor/Zed integrations |
| [Plugin Development](plugin-development.md) | Authors writing Tundra plugins               |
| [API Reference](api-reference.md)           | Integrators calling the REST API             |

## Deep-reference documents (in `docs/`)

| Path                                                              | What it covers                                      |
|-------------------------------------------------------------------|-----------------------------------------------------|
| `docs/01-architecture/tundra-technical-implementation-plan-v3.md` | Full architecture, all 17 phases                    |
| `docs/01-architecture/tundra-database-schema-v1.md`               | PostgreSQL 18 schema — 73 tables                    |
| `docs/01-architecture/tundra-api-specification-v1.md`             | REST + gRPC + WebSocket spec                        |
| `docs/02-operations/tundra-deployment-runbook-v1.md`              | Manual install, upgrade rollback, disaster recovery |
| `docs/03-security/tundra-security-audit-v1.md`                    | STRIDE threat model, controls catalog               |
| `docs/05-extensibility/tundra-plugin-architecture-plan-v1.md`     | Wasmtime sandbox, WIT contracts, capability system  |
| `docs/06-mcp-server/tundra-mcp-server-spec-v1.md`                 | MCP server engineering spec                         |
| `docs/06-mcp-server/tundra-mcp-server-cookbook-v1.md`             | Worked MCP integration examples                     |
