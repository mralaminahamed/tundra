//! Runtime provisioners for Tundra-managed application runtimes.
//! Each provider ensures a specific runtime version is installed on the host
//! and can generate the appropriate systemd unit and build commands.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuntimeKind {
    Node,
    Python,
    Go,
    Rust,
    Ruby,
    Dotnet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSpec {
    pub kind: RuntimeKind,
    /// Requested major version string, e.g. "22", "3.13", "1.24"
    pub version: String,
    /// Install base directory, e.g. "/usr/local/tundra/runtimes"
    pub install_base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeState {
    pub is_installed: bool,
    pub installed_version: Option<String>,
    pub install_path: Option<String>,
}

// ── Node.js ───────────────────────────────────────────────────────────────────

pub struct NodeProvider;

#[async_trait]
impl Provider for NodeProvider {
    type Spec = RuntimeSpec;
    type State = RuntimeState;

    async fn observe(&self) -> Result<RuntimeState, ReconcileError> {
        Ok(RuntimeState {
            is_installed: false,
            installed_version: None,
            install_path: None,
        })
    }

    async fn reconcile(&self, desired: &RuntimeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            version = %desired.version,
            base = %desired.install_base,
            "node runtime install (stub) — production: NodeSource repo + apt"
        );
        // Production: add NodeSource repo for major, apt-get install nodejs,
        // symlink to /usr/local/tundra/runtimes/node-<major>/
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &RuntimeSpec) -> Result<(), ReconcileError> {
        tracing::info!(version = %spec.version, "node runtime uninstall (stub)");
        Ok(())
    }
}

impl NodeProvider {
    /// Returns the exec path for a given major version.
    pub fn exec_path(major: &str, install_base: &str) -> String {
        format!("{install_base}/node-{major}/bin/node")
    }

    /// Returns shell commands to build a Node.js app (npm/pnpm/yarn detection).
    pub fn build_commands(build_cmd: Option<&str>) -> Vec<String> {
        if let Some(cmd) = build_cmd {
            vec![cmd.to_owned()]
        } else {
            vec!["npm ci".to_owned(), "npm run build".to_owned()]
        }
    }
}

// ── Python ────────────────────────────────────────────────────────────────────

pub struct PythonProvider;

#[async_trait]
impl Provider for PythonProvider {
    type Spec = RuntimeSpec;
    type State = RuntimeState;

    async fn observe(&self) -> Result<RuntimeState, ReconcileError> {
        Ok(RuntimeState {
            is_installed: false,
            installed_version: None,
            install_path: None,
        })
    }

    async fn reconcile(&self, desired: &RuntimeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            version = %desired.version,
            "python runtime install (stub) — production: Deadsnakes PPA + per-app venv"
        );
        // Production: add Deadsnakes PPA, apt-get install python<version>,
        // create venv at <site>/shared/venv/ using that python binary
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &RuntimeSpec) -> Result<(), ReconcileError> {
        tracing::info!(version = %spec.version, "python runtime uninstall (stub)");
        Ok(())
    }
}

impl PythonProvider {
    pub fn venv_activate(site_path: &str) -> String {
        format!("{site_path}/shared/venv/bin/activate")
    }

    pub fn build_commands(site_path: &str, build_cmd: Option<&str>) -> Vec<String> {
        let venv = format!("python3 -m venv {site_path}/shared/venv");
        let pip = format!(
            "source {site_path}/shared/venv/bin/activate && pip install -r requirements.txt"
        );
        let mut cmds = vec![venv, pip];
        if let Some(cmd) = build_cmd {
            cmds.push(cmd.to_owned());
        }
        cmds
    }
}

// ── Go ────────────────────────────────────────────────────────────────────────

pub struct GoProvider;

#[async_trait]
impl Provider for GoProvider {
    type Spec = RuntimeSpec;
    type State = RuntimeState;

    async fn observe(&self) -> Result<RuntimeState, ReconcileError> {
        Ok(RuntimeState {
            is_installed: false,
            installed_version: None,
            install_path: None,
        })
    }

    async fn reconcile(&self, desired: &RuntimeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            version = %desired.version,
            "go runtime install (stub) — production: download official tarball, extract to /usr/local/go-<version>"
        );
        // Production: curl https://go.dev/dl/go<version>.linux-amd64.tar.gz | tar -C /usr/local -xz
        // Rename to /usr/local/tundra/runtimes/go-<version>/
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &RuntimeSpec) -> Result<(), ReconcileError> {
        tracing::info!(version = %spec.version, "go runtime uninstall (stub)");
        Ok(())
    }
}

impl GoProvider {
    pub fn exec_path(version: &str, install_base: &str) -> String {
        format!("{install_base}/go-{version}/bin/go")
    }

    /// Go produces a static binary; build outputs to <release_dir>/app
    pub fn build_commands(release_dir: &str, build_cmd: Option<&str>) -> Vec<String> {
        if let Some(cmd) = build_cmd {
            vec![cmd.to_owned()]
        } else {
            vec![format!("go build -o {release_dir}/app ./...")]
        }
    }
}

// ── Rust ──────────────────────────────────────────────────────────────────────

pub struct RustProvider;

#[async_trait]
impl Provider for RustProvider {
    type Spec = RuntimeSpec;
    type State = RuntimeState;

    async fn observe(&self) -> Result<RuntimeState, ReconcileError> {
        Ok(RuntimeState {
            is_installed: false,
            installed_version: None,
            install_path: None,
        })
    }

    async fn reconcile(&self, desired: &RuntimeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            version = %desired.version,
            "rust runtime install (stub) — production: rustup install <channel>"
        );
        // Production: curl https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &RuntimeSpec) -> Result<(), ReconcileError> {
        tracing::info!(version = %spec.version, "rust runtime uninstall (stub)");
        Ok(())
    }
}

impl RustProvider {
    /// Rust produces a static binary in target/release/<name>
    pub fn build_commands(
        release_dir: &str,
        binary_name: &str,
        build_cmd: Option<&str>,
    ) -> Vec<String> {
        if let Some(cmd) = build_cmd {
            vec![
                cmd.to_owned(),
                format!("cp target/release/{binary_name} {release_dir}/app"),
            ]
        } else {
            vec![
                "cargo build --release".to_owned(),
                format!("cp target/release/{binary_name} {release_dir}/app"),
            ]
        }
    }
}

// ── Ruby ──────────────────────────────────────────────────────────────────────

pub struct RubyProvider;

#[async_trait]
impl Provider for RubyProvider {
    type Spec = RuntimeSpec;
    type State = RuntimeState;

    async fn observe(&self) -> Result<RuntimeState, ReconcileError> {
        Ok(RuntimeState {
            is_installed: false,
            installed_version: None,
            install_path: None,
        })
    }

    async fn reconcile(&self, desired: &RuntimeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            version = %desired.version,
            "ruby runtime install (stub) — production: rbenv + ruby-build install <version>"
        );
        // Production: git clone rbenv, ruby-build; rbenv install <version>; rbenv global <version>
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &RuntimeSpec) -> Result<(), ReconcileError> {
        tracing::info!(version = %spec.version, "ruby runtime uninstall (stub)");
        Ok(())
    }
}

impl RubyProvider {
    pub fn exec_path(version: &str) -> String {
        format!("/usr/local/tundra/runtimes/ruby-{version}/bin/ruby")
    }

    pub fn build_commands(build_cmd: Option<&str>) -> Vec<String> {
        if let Some(cmd) = build_cmd {
            vec![cmd.to_owned()]
        } else {
            vec!["bundle install --deployment --without development test".to_owned()]
        }
    }
}

// ── .NET ──────────────────────────────────────────────────────────────────────

pub struct DotnetProvider;

#[async_trait]
impl Provider for DotnetProvider {
    type Spec = RuntimeSpec;
    type State = RuntimeState;

    async fn observe(&self) -> Result<RuntimeState, ReconcileError> {
        Ok(RuntimeState {
            is_installed: false,
            installed_version: None,
            install_path: None,
        })
    }

    async fn reconcile(&self, desired: &RuntimeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            version = %desired.version,
            "dotnet runtime install (stub) — production: Microsoft repo + apt-get install dotnet-sdk-<version>"
        );
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &RuntimeSpec) -> Result<(), ReconcileError> {
        tracing::info!(version = %spec.version, "dotnet runtime uninstall (stub)");
        Ok(())
    }
}

impl DotnetProvider {
    pub fn build_commands(build_cmd: Option<&str>) -> Vec<String> {
        if let Some(cmd) = build_cmd {
            vec![cmd.to_owned()]
        } else {
            vec!["dotnet publish -c Release -o ./publish".to_owned()]
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(kind: RuntimeKind, version: &str) -> RuntimeSpec {
        RuntimeSpec {
            kind,
            version: version.into(),
            install_base: "/usr/local/tundra/runtimes".into(),
        }
    }

    #[tokio::test]
    async fn node_reconcile_ok() {
        assert_eq!(
            NodeProvider
                .reconcile(&spec(RuntimeKind::Node, "22"))
                .await
                .unwrap(),
            ReconcileOutcome::Applied
        );
    }

    #[tokio::test]
    async fn python_reconcile_ok() {
        assert_eq!(
            PythonProvider
                .reconcile(&spec(RuntimeKind::Python, "3.13"))
                .await
                .unwrap(),
            ReconcileOutcome::Applied
        );
    }

    #[tokio::test]
    async fn go_reconcile_ok() {
        assert_eq!(
            GoProvider
                .reconcile(&spec(RuntimeKind::Go, "1.24"))
                .await
                .unwrap(),
            ReconcileOutcome::Applied
        );
    }

    #[tokio::test]
    async fn rust_reconcile_ok() {
        assert_eq!(
            RustProvider
                .reconcile(&spec(RuntimeKind::Rust, "stable"))
                .await
                .unwrap(),
            ReconcileOutcome::Applied
        );
    }

    #[tokio::test]
    async fn ruby_reconcile_ok() {
        assert_eq!(
            RubyProvider
                .reconcile(&spec(RuntimeKind::Ruby, "3.4"))
                .await
                .unwrap(),
            ReconcileOutcome::Applied
        );
    }

    #[tokio::test]
    async fn dotnet_reconcile_ok() {
        assert_eq!(
            DotnetProvider
                .reconcile(&spec(RuntimeKind::Dotnet, "9"))
                .await
                .unwrap(),
            ReconcileOutcome::Applied
        );
    }

    #[test]
    fn node_exec_path() {
        assert_eq!(
            NodeProvider::exec_path("22", "/usr/local/tundra/runtimes"),
            "/usr/local/tundra/runtimes/node-22/bin/node"
        );
    }

    #[test]
    fn go_build_default() {
        let cmds = GoProvider::build_commands("/releases/abc", None);
        assert!(cmds[0].contains("go build"));
    }
}
