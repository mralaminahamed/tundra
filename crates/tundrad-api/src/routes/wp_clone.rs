/// Clone and staging operations for WordPress installations.
///
/// Clone:   copies files + DB to a brand-new site/installation.
/// Staging: like clone but sets `is_staging=true`, derives `staging.{domain}`,
///          and links back to the source via `source_install_id`.
/// Push-to-live: syncs staging DB + files back to production, then
///          runs `wp search-replace` to rewrite URLs.
use axum::{Json, extract::{Path, State}};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractors::AuthSession;
use tundrad_repo::PgPool;

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CloneRequest {
    /// Target site_id.  If omitted, reuses the same site.
    pub target_site_id: Option<Uuid>,
    /// Human label for the clone.  Defaults to "{original title} (copy)".
    pub site_title: Option<String>,
    /// New primary domain — required when target_site_id differs from source.
    pub new_domain: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateStagingRequest {
    /// Override the auto-derived `staging.{domain}`.  Optional.
    pub staging_domain: Option<String>,
}

#[derive(Serialize)]
pub struct CloneResponse {
    pub installation_id: String,
}

// ── Source install row ────────────────────────────────────────────────────────

struct SourceInstall {
    site_id: Uuid,
    wp_path: String,
    db_name: String,
    db_user: String,
    db_password: String,
    db_host: String,
    db_prefix: String,
    admin_user: String,
    language: String,
    site_title: Option<String>,
    document_root: String,
    primary_domain: String,
}

impl SourceInstall {
    async fn load(pool: &PgPool, id: Uuid) -> Result<Self, ApiError> {
        let row: Option<(Uuid, String, Option<String>, Option<String>, Option<String>,
                         String, String, String, String, Option<String>,
                         String, String)> = sqlx::query_as(
            "SELECT i.site_id, i.wp_path,
                    i.db_name, i.db_user, i.db_password,
                    COALESCE(i.db_host, 'localhost'), i.db_prefix, i.admin_user, i.language,
                    i.site_title,
                    s.document_root,
                    s.primary_domain
             FROM   plugin_wordpress_installations i
             JOIN   sites s ON s.id = i.site_id
             WHERE  i.id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::internal())?;

        let r = row.ok_or_else(|| ApiError::not_found("wordpress installation"))?;

        Ok(Self {
            site_id:      r.0,
            wp_path:      r.1,
            db_name:      r.2.unwrap_or_else(|| "wordpress".into()),
            db_user:      r.3.unwrap_or_else(|| "wordpress".into()),
            db_password:  r.4.unwrap_or_default(),
            db_host:      r.5,
            db_prefix:    r.6,
            admin_user:   r.7,
            language:     r.8,
            site_title:   r.9,
            document_root: r.10,
            primary_domain: r.11,
        })
    }

    fn install_path(&self) -> String {
        crate::routes::wp_provisioner::resolve_path(&self.document_root, &self.wp_path)
    }
}

// ── Clone ─────────────────────────────────────────────────────────────────────

pub async fn clone_installation(
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    State(pool): State<PgPool>,
    Json(body): Json<CloneRequest>,
) -> Result<Json<CloneResponse>, ApiError> {
    let src = SourceInstall::load(&pool, id).await?;

    let new_id = Uuid::now_v7();
    let target_site_id = body.target_site_id.unwrap_or(src.site_id);

    // Derive new DB credentials
    let new_db_name = format!("wp_{}", &new_id.simple().to_string()[..20]);
    let new_db_user = format!("wp_{}", &new_id.simple().to_string()[..12]);
    let new_db_password = generate_password(&new_id);

    let new_domain = body.new_domain.clone()
        .unwrap_or_else(|| format!("copy.{}", src.primary_domain));
    let new_title = body.site_title.clone()
        .unwrap_or_else(|| format!("{} (copy)", src.site_title.as_deref().unwrap_or("WordPress")));

    // Each clone gets its own isolated FS path; if same site use install UUID
    let new_doc_root = if target_site_id != src.site_id {
        resolve_document_root(&pool, target_site_id).await?
    } else {
        format!("/srv/sites/{}/current", new_id.simple())
    };

    sqlx::query(
        "INSERT INTO plugin_wordpress_installations
             (id, site_id, wp_path, db_name, db_user, db_password, db_host, db_prefix,
              admin_user, language, site_title, state, clone_of_id, installed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'provisioning',$12,$13)",
    )
    .bind(new_id)
    .bind(target_site_id)
    .bind(&src.wp_path)
    .bind(&new_db_name)
    .bind(&new_db_user)
    .bind(&new_db_password)
    .bind(&src.db_host)
    .bind(&src.db_prefix)
    .bind(&src.admin_user)
    .bind(&src.language)
    .bind(&new_title)
    .bind(id)
    .bind(session.operator_id)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!(%e, "insert clone"); ApiError::internal() })?;

    tokio::spawn(run_clone(
        pool.clone(),
        CloneJob {
            new_install_id: new_id,
            src_install_path: src.install_path(),
            src_db_name: src.db_name.clone(),
            src_db_user: src.db_user.clone(),
            src_db_password: src.db_password.clone(),
            src_db_host: src.db_host.clone(),
            new_doc_root,
            new_wp_path: src.wp_path.clone(),
            new_db_name,
            new_db_user,
            new_db_password,
            new_db_host: src.db_host.clone(),
            new_db_prefix: src.db_prefix.clone(),
            old_url: format!("https://{}", src.primary_domain),
            new_url: format!("https://{}", new_domain),
            is_staging: false,
        },
    ));

    Ok(Json(CloneResponse { installation_id: new_id.to_string() }))
}

// ── Create staging ────────────────────────────────────────────────────────────

pub async fn create_staging(
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    State(pool): State<PgPool>,
    Json(body): Json<CreateStagingRequest>,
) -> Result<Json<CloneResponse>, ApiError> {
    let src = SourceInstall::load(&pool, id).await?;

    // Disallow staging-of-staging
    let is_already_staging: bool = sqlx::query_scalar(
        "SELECT is_staging FROM plugin_wordpress_installations WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    if is_already_staging {
        return Err(ApiError::bad_request("cannot create staging from a staging environment"));
    }

    // Disallow duplicate staging
    let existing_staging: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM plugin_wordpress_installations WHERE source_install_id = $1 AND is_staging = true LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    if existing_staging.is_some() {
        return Err(ApiError::bad_request("a staging environment already exists for this installation"));
    }

    let new_id = Uuid::now_v7();
    let staging_domain = body.staging_domain
        .unwrap_or_else(|| format!("staging.{}", src.primary_domain));

    let new_db_name = format!("wp_{}", &new_id.simple().to_string()[..20]);
    let new_db_user = format!("wp_{}", &new_id.simple().to_string()[..12]);
    let new_db_password = generate_password(&new_id);
    // Staging gets its own isolated FS path so it doesn't collide with production
    let new_doc_root = format!("/srv/sites/{}/current", new_id.simple());

    sqlx::query(
        "INSERT INTO plugin_wordpress_installations
             (id, site_id, wp_path, db_name, db_user, db_password, db_host, db_prefix,
              admin_user, language, site_title, state, is_staging, source_install_id, installed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'provisioning',true,$12,$13)",
    )
    .bind(new_id)
    .bind(src.site_id)
    .bind(&src.wp_path)
    .bind(&new_db_name)
    .bind(&new_db_user)
    .bind(&new_db_password)
    .bind(&src.db_host)
    .bind(&src.db_prefix)
    .bind(&src.admin_user)
    .bind(&src.language)
    .bind(format!("{} (Staging)", src.site_title.as_deref().unwrap_or("WordPress")))
    .bind(id)
    .bind(session.operator_id)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!(%e, "insert staging"); ApiError::internal() })?;

    // Back-link: mark production as having a staging install
    let _ = sqlx::query(
        "UPDATE plugin_wordpress_installations SET staging_install_id = $1 WHERE id = $2",
    )
    .bind(new_id)
    .bind(id)
    .execute(&pool)
    .await;

    tokio::spawn(run_clone(
        pool.clone(),
        CloneJob {
            new_install_id: new_id,
            src_install_path: src.install_path(),
            src_db_name: src.db_name.clone(),
            src_db_user: src.db_user.clone(),
            src_db_password: src.db_password.clone(),
            src_db_host: src.db_host.clone(),
            new_doc_root,
            new_wp_path: src.wp_path.clone(),
            new_db_name,
            new_db_user,
            new_db_password,
            new_db_host: src.db_host.clone(),
            new_db_prefix: src.db_prefix.clone(),
            old_url: format!("https://{}", src.primary_domain),
            new_url: format!("https://{}", staging_domain),
            is_staging: true,
        },
    ));

    Ok(Json(CloneResponse { installation_id: new_id.to_string() }))
}

// ── Push staging to live ──────────────────────────────────────────────────────

pub async fn push_to_live(
    AuthSession(_s): AuthSession,
    Path(id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // id = staging install
    let staging = SourceInstall::load(&pool, id).await?;

    let source_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT source_install_id FROM plugin_wordpress_installations WHERE id = $1 AND is_staging = true",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?
    .flatten();

    let source_id = source_id.ok_or_else(|| ApiError::bad_request("not a staging environment or no source linked"))?;
    let prod = SourceInstall::load(&pool, source_id).await?;

    // Mark both as syncing
    let _ = sqlx::query(
        "UPDATE plugin_wordpress_installations SET state='syncing', updated_at=now() WHERE id IN ($1,$2)",
    )
    .bind(id).bind(source_id)
    .execute(&pool).await;

    tokio::spawn(run_push_to_live(pool.clone(), id, source_id, staging, prod));

    Ok(Json(serde_json::json!({ "message": "push to live started" })))
}

// ── Background clone job ──────────────────────────────────────────────────────

struct CloneJob {
    new_install_id: Uuid,
    src_install_path: String,
    src_db_name: String,
    src_db_user: String,
    src_db_password: String,
    src_db_host: String,
    new_doc_root: String,
    new_wp_path: String,
    new_db_name: String,
    new_db_user: String,
    new_db_password: String,
    new_db_host: String,
    new_db_prefix: String,
    old_url: String,
    new_url: String,
    is_staging: bool,
}

async fn run_clone(pool: PgPool, job: CloneJob) {
    let id = job.new_install_id;
    match do_clone(&job).await {
        Ok(_) => {
            let subpath = if job.new_wp_path == "/" { String::new() } else { job.new_wp_path.clone() };
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations
                 SET state='active', site_url=$1, db_name=$2, db_user=$3, db_password=$4, updated_at=now()
                 WHERE id=$5",
            )
            .bind(&job.new_url)
            .bind(&job.new_db_name)
            .bind(&job.new_db_user)
            .bind(&job.new_db_password)
            .bind(id)
            .execute(&pool)
            .await;
            tracing::info!(installation_id=%id, url=%job.new_url, "clone complete");
        }
        Err(e) => {
            tracing::error!(installation_id=%id, error=%e, "clone failed");
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations SET state='error', error_message=$1, updated_at=now() WHERE id=$2",
            )
            .bind(e.to_string())
            .bind(id)
            .execute(&pool)
            .await;
        }
    }
}

async fn do_clone(job: &CloneJob) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let wp = crate::routes::wp_provisioner::wp_bin();
    let new_install_path = crate::routes::wp_provisioner::resolve_path(&job.new_doc_root, &job.new_wp_path);
    let mysql_host = std::env::var("TUNDRA_WP_MYSQL_HOST").unwrap_or_else(|_| job.new_db_host.clone());
    let admin_user = std::env::var("TUNDRA_WP_MYSQL_ADMIN_USER").unwrap_or_else(|_| "wordpress".into());
    let admin_pass = std::env::var("TUNDRA_WP_MYSQL_ROOT_PASSWORD")
        .or_else(|_| std::env::var("TUNDRA_WP_MYSQL_PASSWORD"))
        .unwrap_or_default();

    // Step 1: create target MySQL DB + user
    tracing::info!(id=%job.new_install_id, db=%job.new_db_name, "clone: create DB");
    {
        let sql = format!(
            "CREATE DATABASE IF NOT EXISTS `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\
             CREATE USER IF NOT EXISTS '{user}'@'%' IDENTIFIED BY '{pass}';\
             GRANT ALL PRIVILEGES ON `{db}`.* TO '{user}'@'%';\
             FLUSH PRIVILEGES;",
            db   = job.new_db_name.replace('`', ""),
            user = job.new_db_user.replace('\'', ""),
            pass = job.new_db_password.replace('\'', "\\'"),
        );
        let out = Command::new("mysql")
            .env("MYSQL_PWD", &admin_pass)
            .args(["-h", &mysql_host, "-u", &admin_user, "--skip-ssl", "-e", &sql])
            .output().await?;
        if !out.status.success() {
            return Err(format!("create db: {}", String::from_utf8_lossy(&out.stderr)).into());
        }
    }

    // Step 2: dump source DB
    tracing::info!(id=%job.new_install_id, src=%job.src_db_name, "clone: mysqldump");
    let dump_out = Command::new("mysqldump")
        .env("MYSQL_PWD", &job.src_db_password)
        .args(["-h", &mysql_host, "-u", &job.src_db_user, "--skip-ssl",
               "--single-transaction", "--add-drop-table", &job.src_db_name])
        .output().await?;
    if !dump_out.status.success() {
        return Err(format!("mysqldump: {}", String::from_utf8_lossy(&dump_out.stderr)).into());
    }

    // Step 3: import dump into new DB
    tracing::info!(id=%job.new_install_id, dst=%job.new_db_name, "clone: import dump");
    let mut import_cmd = Command::new("mysql");
    import_cmd.env("MYSQL_PWD", &job.new_db_password)
        .args(["-h", &mysql_host, "-u", &job.new_db_user, "--skip-ssl", &job.new_db_name])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    let mut child = import_cmd.spawn()?;
    if let Some(stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let mut w = tokio::io::BufWriter::new(stdin);
        w.write_all(&dump_out.stdout).await?;
        w.flush().await?;
    }
    let import_status = child.wait().await?;
    if !import_status.success() {
        return Err("mysql import failed".into());
    }

    // Step 4: rsync files
    tracing::info!(id=%job.new_install_id, src=%job.src_install_path, dst=%new_install_path, "clone: rsync files");
    tokio::fs::create_dir_all(&new_install_path).await?;
    let rsync = Command::new("rsync")
        .args(["-a", "--delete",
               &format!("{}/", job.src_install_path),
               &format!("{}/", new_install_path)])
        .output().await?;
    if !rsync.status.success() {
        return Err(format!("rsync: {}", String::from_utf8_lossy(&rsync.stderr)).into());
    }

    // Step 5: update wp-config.php with new credentials
    tracing::info!(id=%job.new_install_id, "clone: wp config set");
    for (key, val) in [
        ("DB_NAME",     job.new_db_name.as_str()),
        ("DB_USER",     job.new_db_user.as_str()),
        ("DB_PASSWORD", job.new_db_password.as_str()),
        ("DB_HOST",     mysql_host.as_str()),
    ] {
        let _ = Command::new(&wp)
            .args(["config", "set", key, val,
                   &format!("--path={}", new_install_path), "--allow-root"])
            .output().await;
    }

    // Step 6: search-replace old URL → new URL
    tracing::info!(id=%job.new_install_id, old=%job.old_url, new=%job.new_url, "clone: search-replace URLs");
    let sr = Command::new(&wp)
        .args(["search-replace", &job.old_url, &job.new_url,
               &format!("--path={}", new_install_path),
               "--allow-root", "--skip-columns=guid"])
        .output().await?;
    if !sr.status.success() {
        tracing::warn!(id=%job.new_install_id, stderr=%String::from_utf8_lossy(&sr.stderr), "search-replace warning");
    }

    Ok(())
}

// ── Background push-to-live job ───────────────────────────────────────────────

async fn run_push_to_live(
    pool: PgPool,
    staging_id: Uuid,
    prod_id: Uuid,
    staging: SourceInstall,
    prod: SourceInstall,
) {
    match do_push_to_live(&staging, &prod).await {
        Ok(_) => {
            for id in [staging_id, prod_id] {
                let _ = sqlx::query(
                    "UPDATE plugin_wordpress_installations SET state='active', updated_at=now() WHERE id=$1",
                ).bind(id).execute(&pool).await;
            }
            tracing::info!(staging_id=%staging_id, prod_id=%prod_id, "push-to-live complete");
        }
        Err(e) => {
            tracing::error!(staging_id=%staging_id, error=%e, "push-to-live failed");
            for id in [staging_id, prod_id] {
                let _ = sqlx::query(
                    "UPDATE plugin_wordpress_installations SET state='active', error_message=$1, updated_at=now() WHERE id=$2",
                ).bind(e.to_string()).bind(id).execute(&pool).await;
            }
        }
    }
}

async fn do_push_to_live(
    staging: &SourceInstall,
    prod: &SourceInstall,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let wp = crate::routes::wp_provisioner::wp_bin();
    let mysql_host = std::env::var("TUNDRA_WP_MYSQL_HOST").unwrap_or_else(|_| prod.db_host.clone());

    let staging_path = staging.install_path();
    let prod_path = prod.install_path();

    // Step 1: dump staging DB
    tracing::info!(staging_db=%staging.db_name, prod_db=%prod.db_name, "push-to-live: dump staging");
    let dump = Command::new("mysqldump")
        .env("MYSQL_PWD", &staging.db_password)
        .args(["-h", &mysql_host, "-u", &staging.db_user, "--skip-ssl",
               "--single-transaction", "--add-drop-table", &staging.db_name])
        .output().await?;
    if !dump.status.success() {
        return Err(format!("dump staging: {}", String::from_utf8_lossy(&dump.stderr)).into());
    }

    // Step 2: import into production DB
    tracing::info!("push-to-live: import to production");
    let mut cmd = Command::new("mysql");
    cmd.env("MYSQL_PWD", &prod.db_password)
        .args(["-h", &mysql_host, "-u", &prod.db_user, "--skip-ssl", &prod.db_name])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null());
    let mut child = cmd.spawn()?;
    if let Some(stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let mut w = tokio::io::BufWriter::new(stdin);
        w.write_all(&dump.stdout).await?;
        w.flush().await?;
    }
    child.wait().await?;

    // Step 3: rsync staging files → production (skip wp-config.php)
    tracing::info!("push-to-live: rsync files");
    let rsync = Command::new("rsync")
        .args(["-a", "--delete", "--exclude=wp-config.php",
               &format!("{}/", staging_path),
               &format!("{}/", prod_path)])
        .output().await?;
    if !rsync.status.success() {
        return Err(format!("rsync: {}", String::from_utf8_lossy(&rsync.stderr)).into());
    }

    // Step 4: rewrite staging URL → production URL in production DB
    let staging_url = format!("https://{}", staging.primary_domain);
    let prod_url    = format!("https://{}", prod.primary_domain);
    tracing::info!(old=%staging_url, new=%prod_url, "push-to-live: search-replace");
    let _ = Command::new(&wp)
        .args(["search-replace", &staging_url, &prod_url,
               &format!("--path={}", prod_path),
               "--allow-root", "--skip-columns=guid"])
        .output().await;

    Ok(())
}

// ── Staging status ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct StagingStatus {
    pub has_staging: bool,
    pub staging_install_id: Option<String>,
    pub staging_state: Option<String>,
    pub staging_url: Option<String>,
    pub is_staging: bool,
    pub source_install_id: Option<String>,
}

pub async fn get_staging_status(
    AuthSession(_s): AuthSession,
    Path(id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<StagingStatus>, ApiError> {
    let row: Option<(bool, Option<Uuid>, Option<Uuid>)> = sqlx::query_as(
        "SELECT is_staging, staging_install_id, source_install_id FROM plugin_wordpress_installations WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    let (is_staging, staging_id, source_id) = row.ok_or_else(|| ApiError::not_found("wordpress installation"))?;

    // If this install has a staging child, fetch its state + url
    let staging_info: Option<(String, Option<String>)> = if let Some(sid) = staging_id {
        sqlx::query_as(
            "SELECT state, site_url FROM plugin_wordpress_installations WHERE id = $1",
        )
        .bind(sid)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None)
    } else {
        None
    };

    Ok(Json(StagingStatus {
        has_staging: staging_id.is_some(),
        staging_install_id: staging_id.map(|u| u.to_string()),
        staging_state: staging_info.as_ref().map(|r| r.0.clone()),
        staging_url: staging_info.and_then(|r| r.1),
        is_staging,
        source_install_id: source_id.map(|u| u.to_string()),
    }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn generate_password(id: &Uuid) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    id.hash(&mut h);
    format!("Wp{:x}X!", h.finish())
}

async fn resolve_document_root(pool: &PgPool, site_id: Uuid) -> Result<String, ApiError> {
    let root: Option<String> = sqlx::query_scalar(
        "SELECT document_root FROM sites WHERE id = $1",
    )
    .bind(site_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::internal())?;

    root.ok_or_else(|| ApiError::not_found("site"))
}
