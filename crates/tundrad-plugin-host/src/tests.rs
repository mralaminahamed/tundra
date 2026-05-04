#[cfg(test)]
mod tests {
    use crate::capability::GrantedCapabilities;
    use tundra_plugin_sdk::{HostError, PluginCapability};

    #[test]
    fn capability_denied_when_not_granted() {
        let caps = GrantedCapabilities::default();
        let result = caps.check_secret("my-secret");
        assert!(matches!(result, Err(HostError::CapabilityNotGranted(_))));
    }

    #[test]
    fn capability_allowed_when_granted() {
        let mut caps = GrantedCapabilities::default();
        caps.grant(&PluginCapability::Secret {
            names: vec!["my-secret".into()],
        });
        assert!(caps.has_secret("my-secret"));
    }

    #[test]
    fn net_capability_check() {
        let mut caps = GrantedCapabilities::default();
        caps.grant(&PluginCapability::Net {
            hosts: vec!["api.example.com".into()],
            max_rpm: 60,
            max_bytes_per_request: 1_048_576,
        });
        assert!(caps.has_net("api.example.com"));
        assert!(!caps.has_net("evil.example.com"));
    }

    #[test]
    fn manifest_parse_roundtrip() {
        let manifest_toml = r#"
id = "com.test.my-plugin"
name = "My Plugin"
version = "1.0.0"
description = "A test plugin"
author = "Test Author"
license = "MIT"
tundra_min_version = "1.0.0"
"#;
        let parsed = crate::manifest::parse_manifest(manifest_toml.as_bytes()).unwrap();
        assert_eq!(parsed.id, "com.test.my-plugin");
        assert_eq!(parsed.version, "1.0.0");
    }

    #[tokio::test]
    async fn sandboxed_host_denies_unclaimed_secret() {
        use crate::host_impl::SandboxedHostServices;
        use std::sync::Arc;
        use tokio::sync::RwLock;
        use tundra_plugin_sdk::HostServices;

        let caps = Arc::new(RwLock::new(GrantedCapabilities::default()));
        let host = SandboxedHostServices::new(caps);
        let result = host.get_secret("not-granted-secret").await;
        assert!(result.is_err());
    }

    #[test]
    fn engine_creates_successfully() {
        let engine = crate::engine::PluginEngine::new();
        assert!(
            engine.is_ok(),
            "Wasmtime engine should initialize: {:?}",
            engine.err()
        );
    }
}
