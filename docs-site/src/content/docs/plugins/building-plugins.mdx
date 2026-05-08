---
title: Building Plugins
description: Create Wasmtime plugins for Tundra using the plugin SDK and WIT contracts.
sidebar:
  order: 3
---

import { Aside, Steps } from '@astrojs/starlight/components'

## SDK setup

Tundra plugins are WebAssembly components targeting `wasm32-wasip2`. The SDK provides WIT bindings for all host capabilities.

```bash
cargo new --lib my-tundra-plugin
cd my-tundra-plugin
```

`Cargo.toml`:
```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
tundra-plugin-sdk = "1.0"
wit-bindgen = "0.36"
```

## Plugin manifest

Create `tundra-plugin.toml`:

```toml
[plugin]
id          = "com.example.my-plugin"
name        = "My Plugin"
version     = "1.0.0"
description = "Does something useful"
author      = "Your Name <you@example.com>"
license     = "MIT"

[capabilities]
http_outbound = ["api.example.com"]   # allowlisted domains
kv_read       = true
kv_write      = true
events_publish = true

[hooks]
on_deployment_complete = "handle_deployment"   # exported function name
```

## Writing a plugin

```rust
use tundra_plugin_sdk::prelude::*;

// Called by Tundra when a deployment completes
#[tundra_hook]
fn handle_deployment(ctx: DeploymentContext) -> Result<()> {
    let site = ctx.site();

    // Write to plugin kv store
    tundra_sdk::kv::set("last_deploy", &site.id)?;

    // Make an outbound HTTP request (must be in capabilities allowlist)
    let resp = tundra_sdk::http::post(
        "https://api.example.com/webhook",
        &json!({ "site": site.id, "status": "deployed" }),
    )?;

    tundra_sdk::audit::log("deployment.notified", &site.id)?;
    Ok(())
}
```

## Building

```bash
# Install the wasm target
rustup target add wasm32-wasip2

# Build
cargo build --release --target wasm32-wasip2

# The plugin is at target/wasm32-wasip2/release/my_tundra_plugin.wasm
```

## Testing locally

```bash
# Install the Tundra plugin dev runner
cargo install tundra-plugin-dev

# Run against a local Tundra instance
tundra-plugin-dev run \
  --plugin target/wasm32-wasip2/release/my_tundra_plugin.wasm \
  --tundra-url http://localhost:7400 \
  --token tnd_dev_<token>
```

## WIT contracts

The full WIT interface definitions are in `tundra-plugin-sdk/wit/`:

| Interface | What it exposes |
|-----------|----------------|
| `tundra:plugin/http` | Outbound HTTP with allowlist enforcement |
| `tundra:plugin/kv` | Isolated key-value store |
| `tundra:plugin/events` | Publish events to tundrad |
| `tundra:plugin/audit` | Write audit log entries |
| `tundra:plugin/sites` | Read site metadata |
| `tundra:plugin/deployments` | Trigger deployments |

<Aside type="note">
Plugin APIs are versioned. The major version in the WIT namespace (`tundra:plugin/http@1.0.0`) is guaranteed stable for all 1.x releases of Tundra.
</Aside>
