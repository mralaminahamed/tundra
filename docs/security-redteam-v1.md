# Tundra Internal Red-Team — v1.0 GA

**Date:** 2026-05-04
**Scope:** tundra-security-audit-v1.md §9 attack trees
**Method:** Internal walk-through of all four attack trees; attempted exploit of highest-risk paths in a local test environment
**Tester:** Al Amin Ahamed (project author)

## Attack Tree 1 — Owner session compromise (§9.1)

### Paths tested

| Path                                          | Tested                                                                    | Outcome                                                                             | Remediation                                      |
|-----------------------------------------------|---------------------------------------------------------------------------|-------------------------------------------------------------------------------------|--------------------------------------------------|
| A. Phish password (A3: password only, no 2FA) | Simulated                                                                 | Step-up required for sensitive ops — blast radius limited even with stolen password | Documented; passkey recommended as default in UI |
| B1. XSS in panel                              | Searched for `dangerouslySetInnerHTML`, `innerHTML` writes                | Not found; CSP `default-src 'self'` deployed in P8                                  | No action needed                                 |
| B2. Network MITM                              | TLS 1.3 only, HSTS preload header verified on every response              | Covered                                                                             | No action needed                                 |
| C1. Predict 256-bit session ID                | Entropy analysis of `getrandom` → 256 bits → collision probability 2^-128 | Not viable                                                                          | No action needed                                 |

**Finding:** No exploitable path found. Step-up authentication (P8) mitigates the highest-risk A3 path.

## Attack Tree 2 — Agent compromise (§9.2)

| Path                               | Tested                                     | Outcome                        | Remediation      |
|------------------------------------|--------------------------------------------|--------------------------------|------------------|
| A. Agent issues malicious commands | Agent has no command-emit RPCs             | Confirmed via proto inspection | No action needed |
| B. Falsified state reporting       | Reconciliation job would flag divergence   | Architecture review confirms   | No action needed |
| C. Enumerate other servers         | SAN binding verified in cert issuance code | Covered                        | No action needed |
| D1. Parser bug in gRPC server      | Fuzz targets added in P8 for gRPC dispatch | Ongoing coverage               | No action needed |

**Finding:** No new issues. Bounded blast radius confirmed.

## Attack Tree 3 — Master key compromise (§9.3)

| Path                     | Tested                                          | Outcome   | Remediation      |
|--------------------------|-------------------------------------------------|-----------|------------------|
| Key file permissions     | Mode 0400, owner tundra:tundra                  | Correct   | No action needed |
| Key never logged         | Searched audit log write sites for key material | Not found | No action needed |
| BLAKE3 trailer integrity | `tundra master-key verify` checks this          | Covered   | No action needed |

**Finding:** No exploitable path. Prevention (operator-host hardening) and detection (auditd monitoring) are the documented strategy.

## Attack Tree 4 — Plugin sandbox escape (§9.4)

| Path                         | Tested                                                          | Outcome | Remediation                   |
|------------------------------|-----------------------------------------------------------------|---------|-------------------------------|
| A. Wasmtime CVE              | `cargo deny check` advisory database; Wasmtime 28 no known CVEs | Clean   | Monitor via nightly audit job |
| B. Capability misuse         | Capability check on every host-call verified in `capability.rs` | Covered | No action needed              |
| C. SQL injection via queries | Plugin queries are pre-declared TOML; no dynamic SQL            | Covered | No action needed              |
| D. Resource exhaustion       | Fuel + memory + epoch limits in engine.rs                       | Covered | No action needed              |

**Finding:** No new issues. Second-exploit-required to escape `tundra:tundra` unprivileged user.

## Summary

All four attack trees walked. No GA-blocking findings. Minor documentation improvements made:
- Passkey encouraged as default in README and getting-started.md
- BLAKE3 master key integrity documented in docs/security.md

**Red-team status: PASS** — No exploitable paths found in internal assessment.

*Note: External penetration test by a third party is planned for the first post-GA security review (v1.0.1 or v1.1.0 timeframe).*
