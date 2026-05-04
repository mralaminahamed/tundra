# Tundra — Plugin Architecture & Extensibility Plan

> **A hybrid plugin system: native Rust for trusted core plugins, WebAssembly Component Model for third-party plugins.**
> Plesk Migration is the reference core plugin and validates the entire plugin contract surface.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-technical-implementation-plan-v2.md`, `tundra-plesk-migration-plan-v1.md`
**Status:** Implementation-Ready Specification

---

## 1. Executive Summary

### 1.1 Why a Plugin System

Tundra's value proposition is unrestricted control over the server stack. That promise breaks if every new feature — a Cloudflare DNS provider, a custom backup target, a one-click Wagtail template, a Bangladeshi bKash payment-gateway monitor — requires forking the core. A first-class plugin system is the difference between Tundra remaining the operator's tool and Tundra becoming the operator's prison.

The plugin system has four explicit goals:

1. **Extensibility without forking.** Operators add, replace, and remove capabilities without touching Tundra source.
2. **Safety for third-party code.** Plugins from outside the core team execute in a sandbox; a malicious or buggy plugin cannot read the master key, exfiltrate database contents, or take down the panel.
3. **Native performance for trusted code.** Plugins shipped by the Tundra project (importers, providers, official integrations) compile into the same binary, with full access to internal APIs and zero per-call overhead.
4. **A well-defined contract.** Plugins implement stable interfaces declared in WIT (WebAssembly Interface Types) so they survive Tundra version upgrades.

### 1.2 The Hybrid Model

| Plugin Tier             | Execution                                                        | Trust Level | Source                                 | Use Cases                                                                            |
|-------------------------|------------------------------------------------------------------|-------------|----------------------------------------|--------------------------------------------------------------------------------------|
| **Core plugins**        | Native Rust, statically linked into `tundrad` and `tundra-agent` | Full trust  | First-party (Tundra repo)              | Plesk migration, official runtime providers, official backup targets                 |
| **Bundled plugins**     | Native Rust, dynamically loaded `.so`/`.dylib`                   | Full trust  | First-party but not in default install | Optional integrations: Cloudflare DNS, Mailgun smarthost, S3-compatible providers    |
| **Third-party plugins** | WebAssembly Component Model (WASIp2), executed by Wasmtime       | Sandboxed   | Anyone                                 | Custom one-click templates, exotic monitoring exporters, niche regional integrations |

Every plugin tier implements the **same WIT-defined interfaces**. A plugin can move between tiers without rewriting its logic — third-party WASM today, official native plugin tomorrow. This is intentional: it lets the community prototype freely while keeping a clear path to first-party adoption.

### 1.3 The Plesk Migration as Reference Plugin

The Plesk migration system described in `tundra-plesk-migration-plan-v1.md` is implemented as a **core plugin**, not as inline code in `tundrad`. This is a deliberate architectural choice:

- It validates the plugin contract surface against a real, complex, large workload before third parties depend on it.
- It demonstrates that even mission-critical functionality is plugin-shaped, which keeps the core small and the boundaries honest.
- It gives operators the option to trim the binary if they will never run a Plesk migration.
- It establishes a template for future migration plugins (cPanel, DirectAdmin, Onyx, ISPConfig).

If the plugin contracts cannot express the Plesk migration, the contracts are wrong — and we find out before locking the API.

---

## 2. Architectural Overview

### 2.1 Component Model

Tundra uses the **WebAssembly Component Model with WASIp2** (WebAssembly System Interface Preview 2) as the wire format for sandboxed plugins. This choice is informed by the state of the ecosystem in 2026:

- **Wasmtime** is a mature, security-audited, production-stable embedder maintained by the Bytecode Alliance.
- **WASIp2** standardizes async functions, sockets, HTTP, filesystems, and clocks — covering everything a plugin needs.
- **WIT (WebAssembly Interface Types)** allows plugin authors to write Rust, Go (via TinyGo), Python (via componentize-py), JavaScript (via jco), or C without locking in a host language.
- **Semver-aware linking** in Wasmtime resolves interface compatibility automatically: a plugin compiled against `tundra:plugin/host@1.0.0` will resolve cleanly when the host advertises `1.0.1`.

For native (core/bundled) plugins, Tundra defines parallel Rust traits whose method signatures mirror the WIT interfaces 1:1 — generated by the same `bindgen!` macro that produces WASM glue.

### 2.2 Topology

```
                    ┌───────────────────────────────────────────────┐
                    │                  tundrad (host)               │
                    │                                               │
                    │   ┌───────────────────────────────────────┐  │
                    │   │       Plugin Registry & Loader        │  │
                    │   └───────────────────────────────────────┘  │
                    │              │              │                 │
                    │              ▼              ▼                 │
                    │   ┌──────────────┐  ┌──────────────────┐    │
                    │   │ Native       │  │ WASM Runtime     │    │
                    │   │ plugin       │  │ (Wasmtime)       │    │
                    │   │ trait        │  │                  │    │
                    │   │ dispatcher   │  │ ┌──────────────┐ │    │
                    │   └──────────────┘  │ │ Plugin Inst. │ │    │
                    │       │             │ └──────────────┘ │    │
                    │       │             │ ┌──────────────┐ │    │
                    │       ▼             │ │ Plugin Inst. │ │    │
                    │   ┌──────────────┐  │ └──────────────┘ │    │
                    │   │ Core plugins │  │                  │    │
                    │   │ (in-binary)  │  │ Resource limits, │    │
                    │   │              │  │ capability gates │    │
                    │   │ - plesk-migr │  └──────────────────┘    │
                    │   │ - cf-dns     │                           │
                    │   │ - mailgun    │                           │
                    │   │   ...        │                           │
                    │   └──────────────┘                           │
                    └───────────────────────────────────────────────┘
                              │                       │
                              ▼                       ▼
                    ┌──────────────────┐   ┌──────────────────────┐
                    │ Tundra Host APIs │   │ External services    │
                    │ (DB, FS, KV,     │   │ (HTTPS, only with    │
                    │  events, jobs)   │   │  net capability)     │
                    └──────────────────┘   └──────────────────────┘
```

WASM plugins never speak directly to the panel database, the host filesystem, or the network. Every action goes through a host-provided import — the host enforces permission, audits, rate-limits.

### 2.3 What a Plugin Can and Cannot Do

| Capability                         | Core/Bundled (native)    | Third-Party (WASM)                                                          |
|------------------------------------|--------------------------|-----------------------------------------------------------------------------|
| Read panel database                | Yes (direct SQLx access) | No (mediated; declared queries only)                                        |
| Write panel database               | Yes                      | No (mediated; declared mutations only)                                      |
| Read host filesystem               | Yes                      | Only declared paths (capability-gated)                                      |
| Write host filesystem              | Yes                      | Only declared paths                                                         |
| Open arbitrary network connections | Yes                      | Only declared hosts (capability-gated)                                      |
| Spawn host processes               | Yes                      | No                                                                          |
| Use the master key directly        | Yes                      | Never — host signs/decrypts on plugin's behalf, plugin sees ciphertext only |
| Receive panel events               | Yes                      | Yes (subscriptions declared)                                                |
| Emit panel events                  | Yes                      | Yes (event types declared)                                                  |
| Define new HTTP endpoints          | Yes                      | Yes (path namespace gated)                                                  |
| Define new CLI subcommands         | Yes                      | Yes                                                                         |
| Define new UI pages                | Yes (React)              | Yes (declarative spec only — no arbitrary JS in panel)                      |
| Run scheduled tasks                | Yes                      | Yes (jobs run inside Wasmtime, time-limited)                                |
| Define new agent providers         | Yes                      | No (agent-side WASM is roadmap, not v1)                                     |

The "no agent-side WASM in v1" constraint is deliberate: provider plugins manipulate systemd, package managers, file ownership, and firewall state. The blast radius of a misbehaving agent-side plugin is far greater than a control-plane plugin. Core providers stay native until the WASM provider boundary is well-tested.

### 2.4 Where Plugins Live

| Tier        | Location                                                    | Loaded When                                                           |
|-------------|-------------------------------------------------------------|-----------------------------------------------------------------------|
| Core        | Compiled into `tundrad` binary (Cargo workspace member)     | Always (unless feature-gated off at build time)                       |
| Bundled     | `/usr/lib/tundra/plugins/<name>.so`                         | Listed in `/etc/tundra/plugins.toml`                                  |
| Third-party | `/var/lib/tundra/plugins/<plugin-id>/<version>/plugin.wasm` | Listed in `/etc/tundra/plugins.toml`; capabilities granted explicitly |

The loader is the same code path for all three tiers; only the linkage differs (static, dynamic, WASM instantiation).

---

## 3. The Plugin Contract (WIT)

The plugin contract is declared in WIT files in the `proto/wit/` directory of the Tundra source. The top-level world a plugin opts into is `tundra:plugin/host@1.0.0`.

### 3.1 The Plugin World

```wit
// proto/wit/host.wit
package tundra:plugin@1.0.0;

interface metadata {
    record manifest {
        id: string,                           // "com.example.cloudflare-dns"
        name: string,                         // human-readable
        version: string,                      // semver
        description: string,
        author: string,
        homepage: option<string>,
        license: string,
        tundra-min-version: string,           // minimum host version required
        capabilities: list<capability>,
        contributes: list<contribution>,
    }

    variant capability {
        net(net-capability),                  // restricted outbound HTTP
        fs(fs-capability),                    // restricted filesystem paths
        secret(secret-capability),            // request a named secret to be made available
        db-read(list<string>),                // table names allowed for read
        db-write(list<string>),               // table names allowed for write
        events-subscribe(list<string>),       // event types
        events-publish(list<string>),         // event types
        background-jobs(uint32),              // max concurrent jobs
    }

    record net-capability {
        hosts: list<string>,                  // ["api.cloudflare.com"]
        max-requests-per-minute: uint32,
        max-bytes-per-request: uint64,
    }

    record fs-capability {
        paths: list<string>,                  // ["/srv/tundra/staging"]
        mode: fs-mode,
    }

    enum fs-mode { read, write, read-write }

    record secret-capability {
        names: list<string>,                  // ["cloudflare.api-token"]
    }

    variant contribution {
        cli-subcommand(cli-contribution),
        http-route(http-contribution),
        ui-page(ui-contribution),
        dns-provider(dns-provider-contribution),
        backup-target(backup-target-contribution),
        app-template(app-template-contribution),
        importer(importer-contribution),
        // ... more contribution types added as the contract evolves
    }

    record cli-contribution {
        verb: string,                         // "tundra cf-dns sync"
        help: string,
    }

    record http-contribution {
        method: string,                       // "POST"
        path: string,                         // "/api/v1/plugins/cf-dns/sync"
        auth: http-auth,
    }

    enum http-auth { operator-session, api-token, none }

    // ... record types for each contribution
}

interface lifecycle {
    use metadata.{manifest};

    /// Called once when the plugin is loaded. Must return the manifest.
    init: func() -> result<manifest, string>;

    /// Called when the plugin is enabled (after capabilities granted).
    enable: func() -> result<_, string>;

    /// Called when the plugin is disabled.
    disable: func() -> result<_, string>;

    /// Called before the host process exits or the plugin is uninstalled.
    shutdown: func();
}

interface host-services {
    /// Tundra's panel database, scoped to declared tables.
    use db.{db-handle, query-result, query-error};

    /// Key-value store unique to this plugin.
    use kv.{kv-handle};

    /// Outbound HTTP, only to declared hosts.
    use http.{request, response, http-error};

    /// Filesystem within declared paths.
    use fs.{fs-handle};

    /// Secrets retrieval (decryption is host-side; plugin sees plaintext).
    use secrets.{secret-error};
    get-secret: func(name: string) -> result<string, secret-error>;

    /// Logging — written to the plugin's log channel.
    use logging.{log-level};
    log: func(level: log-level, message: string, fields: list<tuple<string, string>>);

    /// Emit a panel event.
    use events.{event};
    emit: func(event: event) -> result<_, string>;

    /// Run a background job.
    use jobs.{job-spec, job-handle};
    enqueue-job: func(spec: job-spec) -> result<job-handle, string>;

    /// Hold a deploy lock for a specific resource (idempotent, refcounted).
    acquire-lock: func(resource: string, ttl-seconds: uint32) -> result<u64, string>;
    release-lock: func(lock-id: u64);
}

world plugin {
    import host-services;
    export lifecycle;
    export metadata;
}
```

This is the abridged version of the contract. The full WIT files (in `proto/wit/`) define each contribution type — DNS provider, backup target, app template, importer — as its own interface that plugins selectively implement.

### 3.2 Native Plugin Trait Mirror

For native plugins, the same shape exists as Rust traits in the `tundra-plugin-sdk` crate:

```rust
// crates/tundra-plugin-sdk/src/lib.rs

#[async_trait::async_trait]
pub trait Plugin: Send + Sync + 'static {
    fn manifest(&self) -> PluginManifest;
    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError>;
    async fn disable(&self, host: &dyn HostServices) -> Result<(), PluginError>;
    async fn shutdown(&self);
}

#[async_trait::async_trait]
pub trait HostServices: Send + Sync {
    async fn db(&self) -> &dyn DbAccess;
    async fn kv(&self) -> &dyn KvStore;
    async fn http(&self) -> &dyn HttpClient;
    async fn fs(&self) -> &dyn FsAccess;
    async fn get_secret(&self, name: &str) -> Result<SecretBytes, HostError>;
    fn log(&self, level: tracing::Level, message: &str, fields: &[(&str, &str)]);
    async fn emit(&self, event: PluginEvent) -> Result<(), HostError>;
    async fn enqueue_job(&self, spec: JobSpec) -> Result<JobHandle, HostError>;
    async fn acquire_lock(&self, resource: &str, ttl: Duration) -> Result<LockGuard, HostError>;
}
```

A core plugin author writes Rust against `tundra-plugin-sdk` traits. A WASM plugin author writes against the same shape via WIT bindings. The semantics are identical; the linkage is different.

### 3.3 Per-Contribution Interfaces

Each contribution type has its own interface. As an illustrative example, the DNS provider contribution:

```wit
// proto/wit/dns-provider.wit
package tundra:plugin@1.0.0;

interface dns-provider {
    record dns-record {
        name: string,
        record-type: dns-record-type,
        content: string,
        ttl: uint32,
        priority: option<uint32>,
    }

    variant dns-record-type {
        a, aaaa, cname, mx, txt, srv, caa, ns, ptr, alias,
    }

    variant dns-error {
        not-found,
        unauthorized,
        rate-limited,
        upstream(string),
        invalid(string),
    }

    list-zones: func() -> result<list<string>, dns-error>;
    list-records: func(zone: string) -> result<list<dns-record>, dns-error>;
    create-record: func(zone: string, record: dns-record) -> result<_, dns-error>;
    update-record: func(zone: string, old: dns-record, new: dns-record) -> result<_, dns-error>;
    delete-record: func(zone: string, record: dns-record) -> result<_, dns-error>;
    propagate-status: func(zone: string, record: dns-record) -> result<propagation-status, dns-error>;
}
```

A plugin that implements `dns-provider` is automatically registered as a DNS provider option in Tundra's domain UI and CLI — operators can choose Cloudflare, Route53, or any third-party-implemented provider on a per-domain basis.

The same pattern applies to backup targets, app templates, monitoring exporters, payment gateway integrations, mail relays, and any other extension point. Each contribution interface is versioned semver-style; minor versions are additive, major versions are breaking, and the host accepts any plugin whose declared interface version is semver-compatible with what the host provides.

---

## 4. Plugin Lifecycle

### 4.1 States

```
       install                grant                enable
[absent] ─────> [installed] ─────> [granted] ─────> [enabled]
                    │                  │                │
                    │                  │                │ disable
                    │                  │                ▼
                    │                  └─────────── [granted]
                    │                                    │
                    │                                    │ revoke
                    │                                    ▼
                    └─────────────────────────────── [installed]
                                  │
                                  │ uninstall
                                  ▼
                              [absent]
```

| State       | Meaning                                                                               |
|-------------|---------------------------------------------------------------------------------------|
| `absent`    | Plugin not on disk                                                                    |
| `installed` | Bundle on disk, manifest validated, signature verified, but no permissions granted    |
| `granted`   | Operator has reviewed manifest's requested capabilities and granted them              |
| `enabled`   | Plugin is loaded into runtime, contributions are active, lifecycle.enable() succeeded |

### 4.2 Lifecycle Operations

```bash
tundra plugin install <source>          # absent → installed (verifies signature)
tundra plugin grant <id>                # installed → granted (interactive consent)
tundra plugin enable <id>               # granted → enabled
tundra plugin disable <id>              # enabled → granted
tundra plugin revoke <id>               # granted → installed
tundra plugin uninstall <id>            # any → absent (warns if enabled)
tundra plugin list                       # show all known plugins and states
tundra plugin info <id>                  # manifest, capabilities, contributions
tundra plugin logs <id> --follow         # plugin's log stream
tundra plugin update <id>                # check registry, bump version if available
```

**`<source>` accepted formats:**

- A plugin ID known to the registry: `com.example.cloudflare-dns`
- A registry URL: `https://plugins.tundra.dev/api/v1/plugins/com.example.cloudflare-dns`
- A local file path: `./my-plugin.tundra-plugin.tar.zst`
- A Git URL: `git+https://github.com/example/cf-dns-plugin@v1.2.0`
- An OCI registry URL: `oci://ghcr.io/example/cf-dns-plugin:1.2.0` (uses container image distribution as plugin distribution)

### 4.3 Capability Grant Flow

When an operator runs `tundra plugin grant`, the panel UI (or CLI) presents a structured capability review:

```
Plugin: Cloudflare DNS Provider (com.example.cloudflare-dns) v1.2.0
Author: Example Co.
Signature: VERIFIED (signed by ed25519:abc123...)

This plugin requests the following capabilities:

  [Network]
    ✓ Outbound HTTPS to api.cloudflare.com
      (rate limit: 60 requests/min, max 1 MB per response)

  [Secrets]
    ✓ Read secret named "cloudflare.api-token"

  [Database]
    ✓ Read access to: domains, dns_zones, dns_records
    ✓ Write access to: dns_records (for sync operations)

  [Events]
    ✓ Subscribe to: dns.zone.created, dns.zone.deleted
    ✓ Publish: cloudflare.sync.completed, cloudflare.sync.failed

  [Background jobs]
    ✓ Up to 4 concurrent jobs

Contributions this plugin will register:

  - DNS provider:        "Cloudflare"
  - CLI subcommand:      "tundra cf-dns sync"
  - HTTP route:          "POST /api/v1/plugins/cf-dns/webhook" (auth: api-token)
  - UI page:             "Settings > DNS > Cloudflare"

Grant these capabilities? [y/N]
```

A capability that's not on the requested list is **never granted**, even if the plugin's binary contains code that would use it. The host's enforcement is at the import boundary — unmediated access does not exist for WASM plugins, and native plugins are reviewed at first-party adoption.

### 4.4 Enable / Disable Semantics

`enable` is allowed to fail. If `lifecycle.enable()` returns an error, the plugin returns to `granted` and is not loaded. The error is shown to the operator. This pattern lets a plugin self-test its dependencies (API key validity, connectivity) at enable time rather than at first request time.

`disable` is allowed to take time. Background jobs the plugin has enqueued continue to drain; new requests are rejected. After all in-flight work completes, `lifecycle.disable()` is called and the plugin is unloaded from the runtime.

### 4.5 Uninstall

Uninstall removes the plugin from disk, removes its KV namespace, removes its grants, and removes any UI/CLI/HTTP contributions. **Plugin-owned data in panel database tables is not deleted automatically** — the plugin's manifest may declare tables it owns, but operators must explicitly opt into table cleanup with `tundra plugin uninstall <id> --purge-data`. This prevents accidental data loss when uninstalling a plugin temporarily for debugging.

---

## 5. Native Plugin Implementation

This section is the developer contract for first-party (core) and bundled native plugins.

### 5.1 Anatomy of a Native Plugin

```
crates/tundra-plugin-cloudflare-dns/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Plugin struct + impl Plugin
│   ├── api.rs              # Cloudflare API client
│   ├── provider.rs         # impl DnsProvider
│   ├── cli.rs              # CLI subcommand registration
│   └── ui.rs               # UI page descriptor
└── tests/
    ├── unit.rs
    └── integration.rs      # uses tundra-plugin-test-harness
```

```rust
// crates/tundra-plugin-cloudflare-dns/src/lib.rs

use tundra_plugin_sdk::*;

pub struct CloudflareDnsPlugin {
    config: Config,
}

#[async_trait::async_trait]
impl Plugin for CloudflareDnsPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest::builder()
            .id("com.tundra.cloudflare-dns")
            .name("Cloudflare DNS Provider")
            .version(env!("CARGO_PKG_VERSION"))
            .author("Tundra Team")
            .license("Apache-2.0")
            .tundra_min_version("1.0.0")
            .capability(Capability::net(NetCapability {
                hosts: vec!["api.cloudflare.com".into()],
                max_rpm: 60,
                max_bytes_per_request: 1_048_576,
            }))
            .capability(Capability::secret("cloudflare.api-token"))
            .capability(Capability::db_read(&["domains", "dns_zones", "dns_records"]))
            .capability(Capability::db_write(&["dns_records"]))
            .contributes(Contribution::DnsProvider(self.dns_provider_descriptor()))
            .contributes(Contribution::CliSubcommand(self.cli_descriptor()))
            .build()
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        let token = host.get_secret("cloudflare.api-token").await
            .map_err(PluginError::missing_secret)?;
        let api = api::CloudflareApi::new(token, host.http().await);
        api.verify_token().await
            .map_err(|e| PluginError::enable_failed(format!("Cloudflare token invalid: {e}")))?;
        host.log(tracing::Level::INFO, "Cloudflare DNS plugin enabled", &[]);
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> { Ok(()) }
    async fn shutdown(&self) {}
}

// Required: register the plugin so the host loader can discover it.
tundra_plugin_sdk::register_plugin!(CloudflareDnsPlugin::new);
```

### 5.2 Linkage

Core plugins are workspace members of the main Tundra Cargo workspace. They are discovered at compile time by an internal `inventory` crate that collects all `register_plugin!` invocations into a static slice the loader reads at startup.

Bundled plugins (those that ship as separate `.so`/`.dylib` files but are still first-party) use the same SDK. The dynamic-loading boundary uses `abi_stable` to ensure FFI-safe types across compiler versions.

### 5.3 Testing

The `tundra-plugin-test-harness` crate provides:

- `MockHostServices` — an in-memory implementation of `HostServices` for unit tests
- `PluginTestServer` — an embedded `tundrad` instance for integration tests, with a real PostgreSQL test container

```rust
#[tokio::test]
async fn cloudflare_plugin_lists_zones() {
    let host = MockHostServices::new()
        .with_secret("cloudflare.api-token", "test-token")
        .with_http_mock("https://api.cloudflare.com/client/v4/zones", mock_zone_list_response());

    let plugin = CloudflareDnsPlugin::new();
    plugin.enable(&host).await.unwrap();

    let provider: &dyn DnsProvider = plugin.as_dns_provider();
    let zones = provider.list_zones().await.unwrap();
    assert_eq!(zones, vec!["example.com".to_string()]);
}
```

---

## 6. WASM Plugin Implementation

### 6.1 Author Toolchain

Plugin authors choose a guest language. Tundra publishes templates for each:

| Language                | Tooling                    | Template Repo                   |
|-------------------------|----------------------------|---------------------------------|
| Rust                    | `cargo-component`          | `tundra-plugin-template-rust`   |
| Go (TinyGo)             | `wasm-tools component new` | `tundra-plugin-template-go`     |
| Python                  | `componentize-py`          | `tundra-plugin-template-python` |
| JavaScript / TypeScript | `jco componentize`         | `tundra-plugin-template-js`     |

Rust is the recommended language because the WIT bindings are most ergonomic and the resulting `.wasm` binaries are smallest. Other languages are supported equally at the contract level — they trade binary size for author familiarity.

### 6.2 A Rust WASM Plugin Example

```rust
// my-plugin/src/lib.rs
wit_bindgen::generate!({
    world: "plugin",
    path: "../wit/host.wit",
});

use exports::tundra::plugin::lifecycle::Guest;
use exports::tundra::plugin::dns_provider::Guest as DnsProviderGuest;

struct MyPlugin;

impl Guest for MyPlugin {
    fn init() -> Result<Manifest, String> {
        Ok(Manifest {
            id: "com.example.my-plugin".into(),
            name: "My Plugin".into(),
            version: "1.0.0".into(),
            // ...
        })
    }

    fn enable() -> Result<(), String> {
        tundra::plugin::host_services::log(LogLevel::Info, "Plugin enabled", &[]);
        Ok(())
    }

    fn disable() -> Result<(), String> { Ok(()) }
    fn shutdown() {}
}

impl DnsProviderGuest for MyPlugin {
    fn list_zones() -> Result<Vec<String>, DnsError> {
        let resp = tundra::plugin::host_services::http::get(
            "https://api.example.com/zones"
        ).map_err(|e| DnsError::Upstream(e.to_string()))?;
        // ...
    }
    // ... rest of DnsProvider methods
}

export!(MyPlugin);
```

Build:

```bash
cargo component build --release --target wasm32-wasip2
# Output: target/wasm32-wasip2/release/my_plugin.wasm
```

### 6.3 Bundle Format

A WASM plugin is distributed as a `.tundra-plugin.tar.zst` archive containing:

```
my-plugin.tundra-plugin.tar.zst
├── manifest.toml             # Cached manifest (must match plugin.wasm's init() result)
├── plugin.wasm               # The compiled component
├── plugin.wasm.sig           # ed25519 signature over plugin.wasm
├── plugin.wasm.sha256        # checksum
├── README.md
├── LICENSE
└── ui/                       # Optional bundled UI assets
    ├── pages/
    │   └── settings.json     # Declarative UI page spec
    └── icons/
        └── plugin-icon.svg
```

The signature is verified at install time. Without a valid signature, install requires `--allow-unsigned` and is logged as a warning in the audit trail.

### 6.4 WASM Sandbox Configuration

Wasmtime is configured with strict defaults:

| Setting                | Value                                                     |
|------------------------|-----------------------------------------------------------|
| `epoch_interruption`   | enabled (preempts long-running plugin code)               |
| `consume_fuel`         | enabled, default 100M instructions per call               |
| `memory_max_size`      | 256 MB per instance (configurable per-plugin in manifest) |
| `wasm_threads`         | disabled                                                  |
| `wasm_simd`            | enabled (perf wins are worth it)                          |
| `wasm_multi_memory`    | disabled                                                  |
| `wasm_bulk_memory`     | enabled                                                   |
| `cranelift_opt_level`  | `Speed` (release builds)                                  |
| `parallel_compilation` | enabled                                                   |

Each plugin instantiation has its own `Store`. Stores are not shared between calls — every host invocation of a plugin export creates a fresh execution context, with the plugin's KV state preserved in the host between calls.

### 6.5 Resource Limits

Per-plugin resource limits are declared in the plugin manifest and enforced by the host:

```toml
[limits]
memory_mb = 64
cpu_fuel_per_call = 50_000_000
http_requests_per_minute = 30
db_queries_per_call = 100
max_call_duration_seconds = 30
```

The host sets these on every Wasmtime `Store` it creates for the plugin. A plugin that exhausts fuel is trapped, the call returns an error to the host, and the failure is logged and counted toward the plugin's health score.

### 6.6 Health Tracking

Every plugin call is timed and outcome-tagged. The host maintains a rolling 24-hour window:

| Metric           | Threshold for "unhealthy"             |
|------------------|---------------------------------------|
| Error rate       | > 5% over 1h                          |
| p99 latency      | > 10× median over 1h                  |
| Trap rate (WASM) | > 1% over 1h                          |
| Memory peak      | > 80% of allocated for >5 calls in 1h |

An unhealthy plugin gets a warning in the operator's dashboard. After 6 hours of unhealthy state, the plugin is auto-disabled with an alert. The operator can re-enable manually after investigation.

---

## 7. Host APIs Available to Plugins

This is the concrete surface area exposed via `host-services`. Every entry has a WIT signature and a Rust trait method; only the WIT version is shown for brevity.

### 7.1 Database Access (Mediated)

```wit
interface db {
    resource db-handle {
        // Queries are pre-compiled at host load time from the plugin's
        // declared queries.toml. A plugin cannot run arbitrary SQL.
        query: func(name: string, args: list<value>) -> result<query-result, query-error>;
        execute: func(name: string, args: list<value>) -> result<u64, query-error>;
        transaction: func(handler: borrow<tx-handler>) -> result<_, query-error>;
    }
    // ...
}
```

A plugin's `queries.toml`:

```toml
[queries.list-domains-without-cloudflare]
sql = """
SELECT d.id, d.name FROM domains d
LEFT JOIN dns_zones z ON z.domain_id = d.id
WHERE z.id IS NULL
"""
returns = ["i64", "string"]

[queries.upsert-cf-zone-mapping]
sql = """
INSERT INTO plugin_cf_dns_zones (domain_id, cf_zone_id)
VALUES ($1, $2)
ON CONFLICT (domain_id) DO UPDATE SET cf_zone_id = excluded.cf_zone_id
"""
args = ["i64", "string"]
```

Every query is reviewed by the host at install time. The host validates that:
- Tables referenced are in the plugin's `db-read`/`db-write` capability list
- The query is parseable and statically safe (no dynamic SQL construction)
- The argument types match what the plugin declares

This eliminates SQL injection and unauthorized data access by construction.

### 7.2 KV Store

Each plugin gets a private KV namespace, backed by Valkey under the key prefix `plugin:<plugin-id>:`. Limits: 100 MB per namespace, 10k keys, 1 MB per value. Eviction policy: none — operator alerted at 80% capacity.

### 7.3 Outbound HTTP

The plugin's `net` capability declares allowed hosts. The host:

- Resolves DNS host-side (plugins cannot resolve arbitrary hostnames)
- Validates TLS server certificates (no opt-out)
- Enforces rate limits per declared rule
- Strips request headers that could leak host info (`Authorization` to non-declared hosts, `Cookie`, etc.)
- Logs every request to the audit log

### 7.4 Filesystem

Restricted to declared paths. A path declared `read` mode is opened read-only. A path declared `write` mode is opened in `O_CREAT | O_WRONLY | O_TRUNC` — no random access overwrites of existing files unless `read-write` mode is granted.

Symlink traversal is blocked: the host resolves `..` and symlinks before passing the FD to the plugin, and rejects any access that escapes the declared root.

### 7.5 Secrets

The host's secret manager (Tundra's master-key-encrypted secret store) holds named secrets. A plugin requests `secret-capability` for specific secret names, then calls `get-secret(name)` at runtime. The plaintext is returned only inside the plugin's WASM linear memory; the host wipes its own copy immediately after the call returns. Plaintext is never logged.

### 7.6 Events

Plugins subscribe to events by name patterns:

```toml
[events.subscribe]
- "site.deployed"
- "deployment.succeeded"
- "deployment.failed"
- "dns.zone.*"               # wildcard
```

When a matching event fires, the host calls the plugin's `on-event` export with a deserialized event struct. Calls are queued (not blocking the publisher) and are subject to the plugin's job-concurrency cap.

Plugins publish events with `emit(event)`. The host validates that the event type is in the plugin's `events-publish` capability before the event reaches the bus.

### 7.7 Background Jobs

A plugin can enqueue a job that runs later (or on a schedule). Jobs run inside the same Wasmtime store family as the plugin's request handlers; resource limits apply.

```wit
record job-spec {
    name: string,             // plugin-defined job name
    payload: list<u8>,        // opaque to host
    run-at: option<datetime>, // None = ASAP
    cron: option<string>,     // recurring
    timeout-seconds: uint32,
    max-retries: uint8,
}
```

The job's exported handler is `on-job(spec) -> result<_, string>`.

### 7.8 Locking

Distributed locks via Valkey, scoped to the plugin's namespace. Used by plugins that need to serialize work against shared resources (e.g., "only one Cloudflare sync per zone at a time"). Locks have a TTL; the host renews active locks on the plugin's behalf if the plugin holds them past half-TTL.

---

## 8. Plugin Contributions to UI / CLI / HTTP

### 8.1 UI Contributions

WASM plugins **cannot inject arbitrary JavaScript** into the panel UI. Instead, they contribute declarative page specifications:

```json
{
  "pages": [
    {
      "id": "cloudflare-dns-settings",
      "parent": "settings.dns",
      "title": "Cloudflare",
      "icon": "cloud",
      "layout": [
        { "kind": "form", "id": "credentials", "title": "API Credentials", "fields": [
            { "name": "api_token", "label": "API Token", "type": "secret", "required": true },
            { "name": "default_proxy", "label": "Proxy through Cloudflare", "type": "boolean" }
        ], "submit": { "endpoint": "POST /api/v1/plugins/cf-dns/credentials" } },
        { "kind": "table", "id": "zones", "title": "Mapped Zones",
          "data_source": "GET /api/v1/plugins/cf-dns/zones",
          "columns": [
            { "key": "domain", "label": "Domain" },
            { "key": "cf_zone_id", "label": "Cloudflare Zone ID" },
            { "key": "status", "label": "Status", "renderer": "status-badge" }
          ],
          "actions": [
            { "label": "Sync now", "endpoint": "POST /api/v1/plugins/cf-dns/sync/{domain}" }
          ]
        }
      ]
    }
  ]
}
```

The Tundra UI renders these specs using a fixed library of components (forms, tables, charts, status badges, etc.). This eliminates the most common XSS, supply-chain, and CSP-bypass attack surfaces from third-party plugins. Native plugins have the same option but may also ship custom React components — those are reviewed at first-party adoption.

### 8.2 CLI Contributions

Plugins register subcommands by declaring them in the manifest:

```toml
[[contributes.cli]]
verb = "cf-dns sync"
help = "Manually trigger a Cloudflare DNS sync for one or all domains"
args = [
  { name = "domain", optional = true, help = "Specific domain (default: all)" },
  { name = "force", flag = true, help = "Re-push records even if unchanged" }
]
```

The `tundra` CLI dispatches `tundra cf-dns sync example.com --force` to the plugin's `on-cli-invoke` export.

### 8.3 HTTP Contributions

Plugins declare HTTP routes that mount under `/api/v1/plugins/<plugin-id>/*`:

```toml
[[contributes.http]]
method = "POST"
path = "/sync/{domain}"
auth = "operator-session"
handler = "sync_handler"
```

The host's Axum router prefixes all plugin routes under `/api/v1/plugins/<plugin-id>` to prevent collision. The auth middleware runs before the request reaches the plugin; an unauthenticated request never invokes the plugin.

---

## 9. Plugin Registry (v1.0)

The v2 marketplace is out of scope for this document. The v1.0 registry is a much simpler, manifest-based mechanism that gets plugins discoverable today.

### 9.1 Registry Format

A registry is a static HTTPS endpoint serving a JSON index:

```
https://plugins.tundra.dev/api/v1/index.json
```

```json
{
  "schema_version": 1,
  "updated_at": "2026-05-02T10:00:00Z",
  "plugins": [
    {
      "id": "com.tundra.plesk-migration",
      "name": "Plesk Obsidian Migration",
      "tier": "core",
      "kind": "native",
      "official": true,
      "description": "Migrate sites, mailboxes, databases, and DNS from Plesk Obsidian",
      "latest_version": "1.0.0",
      "tundra_compat": ">=1.0.0",
      "homepage": "https://github.com/mralaminahamed/tundra",
      "license": "Apache-2.0",
      "downloads_url": "https://github.com/mralaminahamed/tundra/releases/download/v1.0.0/plesk-migration-1.0.0.tundra-plugin.tar.zst",
      "signature_url": "https://github.com/mralaminahamed/tundra/releases/download/v1.0.0/plesk-migration-1.0.0.tundra-plugin.tar.zst.sig",
      "signing_key_id": "ed25519:tundra-core@2026"
    },
    {
      "id": "com.example.cloudflare-dns",
      "name": "Cloudflare DNS Provider",
      "tier": "third-party",
      "kind": "wasm",
      "official": false,
      "description": "DNS provider integration for Cloudflare",
      "latest_version": "1.2.0",
      "tundra_compat": ">=1.0.0,<2.0.0",
      "homepage": "https://github.com/example/tundra-cloudflare-dns",
      "license": "MIT",
      "downloads_url": "https://github.com/example/tundra-cloudflare-dns/releases/download/v1.2.0/cloudflare-dns.tundra-plugin.tar.zst",
      "signature_url": "https://github.com/example/tundra-cloudflare-dns/releases/download/v1.2.0/cloudflare-dns.tundra-plugin.tar.zst.sig",
      "signing_key_id": "ed25519:abc123..."
    }
  ]
}
```

### 9.2 Multiple Registries

Operators can configure multiple registries:

```toml
# /etc/tundra/registries.toml
[[registry]]
name = "official"
url = "https://plugins.tundra.dev/api/v1/index.json"
trust = "high"

[[registry]]
name = "company-internal"
url = "https://plugins.example-corp.internal/index.json"
trust = "high"
auth = { kind = "bearer", env_var = "INTERNAL_REGISTRY_TOKEN" }

[[registry]]
name = "community"
url = "https://community.tundra-plugins.org/index.json"
trust = "low"     # default deny on install; operator must explicitly --allow-untrusted
```

### 9.3 Signing Keys

Tundra ships with an embedded list of trusted root signing keys for `official` plugins. Third-party publishers register their public keys with the registry; the registry signs the index file itself, so a tampered index is detected before any plugin is downloaded.

### 9.4 Operator-Hosted Plugins

Operators with no internet access — or who don't want the public registry — can install plugins from local files or internal Git repositories without ever touching `plugins.tundra.dev`. This is a deliberate first-class flow, not an afterthought.

---

## 10. Security Model

### 10.1 Threat Model

The plugin system is designed against three primary threats:

1. **Supply-chain attack** — a compromised plugin author publishes a malicious update to a previously trusted plugin.
2. **Confused-deputy attack** — a plugin convinces the host to perform an action that violates the plugin's declared capabilities.
3. **Resource exhaustion** — a buggy or malicious plugin tries to consume CPU, memory, or network resources beyond its share, degrading other workloads.

### 10.2 Mitigations

| Threat              | Mitigation                                                                                                                                                |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Supply-chain        | Signature verification at install; capability re-grant required on every update (operator must re-acknowledge if a new version requests new capabilities) |
| Supply-chain        | Reproducible builds verified against published checksums; SBOM published with each release                                                                |
| Confused-deputy     | All host APIs validate caller identity; no API "promotes" the plugin's authority                                                                          |
| Confused-deputy     | Database queries are pre-declared; no dynamic SQL generation possible from plugin                                                                         |
| Resource exhaustion | Per-plugin fuel, memory, time limits enforced by Wasmtime                                                                                                 |
| Resource exhaustion | Per-plugin rate limits on HTTP, DB queries, jobs                                                                                                          |
| Resource exhaustion | Auto-disable on sustained unhealthy state                                                                                                                 |

### 10.3 What WASM Plugins Cannot Do (Even With Bugs)

- Access the master key in plaintext (host signs/decrypts; plugin only sees ciphertext or pre-decrypted secret values it requested)
- Read another plugin's KV namespace
- Write to another plugin's database tables
- Exfiltrate data to a non-declared network host
- Read files outside declared paths
- Spawn host processes
- Survive `disable` (all state in linear memory is dropped on store close)
- Persist code outside its bundle (Wasmtime cannot self-modify on disk)

### 10.4 Audit

Every plugin lifecycle event, every capability grant, every plugin-initiated DB write, every plugin-initiated HTTP request to a non-cached endpoint is logged to `audit_log` with:

- Plugin ID and version
- Operator who initiated (where applicable)
- Capability invoked
- Inputs (with secrets redacted)
- Outcome
- Timestamp, source IP

Operators can run `tundra plugin audit <id>` for a focused view.

### 10.5 Kill Switch

The host has a global kill switch:

```bash
tundra plugin emergency-stop --all
tundra plugin emergency-stop <id>
```

This disables plugins immediately, drops in-flight calls, revokes capabilities to `installed` state. Used in incident response.

The official registry can also publish a **revocation list** that the host fetches periodically. A plugin or specific version on the revocation list is immediately disabled across all installations that fetch the list. Operators can disable revocation-list checking, but it is enabled by default for installations using the official registry.

---

## 11. The Plesk Migration Reference Plugin

This section specifies how the Plesk migration system from `tundra-plesk-migration-plan-v1.md` is delivered as a core plugin, and what each contribution looks like.

### 11.1 Plugin Identity

```toml
id = "com.tundra.plesk-migration"
name = "Plesk Obsidian Migration"
version = "1.0.0"
author = "Tundra Team"
license = "Apache-2.0"
tier = "core"               # statically linked into tundrad
kind = "native"
official = true
tundra_min_version = "1.0.0"
description = """
Migrate sites, mailboxes, databases, DNS zones, certificates, and scheduled
tasks from Plesk Obsidian 18.0.70+ to Tundra. Supports parallel and in-place
migration with scheduled-window or zero-downtime cutover strategies.
"""
```

### 11.2 Capabilities Requested

```toml
[[capabilities]]
kind = "net"
hosts = ["*"]                            # source Plesk server hostname (operator-provided per migration)
max_rpm = 600
max_bytes_per_request = 5_368_709_120    # 5 GB (large bundle transfers)

[[capabilities]]
kind = "fs"
paths = ["/var/lib/tundra/migrations"]
mode = "read-write"

[[capabilities]]
kind = "secret"
names = [
  "plesk-migration.ssh-key",             # SSH key used to access source servers
  "plesk-migration.transfer-recipient",  # age public key for bundle encryption
]

[[capabilities]]
kind = "db-read"
tables = ["servers", "sites", "domains", "operators"]

[[capabilities]]
kind = "db-write"
tables = [
  "migration_sources",
  "migration_jobs",
  "migration_acceptance_checks",
  "migration_bridges",
  # The plugin can create Sites, Applications, etc. but only as part of an
  # in-progress migration job; this is enforced by the plugin's logic plus
  # transactional invariants on the schema.
  "sites",
  "applications",
  "deployments",
  "releases",
  "environment_variables",
  "databases",
  "database_users",
  "database_grants",
  "mail_domains",
  "mailboxes",
  "mail_aliases",
  "dns_zones",
  "dns_records",
  "certificates",
  "scheduled_tasks",
]

[[capabilities]]
kind = "events-subscribe"
events = ["site.created", "site.deleted"]    # for cleanup on rollback

[[capabilities]]
kind = "events-publish"
events = [
  "plesk-migration.inventory.completed",
  "plesk-migration.capture.completed",
  "plesk-migration.restore.completed",
  "plesk-migration.cutover.completed",
  "plesk-migration.rollback.triggered",
  "plesk-migration.failed",
]

[[capabilities]]
kind = "background-jobs"
max_concurrent = 8
```

Note that this plugin requests broad `db-write` access, which is unusual. This is precisely why migration is a **core (native) plugin**, not a third-party WASM plugin: the trust level required for what migration must do is too high for the sandboxed third-party tier. The hybrid model exists so that complex, trust-heavy work like migration can be expressed in the plugin contract without compromising the security posture for third-party extensions.

### 11.3 Contributions

```toml
[[contributes]]
kind = "cli-subcommand"
verb = "migrate"
help = "Manage migrations from external panels to Tundra"
subcommands = [
  { verb = "source",        help = "Manage migration sources (Plesk servers)" },
  { verb = "inventory",     help = "Inventory a configured source" },
  { verb = "plan",          help = "Generate a migration plan document" },
  { verb = "run",           help = "Execute a per-site migration" },
  { verb = "verify",        help = "Verify a restored site" },
  { verb = "accept",        help = "Mark acceptance checks pass/fail" },
  { verb = "cutover",       help = "Cut over DNS to Tundra" },
  { verb = "watch",         help = "Tail migration job state" },
  { verb = "finalize",      help = "Mark migration complete" },
  { verb = "rollback",      help = "Roll back a migration" },
  { verb = "list",          help = "List migration jobs" },
  { verb = "bridge",        help = "Manage active bridges (mail, http)" },
]

[[contributes]]
kind = "http-route"
method = "POST"
path = "/sources"
auth = "operator-session"

[[contributes]]
kind = "http-route"
method = "POST"
path = "/sources/{id}/inventory"
auth = "operator-session"

[[contributes]]
kind = "http-route"
method = "GET"
path = "/jobs"
auth = "operator-session"

[[contributes]]
kind = "http-route"
method = "POST"
path = "/jobs"
auth = "operator-session"

[[contributes]]
kind = "http-route"
method = "POST"
path = "/jobs/{id}/cutover"
auth = "operator-session"

# ... full route list elided

[[contributes]]
kind = "ui-page"
parent = "tools"
id = "migrations"
title = "Migrations"
icon = "Truck"
spec_path = "ui/pages/migrations.json"

[[contributes]]
kind = "importer"
source_kind = "plesk-obsidian"
display_name = "Plesk Obsidian"
supported_versions = ">=18.0.70"
```

The `importer` contribution is itself an extension point: any future panel migration plugin (cPanel, DirectAdmin, etc.) declares `kind = "importer"` and Tundra's "Add Migration Source" wizard automatically discovers them.

### 11.4 Plugin-Specific Schema

The migration plan in `tundra-plesk-migration-plan-v1.md` §10 defines four tables. These tables are **owned by the plugin**:

```toml
[[schema.tables]]
name = "migration_sources"
owner = "com.tundra.plesk-migration"
on_uninstall = "preserve"   # never auto-dropped

[[schema.tables]]
name = "migration_jobs"
owner = "com.tundra.plesk-migration"
on_uninstall = "preserve"

[[schema.tables]]
name = "migration_acceptance_checks"
owner = "com.tundra.plesk-migration"
on_uninstall = "preserve"

[[schema.tables]]
name = "migration_bridges"
owner = "com.tundra.plesk-migration"
on_uninstall = "preserve"
```

The plugin manages its migration tables. The host applies the plugin's migrations on plugin enable, in a versioned migration directory just like core schema migrations.

### 11.5 Required Importer Interface

The migration plugin implements the `importer` interface defined in WIT:

```wit
// proto/wit/importer.wit
package tundra:plugin@1.0.0;

interface importer {
    record source-spec {
        kind: string,                          // "plesk-obsidian"
        hostname: string,
        ssh-credentials: ssh-credentials,
    }

    record ssh-credentials {
        user: string,
        port: option<uint16>,
        secret-name-private-key: string,
    }

    record inventory-result {
        source-version: string,
        sites: list<inventoried-site>,
        captured-at: datetime,
    }

    record inventoried-site {
        domain: string,
        size-bytes: uint64,
        application-type: string,
        databases: list<string>,
        mailboxes: list<string>,
        notes: option<string>,
    }

    inventory: func(source: source-spec) -> result<inventory-result, importer-error>;
    capture: func(source: source-spec, domain: string, output-path: string) -> result<bundle-info, importer-error>;
    restore: func(bundle-path: string, target-server-id: u64) -> result<u64, importer-error>;  // returns site_id
    verify: func(job-id: u64) -> result<verification-report, importer-error>;
    cutover-prepare: func(job-id: u64) -> result<cutover-plan, importer-error>;
    rollback: func(job-id: u64, scope: rollback-scope) -> result<_, importer-error>;
}
```

This is the **contract** every migration plugin must satisfy. The cPanel migration plugin (future), the DirectAdmin migration plugin (future), and any third-party migration plugin all implement the same interface. Tundra's UI doesn't know about Plesk specifically — it knows about importers, and Plesk happens to be one.

### 11.6 Why This Matters

Implementing Plesk migration as a core plugin proves the contract surface is sufficient for genuinely complex work — multi-server orchestration, encrypted bundle transfer, large database management, mail server data preservation, DNS zone export. If the WIT and host APIs can express this, they can express almost any reasonable plugin a third party would build.

This is the difference between a "plugin system" that exists on paper and one that has been validated against real workload pressure. The Plesk plugin is also the first to feel any contract change — we will not break the import contract without breaking Plesk migration first, which is a strong incentive against carelessly evolving the API.

---

## 12. Plugin SDK Roadmap

### 12.1 Initial Release (v1.0 of Tundra)

Shipped:

- `tundra-plugin-sdk` Rust crate with traits, `register_plugin!` macro, `MockHostServices`
- WIT interface package `tundra:plugin@1.0.0` covering all interfaces in this document
- Plugin templates for Rust (cargo-component) and JavaScript (jco)
- `tundra plugin` CLI subcommands
- Plugin registry index format (v1)
- The Plesk Migration core plugin
- Five additional bundled plugins as ecosystem starters:
  - Cloudflare DNS provider
  - Mailgun smarthost relay
  - S3-compatible backup target
  - Slack alerting channel
  - Discord alerting channel

### 12.2 Post-v1.0 Roadmap

| Milestone | Item                                                                        |
|-----------|-----------------------------------------------------------------------------|
| v1.1      | Go (TinyGo) and Python (componentize-py) plugin templates                   |
| v1.2      | Plugin developer portal at plugins.tundra.dev with submission workflow      |
| v1.3      | Plugin marketplace UI in panel (browse, search, install)                    |
| v2.0      | Agent-side WASM plugins (the `forge-agent` provider boundary opens to WASM) |
| v2.1      | Multi-tenant signing key delegation for organization-managed registries     |

### 12.3 Stability Guarantees

The `tundra:plugin@1.x` WIT interface is stable for the entire 1.x line. Additive changes (new methods on existing interfaces, new contribution types) are minor-version bumps. Breaking changes wait for `tundra:plugin@2.0`. A plugin built against `1.0` is guaranteed to load on a Tundra host running `1.5` without modification.

The native Rust SDK follows the same semver discipline.

---

## 13. Performance Targets

| Metric                                         | Target                     |
|------------------------------------------------|----------------------------|
| Plugin cold load (WASM, ~5 MB)                 | < 200 ms                   |
| Plugin warm call (WASM)                        | < 5 ms overhead vs. native |
| Plugin warm call (native)                      | < 100 µs overhead          |
| Memory overhead per WASM plugin instance       | < 8 MB at idle             |
| Concurrent WASM plugin instances per `tundrad` | 50 (target for v1.0)       |
| Plugin manifest validation                     | < 50 ms                    |

These are achievable based on Wasmtime's published benchmarks and the Bytecode Alliance's production deployments.

---

## 14. Operational Considerations

### 14.1 Logging

Every plugin has its own `tracing` subscriber that tags all logs with the plugin ID. Operators run:

```bash
tundra plugin logs com.tundra.plesk-migration --follow
tundra plugin logs --all | grep ERROR
```

Plugin logs are persisted in the same format as the rest of Tundra's logs and rotate identically.

### 14.2 Updates

```bash
tundra plugin update --check          # check all installed plugins for updates
tundra plugin update <id>             # update a specific plugin
tundra plugin update --all            # update everything
```

If an update requires new capabilities, the operator is prompted to grant or decline. A declined update leaves the previous version installed and enabled.

### 14.3 Upgrading Tundra Itself

When `tundrad` upgrades to a new major version (e.g., 1.x → 2.0), plugins must be checked for compatibility. The host:

1. Reads each plugin's `tundra-min-version` and `tundra-max-version` (the latter inferred from `tundra_compat`).
2. Plugins outside the compat range are auto-disabled with a warning.
3. The operator runs `tundra plugin update --check` to see if newer plugin versions support the new host version.
4. Disabled plugins continue to occupy their state but contribute nothing until updated and re-enabled.

This means major Tundra upgrades have a clean failure mode: the host comes up healthy and plugins fall back to safe states, rather than the host failing to start because a plugin is incompatible.

### 14.4 Backup of Plugin State

Plugin-owned database tables are included in Tundra's standard panel backup. Plugin KV state (in Valkey) is included in Valkey RDB snapshots, also part of the standard panel backup. A full panel restore restores all plugin state.

---

## 15. Open Questions for v1.0 Implementation

These are intentionally listed so the implementation phase has explicit decisions to make:

1. **Per-plugin TLS certificate pinning** — should plugins be allowed to pin server certs for the hosts they call? (Probably yes, optional in capability spec.)
2. **Plugin-to-plugin communication** — should plugins be able to publish events that other plugins consume directly, or should all such flows go through the host event bus? (Currently designed: only via the bus.)
3. **Hot reload** — should disable + enable on the same plugin be true hot reload (preserving in-memory state) or always cold? (Currently designed: cold; simpler and safer.)
4. **Plugin priority ordering** — when multiple plugins contribute to the same extension point (e.g., two DNS providers both claim `*.example.com`), what is the resolution rule? (Currently designed: explicit per-resource binding by operator; no implicit precedence.)
5. **Streaming responses** — WIT supports streams in WASIp2; should plugin HTTP routes be allowed to stream (e.g., for log tailing)? (Currently designed: yes for native, deferred to v1.1 for WASM.)
6. **OCI distribution** — should plugin bundles also be publishable as OCI artifacts, leveraging existing container registry infra? (Currently designed: yes, via `oci://` source URLs.)

---

## 16. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                         |
|---------|----------|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial complete plugin architecture specification. Hybrid native/WASM model. Plesk migration designated as reference core plugin. v1 registry without marketplace; marketplace deferred to v2. |

**Companion Documents:**

- `tundra-technical-implementation-plan-v2.md` — primary architecture and implementation plan
- `tundra-plesk-migration-plan-v1.md` — Plesk Obsidian migration plan, implemented as a core plugin per this document

**Planned Follow-up Documents:**

- `tundra-plugin-sdk-guide.md` — author-facing SDK guide with full WIT reference, native trait reference, and end-to-end "build your first plugin" walkthrough
- `tundra-plugin-security-audit-checklist.md` — review checklist for plugins seeking first-party adoption
- `tundra-plugin-marketplace-spec.md` — v2 marketplace specification (browse, ratings, payments, publisher accounts)
