---
title: Upgrading
description: How to upgrade Tundra to a new version.
sidebar:
  order: 5
---

import { Aside } from '@astrojs/starlight/components'

## Before upgrading

1. **Read the changelog** — check [CHANGELOG.md](https://github.com/mralaminahamed/tundra/blob/main/CHANGELOG.md) for breaking changes.
2. **Back up your database** — `sudo -u tundra tundra-self-backup run`.
3. **Check migration notes** — `docs/UPGRADING.md` lists any manual steps required.

## Upgrade (systemd install)

```bash
# Download new binaries
VERSION=1.1.0
curl -fsSL "https://github.com/mralaminahamed/tundra/releases/download/v${VERSION}/tundrad-linux-x86_64.tar.gz" \
  | sudo tar -xz -C /usr/local/bin

# Apply migrations
sudo -u tundra tundrad migrate

# Restart services
sudo systemctl restart tundrad tundra-agent
```

## Upgrade (Docker Compose)

```bash
cd docs/09-deployment-bundle/prod
# Update TUNDRA_VERSION in .env
docker compose pull
docker compose up -d
```

<Aside type="note">
Tundra uses **up-only migrations**. There are no down migrations. To revert a deployment, perform a code revert and write a new forward migration. See `docs/UPGRADING.md` for the policy.
</Aside>

## Version policy

- **Patch releases** (1.0.x) — bug fixes only, always safe to upgrade
- **Minor releases** (1.x.0) — new features, backwards-compatible API
- **Major releases** (x.0.0) — may include breaking API or config changes; check UPGRADING.md

## Verifying a release

All releases include SLSA Level 3 provenance. Verify before installing in production:

```bash
# Install slsa-verifier
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest

# Verify binary
slsa-verifier verify-artifact tundrad-linux-x86_64.tar.gz \
  --provenance-path tundrad-linux-x86_64.tar.gz.intoto.jsonl \
  --source-uri github.com/mralaminahamed/tundra \
  --source-tag v1.0.0
```
