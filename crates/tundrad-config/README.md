# tundrad-config

Layered configuration loader for `tundrad`. Built on [figment](https://github.com/SergioBenitez/Figment).

## Loading order

Later layers override earlier ones:

1. Built-in defaults (serde `Default` impls)
2. TOML file at `TUNDRA_CONFIG` env var, or `/etc/tundra/tundrad.toml`
3. `TUNDRA_`-prefixed environment variables (using `__` as nesting separator)
4. Bare `DATABASE_URL` env var (container/Compose convention)

## Key settings

```toml
[database]
url = "postgres://tundra:secret@localhost/tundra"
max_connections = 10

[valkey]
url = "redis://localhost:6379"

[server]
listen_addr = "0.0.0.0"
port = 7400
grpc_port = 7447

[master_key]
path = "/var/lib/tundra/data/master.key"

[log]
level = "info"
json = false

[telemetry]
otlp_endpoint = "http://otel-collector:4317"  # optional
service_name = "tundrad"
```

## Usage

```rust
let cfg = tundrad_config::load()?;
// or with an explicit path:
let cfg = tundrad_config::load_from("/etc/tundra/tundrad.toml")?;
```
