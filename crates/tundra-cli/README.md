# tundra-cli

The `tundra` operator CLI — a thin client for `tundrad`'s REST API, used for scripting and server-side administration.

## Commands (planned)

```
tundra login                      # Authenticate and store session token
tundra logout

tundra operators list
tundra operators invite <email>

tundra servers list
tundra servers add <hostname>

tundra sites list
tundra sites create --domain <domain> --server <id>
tundra sites deploy <site-id>

tundra master-key generate        # Generate a new master key file
tundra master-key rotate          # Rotate the master key (re-encrypts all secrets)
tundra migrate run                # Apply pending database migrations
```

## Auth

Stores the session API token in `~/.config/tundra/credentials.toml` (mode 0600). All requests go through the `tundrad` REST API — the CLI never talks to the database directly.

## Build

```bash
cargo build --release -p tundra-cli
# Binary at: target/release/tundra
```
