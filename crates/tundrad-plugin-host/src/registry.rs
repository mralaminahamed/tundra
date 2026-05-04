use crate::instance::PluginInstance;
use std::collections::HashMap;

#[derive(Default)]
pub struct PluginRegistry {
    plugins: HashMap<String, PluginInstance>, // keyed by plugin_id
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, plugin: PluginInstance) {
        self.plugins.insert(plugin.manifest.id.clone(), plugin);
    }

    pub fn get(&self, id: &str) -> Option<&PluginInstance> {
        self.plugins.get(id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut PluginInstance> {
        self.plugins.get_mut(id)
    }

    pub fn all(&self) -> impl Iterator<Item = &PluginInstance> {
        self.plugins.values()
    }
}
