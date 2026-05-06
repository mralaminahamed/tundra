use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use axum::{
    Json,
    extract::{Path as AxumPath, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::PgPool;

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct FileEntryDto {
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String, // "file" | "dir" | "symlink"
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub perms: String,
    pub owner: String,
}

#[derive(Deserialize)]
pub struct PathQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct MkdirRequest {
    pub path: String,
}

#[derive(Deserialize)]
pub struct TouchRequest {
    pub path: String,
}

#[derive(Deserialize)]
pub struct RenameRequest {
    pub from: String,
    pub to: String,
}

#[derive(Deserialize)]
pub struct ChmodRequest {
    pub path: String,
    pub mode: String,
}

// ── Security helpers ──────────────────────────────────────────────────────────

/// Resolves `user_path` relative to `doc_root` and verifies the result is a
/// strict descendant of (or equal to) `doc_root`.  Returns the canonical
/// absolute path on success, or a 403 ApiError if the path escapes the root.
///
/// When the target does not yet exist (e.g. new file), we canonicalize the
/// *parent* and reconstruct the final component afterwards.
async fn resolve_safe(doc_root: &Path, user_path: &str) -> Result<PathBuf, ApiError> {
    // Strip leading slash so joining works correctly.
    let stripped = user_path.trim_start_matches('/');
    let candidate = doc_root.join(stripped);

    // Attempt full canonicalize first (works if the file already exists).
    match tokio::fs::canonicalize(&candidate).await {
        Ok(canonical) => {
            if canonical.starts_with(doc_root) {
                Ok(canonical)
            } else {
                Err(ApiError::forbidden("path escapes document root"))
            }
        }
        Err(_) => {
            // File/dir doesn't exist yet — canonicalize the parent instead.
            let parent = candidate
                .parent()
                .ok_or_else(|| ApiError::forbidden("invalid path"))?;
            let canonical_parent = tokio::fs::canonicalize(parent).await.map_err(|_| {
                ApiError::new(
                    StatusCode::NOT_FOUND,
                    "files.not_found",
                    "parent path not found",
                )
            })?;
            if !canonical_parent.starts_with(doc_root) {
                return Err(ApiError::forbidden("path escapes document root"));
            }
            let file_name = candidate
                .file_name()
                .ok_or_else(|| ApiError::bad_request("invalid path: no file name"))?;
            Ok(canonical_parent.join(file_name))
        }
    }
}

/// Canonicalize `doc_root` so that `starts_with` comparisons are reliable.
async fn canonical_doc_root(raw: &str) -> Result<PathBuf, ApiError> {
    tokio::fs::canonicalize(raw).await.map_err(|e| {
        tracing::error!("failed to canonicalize document_root {raw}: {e}");
        ApiError::internal()
    })
}

// ── Shared site + auth lookup ─────────────────────────────────────────────────

async fn require_site(
    pool: &PgPool,
    session_operator_id: Uuid,
    site_id: Uuid,
    action: Action,
) -> Result<tundrad_domain::Site, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(pool)
        .find_by_id(session_operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, action, Resource::Site)
        .map_err(ApiError::from)?;

    tundrad_repo::SiteRepo::new(pool)
        .find_by_id(site_id)
        .await
        .map_err(ApiError::from)
}

// ── Metadata helper ───────────────────────────────────────────────────────────

fn format_modified(meta: &std::fs::Metadata) -> Option<String> {
    meta.modified().ok().map(|st| {
        let secs = st
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        // Build an OffsetDateTime from unix timestamp, fall back to raw seconds on failure.
        time::OffsetDateTime::from_unix_timestamp(secs as i64)
            .ok()
            .and_then(|dt| {
                dt.format(&time::format_description::well_known::Rfc3339)
                    .ok()
            })
            .unwrap_or_else(|| secs.to_string())
    })
}

fn entry_type(meta: &std::fs::Metadata) -> &'static str {
    if meta.is_symlink() {
        "symlink"
    } else if meta.is_dir() {
        "dir"
    } else {
        "file"
    }
}

fn owner_string(uid: u32) -> String {
    // Attempt to resolve uid → username without pulling in `nix`.
    // Read `/etc/passwd` synchronously (small file, acceptable once per entry).
    if let Ok(passwd) = std::fs::read_to_string("/etc/passwd") {
        for line in passwd.lines() {
            let mut parts = line.splitn(4, ':');
            if let (Some(name), _, Some(uid_str), _) =
                (parts.next(), parts.next(), parts.next(), parts.next())
            {
                if uid_str == uid.to_string().as_str() {
                    return name.to_owned();
                }
            }
        }
    }
    uid.to_string()
}

fn build_entry(name: String, meta: &std::fs::Metadata) -> FileEntryDto {
    let mode = meta.mode();
    let perms = format!("{:03o}", mode & 0o777);
    let owner = owner_string(meta.uid());
    let modified = format_modified(meta);
    let size = if meta.is_file() {
        Some(meta.len())
    } else {
        None
    };

    FileEntryDto {
        name,
        r#type: entry_type(meta).to_owned(),
        size,
        modified,
        perms,
        owner,
    }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /api/v1/sites/{site_id}/files?path=/wp-content
pub async fn list_dir(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Query(q): Query<PathQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Read).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &q.path).await?;

    let mut read_dir = tokio::fs::read_dir(&abs_path).await.map_err(|e| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "files.not_found",
            format!("cannot list directory: {e}"),
        )
    })?;

    let mut entries: Vec<FileEntryDto> = Vec::new();
    while let Some(entry) = read_dir.next_entry().await.map_err(|e| {
        tracing::warn!("error reading dir entry: {e}");
        ApiError::internal()
    })? {
        let name = entry.file_name().to_string_lossy().into_owned();
        // Use symlink_metadata so we can detect symlinks.
        if let Ok(meta) = entry.metadata().await {
            entries.push(build_entry(name, &meta));
        }
    }

    // Sort: directories first, then files, both groups alphabetically.
    entries.sort_by(|a, b| {
        let a_is_dir = a.r#type == "dir";
        let b_is_dir = b.r#type == "dir";
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(Json(serde_json::json!({ "data": entries })))
}

/// GET /api/v1/sites/{site_id}/files/content?path=/wp-config.php
pub async fn read_file(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Query(q): Query<PathQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Read).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &q.path).await?;

    let meta = tokio::fs::metadata(&abs_path)
        .await
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "files.not_found", "file not found"))?;

    if !meta.is_file() {
        return Err(ApiError::bad_request("path is not a regular file"));
    }

    const MAX_SIZE: u64 = 2 * 1024 * 1024; // 2 MB
    if meta.len() > MAX_SIZE {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "files.too_large",
            "file exceeds 2 MB limit",
        ));
    }

    let bytes = tokio::fs::read(&abs_path).await.map_err(|e| {
        tracing::error!("read_file error: {e}");
        ApiError::internal()
    })?;

    // Detect binary: look for null bytes in the first 8 KB.
    let probe = &bytes[..bytes.len().min(8192)];
    if probe.contains(&0u8) {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "files.binary",
            "file appears to be binary",
        ));
    }

    let content = String::from_utf8(bytes).map_err(|_| {
        ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "files.binary",
            "file is not valid UTF-8",
        )
    })?;

    Ok(Json(serde_json::json!({ "content": content })))
}

/// PUT /api/v1/sites/{site_id}/files/content
pub async fn write_file(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Json(body): Json<WriteFileRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Update).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &body.path).await?;

    tokio::fs::write(&abs_path, body.content.as_bytes())
        .await
        .map_err(|e| {
            tracing::error!("write_file error: {e}");
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "files.write_error",
                format!("failed to write file: {e}"),
            )
        })?;

    Ok(StatusCode::OK)
}

/// POST /api/v1/sites/{site_id}/files/mkdir
pub async fn mkdir(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Json(body): Json<MkdirRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Create).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &body.path).await?;

    tokio::fs::create_dir_all(&abs_path).await.map_err(|e| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "files.mkdir_error",
            format!("failed to create directory: {e}"),
        )
    })?;

    Ok(StatusCode::CREATED)
}

/// POST /api/v1/sites/{site_id}/files/touch
pub async fn touch(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Json(body): Json<TouchRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Create).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &body.path).await?;

    // Open with create + append so we don't truncate an existing file.
    tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&abs_path)
        .await
        .map_err(|e| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "files.touch_error",
                format!("failed to create file: {e}"),
            )
        })?;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/sites/{site_id}/files?path=/wp-content/old-dir
pub async fn delete_entry(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Query(q): Query<PathQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Delete).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &q.path).await?;

    // Safety: reject deletion of the document root itself.
    if abs_path == root {
        return Err(ApiError::forbidden("cannot delete document root"));
    }

    let meta = tokio::fs::metadata(&abs_path)
        .await
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "files.not_found", "path not found"))?;

    if meta.is_dir() {
        tokio::fs::remove_dir_all(&abs_path).await.map_err(|e| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "files.delete_error",
                format!("failed to remove directory: {e}"),
            )
        })?;
    } else {
        tokio::fs::remove_file(&abs_path).await.map_err(|e| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "files.delete_error",
                format!("failed to remove file: {e}"),
            )
        })?;
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/sites/{site_id}/files/rename
pub async fn rename_entry(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Json(body): Json<RenameRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Update).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let from_path = resolve_safe(&root, &body.from).await?;
    let to_path = resolve_safe(&root, &body.to).await?;

    tokio::fs::rename(&from_path, &to_path).await.map_err(|e| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "files.rename_error",
            format!("failed to rename: {e}"),
        )
    })?;

    Ok(StatusCode::OK)
}

/// POST /api/v1/sites/{site_id}/files/chmod
pub async fn chmod_entry(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    AxumPath(site_id): AxumPath<Uuid>,
    Json(body): Json<ChmodRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site = require_site(&pool, session.operator_id, site_id, Action::Update).await?;
    let root = canonical_doc_root(&site.document_root).await?;
    let abs_path = resolve_safe(&root, &body.path).await?;

    // Validate mode: exactly 3 octal digits.
    if body.mode.len() != 3 || !body.mode.chars().all(|c| c.is_ascii_digit() && c < '8') {
        return Err(ApiError::bad_request(
            "mode must be a 3-digit octal string (e.g. \"644\")",
        ));
    }
    let mode = u32::from_str_radix(&body.mode, 8)
        .map_err(|_| ApiError::bad_request("mode must be a 3-digit octal string (e.g. \"644\")"))?;

    use std::os::unix::fs::PermissionsExt;
    let permissions = std::fs::Permissions::from_mode(mode);
    tokio::fs::set_permissions(&abs_path, permissions)
        .await
        .map_err(|e| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "files.chmod_error",
                format!("failed to set permissions: {e}"),
            )
        })?;

    Ok(StatusCode::OK)
}
