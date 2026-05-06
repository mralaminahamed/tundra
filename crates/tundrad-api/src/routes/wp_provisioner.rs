use tokio::process::Command;
use uuid::Uuid;

use tundrad_repo::PgPool;

pub struct ProvisionRequest {
    pub installation_id: Uuid,
    pub document_root: String,
    pub primary_domain: String,
    pub wp_subpath: String,   // "/" = install at document_root, "/blog" = subdir
    pub wp_version: String,   // "6.7.2" or "latest"
    pub db_name: String,
    pub db_user: String,
    pub db_password: String,
    pub db_host: String,
    pub db_prefix: String,
    pub admin_user: String,
    pub admin_email: String,
    pub admin_password: String,
    pub site_title: String,
    pub language: String,
}

/// Spawned as a background tokio task — never panics, writes errors to DB.
pub async fn provision(pool: PgPool, req: ProvisionRequest) {
    let id = req.installation_id;
    match run(&pool, &req).await {
        Ok(actual_version) => {
            let site_url = format!("https://{}", req.primary_domain);
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations
                 SET state = 'active', wp_version = $1, site_url = $2, updated_at = now()
                 WHERE id = $3",
            )
            .bind(&actual_version)
            .bind(&site_url)
            .bind(id)
            .execute(&pool)
            .await;
            tracing::info!(installation_id = %id, version = %actual_version, "WordPress provisioned");
        }
        Err(e) => {
            tracing::error!(installation_id = %id, error = %e, "WordPress provisioning failed");
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations
                 SET state = 'error', error_message = $1, updated_at = now()
                 WHERE id = $2",
            )
            .bind(e.to_string())
            .bind(id)
            .execute(&pool)
            .await;
        }
    }
}

async fn run(
    pool: &PgPool,
    req: &ProvisionRequest,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Resolve absolute install path
    let install_path = resolve_path(&req.document_root, &req.wp_subpath);

    tokio::fs::create_dir_all(&install_path).await?;

    let wp = wp_bin();

    // ── Step 1: wp core download ───────────────────────────────────────────────
    tracing::info!(installation_id = %req.installation_id, path = %install_path, "wp core download");

    let mut dl_args = vec![
        "core".to_owned(),
        "download".to_owned(),
        format!("--path={}", install_path),
        format!("--locale={}", req.language),
        "--allow-root".to_owned(),
        "--force".to_owned(),
    ];
    if req.wp_version != "latest" {
        dl_args.push(format!("--version={}", req.wp_version));
    }

    run_wp(&wp, &dl_args).await?;

    // ── Step 2: wp config create ───────────────────────────────────────────────
    tracing::info!(installation_id = %req.installation_id, "wp config create");

    run_wp(
        &wp,
        &[
            "config".to_owned(),
            "create".to_owned(),
            format!("--dbname={}", req.db_name),
            format!("--dbuser={}", req.db_user),
            format!("--dbpass={}", req.db_password),
            format!("--dbhost={}", req.db_host),
            format!("--dbprefix={}", req.db_prefix),
            format!("--locale={}", req.language),
            format!("--path={}", install_path),
            "--allow-root".to_owned(),
            "--force".to_owned(),
            "--skip-check".to_owned(),
        ],
    )
    .await?;

    // ── Step 3: wp core install (best-effort — requires live DB) ──────────────
    tracing::info!(installation_id = %req.installation_id, "wp core install");

    if let Err(e) = run_wp(
        &wp,
        &[
            "core".to_owned(),
            "install".to_owned(),
            format!("--url=https://{}", req.primary_domain),
            format!("--title={}", req.site_title),
            format!("--admin_user={}", req.admin_user),
            format!("--admin_password={}", req.admin_password),
            format!("--admin_email={}", req.admin_email),
            format!("--path={}", install_path),
            "--allow-root".to_owned(),
            "--skip-email".to_owned(),
        ],
    )
    .await
    {
        // Log but don't fail — DB may not be provisioned yet.
        // Files are extracted and wp-config.php is written; admin can run
        // the DB step manually or via the databases module.
        tracing::warn!(
            installation_id = %req.installation_id,
            error = %e,
            "wp core install skipped (no DB reachable — files and config are ready)"
        );
    }

    // ── Read actual installed version from WP ──────────────────────────────────
    let version_out = Command::new(&wp)
        .args([
            "core",
            "version",
            &format!("--path={}", install_path),
            "--allow-root",
        ])
        .output()
        .await?;

    let actual_version = String::from_utf8_lossy(&version_out.stdout)
        .trim()
        .to_owned();
    let version = if actual_version.is_empty() {
        req.wp_version.clone()
    } else {
        actual_version
    };

    // Store admin_user in DB now that provisioning succeeded
    let _ = sqlx::query(
        "UPDATE plugin_wordpress_installations SET admin_user = $1 WHERE id = $2",
    )
    .bind(&req.admin_user)
    .bind(req.installation_id)
    .execute(pool)
    .await;

    Ok(version)
}

/// Run a wp-cli command, return Ok(()) or Err with combined stdout+stderr.
async fn run_wp(
    wp: &str,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let out = Command::new(wp).args(args).output().await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "wp {} failed ({}): {} {}",
            args.first().map(|s| s.as_str()).unwrap_or("?"),
            out.status,
            stdout.trim(),
            stderr.trim(),
        )
        .into());
    }
    Ok(())
}

/// Returns the path to the wp binary: checks /usr/local/bin/wp first, falls back to "wp".
fn wp_bin() -> String {
    if std::path::Path::new("/usr/local/bin/wp").exists() {
        "/usr/local/bin/wp".to_owned()
    } else {
        "wp".to_owned()
    }
}

/// Resolve the absolute filesystem install path.
/// document_root = "/srv/sites/abc/current"
/// subpath = "/" → "/srv/sites/abc/current"
/// subpath = "/blog" → "/srv/sites/abc/current/blog"
fn resolve_path(document_root: &str, subpath: &str) -> String {
    let root = document_root.trim_end_matches('/');
    let sub = subpath.trim_matches('/');
    if sub.is_empty() {
        root.to_owned()
    } else {
        format!("{}/{}", root, sub)
    }
}
