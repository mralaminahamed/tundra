use tundra_plugin_sdk::PluginManifest;

/// State of a loaded plugin instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    Installed,
    Granted,
    Enabled,
    Disabled,
    Quarantined,
}

pub struct PluginInstance {
    pub manifest: PluginManifest,
    pub state: PluginState,
    /// For WASM plugins: the compiled module bytes.
    pub wasm_bytes: Option<Vec<u8>>,
}

impl PluginInstance {
    pub fn new_native(manifest: PluginManifest) -> Self {
        Self {
            manifest,
            state: PluginState::Installed,
            wasm_bytes: None,
        }
    }
}
