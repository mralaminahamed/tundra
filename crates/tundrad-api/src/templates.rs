use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Specification of the runtime environment for a template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSpec {
    pub kind: String,
    pub version: String,
}

/// Specification of how the initial site source is created.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSpec {
    /// Currently always `"skeleton"` — Tundra creates the initial file structure.
    pub kind: String,
}

/// A versioned site template manifest, loaded from YAML at compile time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateManifest {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub runtime: RuntimeSpec,
    pub source: SourceSpec,
    pub build_command: Option<String>,
    pub start_command: Option<String>,
    pub listen_port: Option<u16>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub post_create: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub icon: String,
}

/// Parse a single YAML manifest string into a [`TemplateManifest`].
fn parse(src: &str) -> TemplateManifest {
    serde_yaml::from_str(src).expect("built-in template YAML is valid")
}

/// Return all built-in templates embedded at compile time, sorted by `id`.
pub fn builtin_templates() -> Vec<TemplateManifest> {
    let mut templates = vec![
        parse(include_str!("../../../templates/astro.yaml")),
        parse(include_str!("../../../templates/directus.yaml")),
        parse(include_str!("../../../templates/django.yaml")),
        parse(include_str!("../../../templates/ghost.yaml")),
        parse(include_str!("../../../templates/hugo.yaml")),
        parse(include_str!("../../../templates/laravel.yaml")),
        parse(include_str!("../../../templates/nextjs.yaml")),
        parse(include_str!("../../../templates/rails.yaml")),
        parse(include_str!("../../../templates/static.yaml")),
        parse(include_str!("../../../templates/strapi.yaml")),
        parse(include_str!("../../../templates/sveltekit.yaml")),
    ];
    templates.sort_by(|a, b| a.id.cmp(&b.id));
    templates
}
