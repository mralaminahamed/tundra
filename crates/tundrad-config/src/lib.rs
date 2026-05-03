use figment::{
    Figment,
    providers::{Env, Format, Toml},
};
use serde::Deserialize;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("configuration error: {0}")]
    Figment(#[from] figment::Error),
}

/// Top-level daemon configuration.
///
/// Loading order (later layers override earlier):
///   1. Built-in defaults (via serde defaults)
///   2. `/etc/tundra/tundrad.toml` (or `TUNDRA_CONFIG` path)
///   3. `TUNDRA_`-prefixed environment variables
#[derive(Debug, Deserialize)]
pub struct Config {
    pub database: DatabaseConfig,
    pub valkey: ValkeyConfig,
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub master_key: MasterKeyConfig,
    #[serde(default)]
    pub log: LogConfig,
    #[serde(default)]
    pub telemetry: TelemetryConfig,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    #[serde(default = "default_db_max_connections")]
    pub max_connections: u32,
    #[serde(default = "default_db_connect_timeout_secs")]
    pub connect_timeout_secs: u64,
}

#[derive(Debug, Deserialize)]
pub struct ValkeyConfig {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_listen_addr")]
    pub listen_addr: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_grpc_port")]
    pub grpc_port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            listen_addr: default_listen_addr(),
            port: default_port(),
            grpc_port: default_grpc_port(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct MasterKeyConfig {
    #[serde(default = "default_master_key_path")]
    pub path: PathBuf,
}

impl Default for MasterKeyConfig {
    fn default() -> Self {
        Self {
            path: default_master_key_path(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct LogConfig {
    #[serde(default = "default_log_level")]
    pub level: String,
    #[serde(default)]
    pub json: bool,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            json: false,
        }
    }
}

#[derive(Debug, Deserialize, Default)]
pub struct TelemetryConfig {
    pub otlp_endpoint: Option<String>,
    #[serde(default = "default_service_name")]
    pub service_name: String,
}

// ── Defaults ──────────────────────────────────────────────────────────────────

fn default_db_max_connections() -> u32 {
    10
}
fn default_db_connect_timeout_secs() -> u64 {
    10
}
fn default_listen_addr() -> String {
    "0.0.0.0".to_owned()
}
fn default_port() -> u16 {
    7400
}
fn default_grpc_port() -> u16 {
    7447
}
fn default_master_key_path() -> PathBuf {
    PathBuf::from("/var/lib/tundra/data/master.key")
}
fn default_log_level() -> String {
    "info".to_owned()
}
fn default_service_name() -> String {
    "tundrad".to_owned()
}

// ── Loader ────────────────────────────────────────────────────────────────────

/// Load from default path (`TUNDRA_CONFIG` env or `/etc/tundra/tundrad.toml`) plus env vars.
pub fn load() -> Result<Config, ConfigError> {
    let config_path =
        std::env::var("TUNDRA_CONFIG").unwrap_or_else(|_| "/etc/tundra/tundrad.toml".to_owned());
    load_from(&config_path)
}

/// Load with an explicit TOML path. File is optional; env vars always apply.
pub fn load_from(toml_path: &str) -> Result<Config, ConfigError> {
    let cfg = Figment::new()
        .merge(Toml::file(toml_path))
        // TUNDRA_DATABASE__URL → database.url  (__ is the nesting separator)
        .merge(Env::prefixed("TUNDRA_").split("__"))
        // Convenience: bare DATABASE_URL → database.url (container convention)
        .merge(
            Env::raw()
                .only(&["DATABASE_URL"])
                .map(|_| "database.url".into()),
        )
        .extract()?;
    Ok(cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_from_env_vars() {
        // Use unique env var names to avoid test pollution
        std::env::set_var("TUNDRA_DATABASE__URL", "postgres://localhost/tundra_test");
        std::env::set_var("TUNDRA_VALKEY__URL", "redis://localhost:6379");
        let cfg = load_from("/nonexistent.toml").unwrap();
        assert_eq!(cfg.database.url, "postgres://localhost/tundra_test");
        assert_eq!(cfg.valkey.url, "redis://localhost:6379");
        assert_eq!(cfg.server.port, 7400);
        assert!(!cfg.log.json);
    }
}
