---
title: Databases
description: Provision and manage PostgreSQL, MySQL, MariaDB, and Valkey instances.
---

## Supported engines

| Engine | Versions |
|--------|---------|
| PostgreSQL | 16, 17, 18 |
| MySQL | 8.4 LTS |
| MariaDB | 11.4 LTS |
| Valkey (Redis-compatible) | 8 |

## Database servers

A **database server** is an engine installation on a managed Tundra server. One server can host multiple database engines.

**Add a database server:**  
Go to **DB Servers → Add** → select engine, version, and the Tundra server to install on.

## Databases

A **database** is a named database instance within a database server.

**Create a database:**  
Go to **Databases → New** → select server, enter name, charset, and collation.

## Users and access control

Create users and grant per-database privileges:

1. **DB Servers → [server] → Users → Add**
2. Set username and password (encrypted at rest)
3. **Databases → [database] → Access → Add Grant**
4. Select user and privilege level (SELECT, INSERT, ALL, etc.)

Connection strings are available in **Databases → [database] → Connection String** (step-up authentication required; logged in audit log).

## Backup integration

Database backups are handled by the backup subsystem using `pg_dump` / `mysqldump` into restic snapshots. See [Backups](/tundra/guides/backups/).

## WordPress database isolation

Each WordPress install automatically creates an isolated MySQL database and user. These are managed by the WordPress plugin and shown in **WordPress → [install] → Database**.
