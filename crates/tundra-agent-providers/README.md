# tundra-agent-providers

Concrete `Provider` trait implementations for each service type that `tundra-agent` can manage.

## Provider trait

```rust
pub trait Provider: Send + Sync {
    type State;
    async fn current_state(&self) -> Result<Self::State, ProviderError>;
    async fn apply(&self, desired: &Self::State) -> Result<(), ProviderError>;
}
```

## Providers

| Provider | Manages |
|----------|---------|
| `NginxProvider` | Nginx vhosts, SSL termination, upstream proxy |
| `PhpFpmProvider` | PHP-FPM pools (one per site, isolated Unix user) |
| `PostgresProvider` | PostgreSQL databases and users on managed DB servers |
| `MysqlProvider` | MySQL/MariaDB databases and users |
| `ValkeyProvider` | Valkey/Redis instance configuration |
| `SystemdProvider` | Arbitrary systemd units for non-PHP runtimes |
| `FirewallProvider` | nftables/iptables rules |
| `CertProvider` | TLS certificate deployment to Nginx |

## Privilege model

The agent runs as `tundra-agent` (unprivileged). Privileged operations (reloading Nginx, managing systemd units, applying firewall rules) are performed via a narrow `sudoers` allowlist — no unrestricted root access.
