use tundra_plugin_sdk::Plugin;
use tundra_plugin_sdk::PluginCapability;
use tundrad_plugin_namecheap::NamecheapPlugin;

#[test]
fn manifest_is_correct() {
    let plugin = NamecheapPlugin;
    let manifest = plugin.manifest();
    assert_eq!(manifest.id, "com.tundra.namecheap");
    assert_eq!(manifest.license, "Apache-2.0");
    // Must request namecheap.api-key secret
    let has_api_key_cap = manifest.capabilities.iter().any(|c| {
        matches!(c, PluginCapability::Secret { names } if names.contains(&"namecheap.api-key".to_string()))
    });
    assert!(has_api_key_cap);
}

#[test]
fn github_manifest_is_correct() {
    use tundrad_plugin_github::GitHubPlugin;
    let plugin = GitHubPlugin;
    let manifest = plugin.manifest();
    assert_eq!(manifest.id, "com.tundra.github");
    // Must have webhook-secret capability
    let has_webhook_secret = manifest.capabilities.iter().any(|c| {
        matches!(c, PluginCapability::Secret { names } if names.contains(&"github.webhook-secret".to_string()))
    });
    assert!(has_webhook_secret);
}
