//! SSH-based agent installer for the server-add wizard.

use tracing::info;
use uuid::Uuid;

/// Result of the SSH connection phase.
#[derive(Debug)]
pub struct SshConnectInfo {
    pub host: String,
    /// Hex SHA-256 of the server's host key.
    pub fingerprint: String,
}

/// Outcome of running the agent installer over SSH.
#[derive(Debug)]
pub struct InstallOutcome {
    pub server_id: Uuid,
    pub exit_code: i32,
    pub log_lines: Vec<String>,
}

/// Opens a connection to `host` as `user`, extracts the host key fingerprint.
/// Returns `Err` if the connection fails.
///
/// NOTE: Uses `KnownHosts::Accept` for the initial fingerprint fetch. The
/// caller must present the fingerprint to the operator and require explicit
/// confirmation before calling `run_installer`.
pub async fn fetch_fingerprint(user: &str, host: &str) -> Result<SshConnectInfo, String> {
    info!(user, host, "SSH fingerprint fetch");
    // Stub: in production this would use openssh::Session::connect with
    // KnownHosts::Accept and then query the host key via `ssh-keyscan`.
    Ok(SshConnectInfo {
        host: host.to_owned(),
        fingerprint: format!("stub-fingerprint-{host}"),
    })
}

/// Uploads the agent installer script and runs it on the remote host.
/// The enrollment token is embedded in the install command.
pub async fn run_installer(
    user: &str,
    host: &str,
    enrollment_token: &str,
    control_plane_url: &str,
) -> Result<InstallOutcome, String> {
    info!(user, host, "SSH agent install begin");
    // Stub: real implementation would:
    // 1. openssh::Session::connect(KnownHosts::Strict) — fail if fingerprint changed
    // 2. Upload installer script via SFTP
    // 3. session.command("sudo bash").arg("/tmp/tundra-install.sh").arg("--token").arg(enrollment_token).output()
    // 4. Return exit code + captured stdout/stderr
    Ok(InstallOutcome {
        server_id: Uuid::new_v4(),
        exit_code: 0,
        log_lines: vec![
            format!("Connecting to {user}@{host}..."),
            "Uploading installer...".to_owned(),
            format!("Running installer with token {enrollment_token}"),
            format!("Agent will connect to {control_plane_url}"),
            "Install complete (stub).".to_owned(),
        ],
    })
}
