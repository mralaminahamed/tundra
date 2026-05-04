use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifestFile {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub tundra_min_version: String,
    #[serde(default)]
    pub capabilities: Vec<serde_json::Value>,
}

pub fn parse_manifest(toml_bytes: &[u8]) -> Result<PluginManifestFile, toml::de::Error> {
    toml::from_str(std::str::from_utf8(toml_bytes).map_err(|e| {
        // Convert utf8 error into a toml error via a round-trip through the toml parser
        // by producing an invalid toml document — simpler to just panic isn't allowed,
        // so we encode the utf8 error as a toml de error via serde.
        serde::de::Error::custom(format!("invalid utf-8: {e}"))
    })?)
}
