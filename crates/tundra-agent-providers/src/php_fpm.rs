use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::Command;
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhpFpmSpec {
    pub site_id: String,
    pub user: String,
    pub group: String,
    /// Unix socket path — e.g. /run/php/php8.3-fpm-{site_id}.sock
    pub listen_socket: String,
    pub pm_max_children: u32,
    /// Major.minor — e.g. "8.3"
    pub php_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhpFpmState {
    pub pool_name: String,
    pub is_running: bool,
}

pub struct PhpFpmProvider;

impl PhpFpmProvider {
    /// APT packages required for a PHP version.
    fn packages(version: &str) -> Vec<String> {
        let exts = [
            "fpm", "cli", "common", "mysql", "curl", "gd",
            "mbstring", "xml", "zip", "intl", "bcmath", "imagick",
        ];
        exts.iter()
            .map(|ext| format!("php{version}-{ext}"))
            .collect()
    }

    /// Pool config file path.
    fn pool_conf(version: &str, site_id: &str) -> PathBuf {
        PathBuf::from(format!(
            "/etc/php/{version}/fpm/pool.d/{site_id}.conf"
        ))
    }

    /// FPM service name for `systemctl`.
    fn service(version: &str) -> String {
        format!("php{version}-fpm")
    }

    /// Check whether `php{version}-fpm` is installed.
    async fn is_installed(version: &str) -> bool {
        Command::new("dpkg")
            .args(["-s", &format!("php{version}-fpm")])
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Install packages via apt-get.
    async fn apt_install(packages: &[String]) -> Result<(), ReconcileError> {
        let status = Command::new("apt-get")
            .args(["install", "-y", "--no-install-recommends"])
            .args(packages)
            .env("DEBIAN_FRONTEND", "noninteractive")
            .status()
            .await
            .map_err(|e| ReconcileError::ReconcileFailed(e.to_string()))?;

        if !status.success() {
            return Err(ReconcileError::ReconcileFailed(format!(
                "apt-get install failed for: {}",
                packages.join(" ")
            )));
        }
        Ok(())
    }

    /// Write the per-site FPM pool config.
    async fn write_pool(spec: &PhpFpmSpec) -> Result<(), ReconcileError> {
        let conf = format!(
            r#"[{site_id}]
user  = {user}
group = {group}

listen = {socket}
listen.owner = www-data
listen.group = www-data
listen.mode  = 0660

pm                   = dynamic
pm.max_children      = {max_ch}
pm.start_servers     = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3

php_admin_value[error_log]   = /var/log/php/{site_id}.log
php_admin_flag[log_errors]   = on
php_admin_value[upload_max_filesize] = 64M
php_admin_value[post_max_size]       = 64M
"#,
            site_id = spec.site_id,
            user    = spec.user,
            group   = spec.group,
            socket  = spec.listen_socket,
            max_ch  = spec.pm_max_children,
        );

        let path = Self::pool_conf(&spec.php_version, &spec.site_id);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| ReconcileError::ReconcileFailed(e.to_string()))?;
        }
        tokio::fs::create_dir_all("/var/log/php")
            .await
            .map_err(|e| ReconcileError::ReconcileFailed(e.to_string()))?;

        tokio::fs::write(&path, conf)
            .await
            .map_err(|e| ReconcileError::ReconcileFailed(format!("write pool config: {e}")))?;

        Ok(())
    }

    /// Remove pool configs for other PHP versions to avoid duplicate pools.
    async fn remove_stale_pools(current_version: &str, site_id: &str) {
        for version in &["7.4", "8.0", "8.1", "8.2", "8.3", "8.4"] {
            if *version == current_version {
                continue;
            }
            let path = Self::pool_conf(version, site_id);
            if path.exists() {
                let _ = tokio::fs::remove_file(&path).await;
                // Reload that version's FPM if installed
                if Self::is_installed(version).await {
                    let _ = Command::new("systemctl")
                        .args(["reload-or-restart", &Self::service(version)])
                        .status()
                        .await;
                }
            }
        }
    }

    async fn reload_service(version: &str) -> Result<(), ReconcileError> {
        let svc = Self::service(version);
        // Enable + start first; then reload config
        let _ = Command::new("systemctl")
            .args(["enable", "--now", &svc])
            .status()
            .await;

        let status = Command::new("systemctl")
            .args(["reload-or-restart", &svc])
            .status()
            .await
            .map_err(|e| ReconcileError::ReconcileFailed(e.to_string()))?;

        if !status.success() {
            return Err(ReconcileError::ReconcileFailed(format!(
                "failed to reload {svc}"
            )));
        }
        Ok(())
    }
}

#[async_trait]
impl Provider for PhpFpmProvider {
    type Spec = PhpFpmSpec;
    type State = PhpFpmState;

    async fn observe(&self) -> Result<PhpFpmState, ReconcileError> {
        Ok(PhpFpmState {
            pool_name:  String::new(),
            is_running: false,
        })
    }

    async fn reconcile(&self, desired: &PhpFpmSpec) -> Result<ReconcileOutcome, ReconcileError> {
        let ver = &desired.php_version;
        tracing::info!(
            site = %desired.site_id,
            php  = %ver,
            "php-fpm reconcile"
        );

        // 1. Install PHP packages if missing
        if !Self::is_installed(ver).await {
            tracing::info!(php = %ver, "installing PHP packages via apt");
            Self::apt_install(&Self::packages(ver)).await?;
        }

        // 2. Remove stale per-site pool configs for other versions
        Self::remove_stale_pools(ver, &desired.site_id).await;

        // 3. Write/update the pool config for this site
        Self::write_pool(desired).await?;

        // 4. Reload php-fpm to apply new pool
        Self::reload_service(ver).await?;

        tracing::info!(
            site   = %desired.site_id,
            php    = %ver,
            socket = %desired.listen_socket,
            "php-fpm pool configured"
        );

        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &PhpFpmSpec) -> Result<(), ReconcileError> {
        tracing::info!(site = %spec.site_id, php = %spec.php_version, "php-fpm destroy");
        let path = Self::pool_conf(&spec.php_version, &spec.site_id);
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| ReconcileError::ReconcileFailed(e.to_string()))?;
            let _ = Self::reload_service(&spec.php_version).await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn observe_returns_state() {
        let s = PhpFpmProvider.observe().await.unwrap();
        assert!(!s.is_running);
    }

    #[test]
    fn packages_include_fpm_and_cli() {
        let pkgs = PhpFpmProvider::packages("8.3");
        assert!(pkgs.contains(&"php8.3-fpm".to_string()));
        assert!(pkgs.contains(&"php8.3-cli".to_string()));
        assert!(pkgs.contains(&"php8.3-mysql".to_string()));
    }

    #[test]
    fn pool_conf_path_is_correct() {
        let p = PhpFpmProvider::pool_conf("8.3", "mysite");
        assert_eq!(p.to_str().unwrap(), "/etc/php/8.3/fpm/pool.d/mysite.conf");
    }

    #[test]
    fn service_name_is_correct() {
        assert_eq!(PhpFpmProvider::service("8.3"), "php8.3-fpm");
    }
}
