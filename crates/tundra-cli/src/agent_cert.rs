//! `tundra agent cert` subcommands.
//!
//! Provides three operations:
//!
//! - `list`      — list all agent certificates and their expiry/status.
//! - `issue`     — force-issue a new certificate for a specific server.
//! - `rotate-ca` — rotate the Tundra internal CA (rare; use only if CA is
//!                 suspected of compromise).
//!
//! All implementations are stubs that print what the live implementation
//! would do.  The full implementation calls tundrad's PKI API
//! (`tundrad-pki`) over the local Unix socket or REST API.

/// List all agent certificates registered in the control plane.
///
/// Output columns:
///   SERVER   — the agent's hostname (matches the server record)
///   STATUS   — ACTIVE | EXPIRING | EXPIRED | REVOKED
///   ISSUED   — date the cert was issued (YYYY-MM-DD)
///   EXPIRES  — date the cert expires   (YYYY-MM-DD)
///   FINGERPRINT — SHA-256 fingerprint of the DER-encoded cert
pub async fn list(database_url: &str) -> anyhow::Result<()> {
    println!(
        "{:<30} {:<10} {:<12} {:<12} {}",
        "SERVER", "STATUS", "ISSUED", "EXPIRES", "FINGERPRINT"
    );
    println!("{}", "-".repeat(90));
    println!("(Stub) Connect to {database_url} to list agent certificates.");

    Ok(())
}

/// Force-issue a new mTLS client certificate for `server`.
///
/// If `revoke_existing` is true, the current certificate fingerprint is
/// added to the CRL and the `agent_credentials` row is updated atomically.
/// After issuing, prints a one-line `curl | bash` install command that the
/// operator can paste on the agent host to deploy the new credentials.
pub async fn issue(server: &str, revoke_existing: bool, database_url: &str) -> anyhow::Result<()> {
    println!("==> Issuing new agent certificate for: {server}");
    if revoke_existing {
        println!("    Revoking existing certificate...");
    }
    println!();
    println!("Live implementation steps:");
    println!("  1. Look up server record for '{server}' in the database");
    println!("  2. Call tundrad-pki to generate a new cert + key pair");
    println!("  3. Write new cert to agent_credentials, mark old as REVOKED");
    println!("  4. Print enrollment command for the agent host:");
    println!();
    println!("  ssh tundra@{server} 'curl -fsSL https://<panel-host>/agent/install | \\");
    println!("    sudo bash -s -- --enrollment-token=<token>'");
    println!();
    println!("(Stub) Connect to {database_url} and call tundrad PKI to issue cert.");

    Ok(())
}

/// Rotate the Tundra internal CA.
///
/// This is a destructive, rare operation.  Use only when the CA private key
/// is suspected of compromise.
///
/// Steps performed by the live implementation:
///   1. Generate a new CA root + intermediate in `data/ca/`.
///   2. Issue new mTLS certs for every active agent under the new CA.
///   3. Mark the old CA as "trust on overlap" for 24 hours so agents that
///      have not yet picked up the new cert can still connect.
///   4. After the 24-hour window, remove the old CA from the trust store.
///
/// Agents that fail to rotate within the overlap window will go offline and
/// require manual cert re-issue (`tundra agent cert issue`).
pub async fn rotate_ca(database_url: &str) -> anyhow::Result<()> {
    println!("==> Rotating Tundra internal CA");
    println!("    Step 1: Generate new CA root + intermediate");
    println!("    Step 2: Issue new certs for all active agents");
    println!("    Step 3: Mark old CA as 'trust on overlap' for 24h");
    println!("    Step 4: After 24h, remove old CA from trust store");
    println!();
    println!("WARNING: Agents that do not rotate within 24 hours will go offline.");
    println!("         Use `tundra agent cert issue <server>` to recover them manually.");
    println!();
    println!("(Stub) Connect to {database_url} to perform CA rotation.");

    Ok(())
}
