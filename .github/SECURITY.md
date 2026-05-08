# Security Policy

## Supported versions

| Version | Support |
|---------|---------|
| 1.x     | Active security fixes |
| < 1.0   | End of life — upgrade to 1.x |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Use one of:

1. **GitHub private advisory** (preferred) — [Report a vulnerability](https://github.com/mralaminahamed/tundra/security/advisories/new)
2. **Email** — `mrabir.ahamed@gmail.com` with subject `[VULN] <brief description>`

Include:
- Tundra version and deployment method (systemd / Docker)
- Steps to reproduce or a proof-of-concept
- Impact assessment if known

We respond within **48 hours** and aim to ship a fix within **7 days** for critical issues.
Coordinated disclosure; CVE filed for confirmed vulnerabilities.

## Security model

See [`docs/security.md`](../docs/security.md) and [`docs/03-security/tundra-security-audit-v1.md`](../docs/03-security/tundra-security-audit-v1.md) for the full threat model, trust boundaries, and cryptographic details.

## Scope

In scope: tundrad, tundra-agent, tundra CLI, panel, installer, plugin host, official plugins.
Out of scope: third-party plugins, issues requiring physical access to the server.
