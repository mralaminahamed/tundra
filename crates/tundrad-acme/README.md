# tundrad-acme

ACME (Automatic Certificate Management Environment) client for Tundra, wrapping [`instant-acme`](https://github.com/InstantDomainSearch/instant-acme).

## Supported CAs

- Let's Encrypt (production + staging)
- ZeroSSL (account-key-pinned)
- Any RFC 8555-compliant ACME server

## Challenge types

| Type | When used |
|------|-----------|
| HTTP-01 | Domain DNS not managed by Tundra; served at `/.well-known/acme-challenge/<token>` via Nginx |
| DNS-01 | Wildcard certificates; requires Tundra to control the domain's DNS zone |

## Certificate lifecycle

1. `AcmeService::order(domains)` — create ACME order, return challenges
2. `AcmeService::validate(challenges)` — provision challenge responses, poll until valid
3. `AcmeService::finalize(order, csr)` — submit CSR, download certificate chain
4. Scheduled job triggers renewal at T−30 days; alert fires at T−14 if renewal fails

## Storage

ACME account keys and certificate/private key pairs are stored in the `certificates` and `acme_accounts` tables (PostgreSQL). Private keys are encrypted with `EncryptedField` under the master key.
