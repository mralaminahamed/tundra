---
title: REST Endpoints
description: Quick reference for all Tundra REST API endpoints.
sidebar:
  order: 4
---

Full specification: [`proto/openapi.yaml`](https://github.com/mralaminahamed/tundra/blob/main/proto/openapi.yaml)

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Password login |
| POST | `/api/v1/auth/logout` | Revoke session |
| POST | `/api/v1/auth/step-up` | Step-up re-authentication |
| POST | `/api/v1/auth/totp-verify` | Verify TOTP code |
| POST | `/api/v1/auth/passkey/begin` | Begin WebAuthn assertion |
| POST | `/api/v1/auth/passkey/complete` | Complete WebAuthn assertion |

## Setup

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/setup/status` | Check if first-time setup is needed |
| POST | `/api/v1/setup/init` | Create first owner account |

## Operators

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/operators` | List operators |
| POST | `/api/v1/operators` | Create operator |
| GET | `/api/v1/operators/me` | Get current operator |
| PATCH | `/api/v1/operators/me` | Update profile (name, phone, timezone, job_title) |
| DELETE | `/api/v1/operators/{id}` | Delete operator |
| GET | `/api/v1/operators/me/tokens` | List API tokens |
| POST | `/api/v1/operators/me/tokens` | Create API token |
| DELETE | `/api/v1/operators/me/tokens/{id}` | Revoke token |

## Servers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/servers` | List servers |
| POST | `/api/v1/servers` | Create server record |
| GET | `/api/v1/servers/{id}` | Get server |
| DELETE | `/api/v1/servers/{id}` | Delete server |
| POST | `/api/v1/servers/{id}/enrol` | Enroll agent |

## Sites

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sites` | List sites |
| POST | `/api/v1/sites` | Create site |
| GET | `/api/v1/sites/{id}` | Get site |
| PATCH | `/api/v1/sites/{id}` | Update site |
| DELETE | `/api/v1/sites/{id}` | Delete site |
| GET | `/api/v1/sites/{id}/deployments` | List deployments |
| POST | `/api/v1/sites/{id}/deploy` | Trigger deployment |
| GET | `/api/v1/sites/{id}/files` | List directory |
| GET | `/api/v1/sites/{id}/files/content` | Read file |
| PUT | `/api/v1/sites/{id}/files/content` | Write file |
| POST | `/api/v1/sites/{id}/files/upload` | Upload file |
| GET | `/api/v1/sites/{id}/files/download` | Download file/dir |
| POST | `/api/v1/sites/{id}/files/copy` | Copy |
| POST | `/api/v1/sites/{id}/files/move` | Move |
| DELETE | `/api/v1/sites/{id}/files` | Delete |

## Domains & DNS

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/domains` | List domains |
| POST | `/api/v1/domains` | Add domain |
| GET | `/api/v1/domains/{id}` | Get domain |
| DELETE | `/api/v1/domains/{id}` | Delete domain |
| GET | `/api/v1/domains/{id}/dns-records` | List DNS records |
| POST | `/api/v1/domains/{id}/dns-records` | Create record |
| PUT | `/api/v1/domains/{id}/dns-records/{rid}` | Update record |
| DELETE | `/api/v1/domains/{id}/dns-records/{rid}` | Delete record |
| POST | `/api/v1/domains/{id}/dns-records/batch` | Atomic batch replace |

## Databases

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/database-servers` | List DB servers |
| POST | `/api/v1/database-servers` | Add DB server |
| GET | `/api/v1/databases` | List databases |
| POST | `/api/v1/databases` | Create database |
| GET | `/api/v1/databases/{id}/connection-string` | Get connection string (step-up) |

## Backups

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/backup/targets` | List targets |
| POST | `/api/v1/backup/targets` | Add target |
| POST | `/api/v1/backup/targets/{id}/test` | Test connectivity |
| GET | `/api/v1/backup/jobs` | List jobs |
| POST | `/api/v1/backup/jobs` | Create job |
| POST | `/api/v1/backup/jobs/{id}/run` | Run now |
| GET | `/api/v1/backup/snapshots` | List snapshots |
| POST | `/api/v1/backup/snapshots/{id}/restore` | Initiate restore (preview) |
| POST | `/api/v1/backup/restores/{id}/confirm` | Confirm restore |

## Audit log

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audit-log` | Cursor-paginated audit entries |

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/healthz` | Liveness probe |
| GET | `/api/v1/readyz` | Readiness probe (includes DB check) |
