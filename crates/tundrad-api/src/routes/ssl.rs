use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use serde::Serialize;
use tundrad_acme::AcmeProvisioner;
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::{CertificateRepo, CertificateRow, NewCertificate, PgPool};
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession, serde_util::fmt_dt_opt};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CertificateDto {
    pub id: String,
    pub site_id: Option<String>,
    pub status: String,
    pub issuer: String,
    pub common_name: String,
    pub san: Vec<String>,
    pub not_before: Option<String>,
    pub not_after: Option<String>,
    pub auto_renew: bool,
    pub last_renewed_at: Option<String>,
    pub acme_order_url: Option<String>,
    pub created_at: String,
}

fn to_dto(r: CertificateRow) -> CertificateDto {
    use crate::serde_util::fmt_dt;
    CertificateDto {
        id: r.id.to_string(),
        site_id: r.site_id.map(|u| u.to_string()),
        status: r.status,
        issuer: r.issuer,
        common_name: r.common_name,
        san: r.san,
        not_before: fmt_dt_opt(r.not_before),
        not_after: fmt_dt_opt(r.not_after),
        auto_renew: r.auto_renew,
        last_renewed_at: fmt_dt_opt(r.last_renewed_at),
        acme_order_url: r.acme_order_url,
        created_at: fmt_dt(r.created_at),
    }
}

// ── GET /api/v1/sites/{id}/ssl ────────────────────────────────────────────────

pub async fn get_certificate(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Site)
        .map_err(ApiError::from)?;

    // Verify the site exists (returns 404 if not).
    tundrad_repo::SiteRepo::new(&pool)
        .find_by_id(site_id)
        .await
        .map_err(ApiError::from)?;

    let row = CertificateRepo::new(&pool)
        .find_by_site(site_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("certificate"))?;

    Ok(Json(to_dto(row)))
}

// ── POST /api/v1/sites/{id}/ssl ───────────────────────────────────────────────

pub async fn request_certificate(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Site)
        .map_err(ApiError::from)?;

    let site = tundrad_repo::SiteRepo::new(&pool)
        .find_by_id(site_id)
        .await
        .map_err(ApiError::from)?;

    let domain = site.primary_domain.clone();

    // Create the pending certificate row.
    let cert = CertificateRepo::new(&pool)
        .create(NewCertificate {
            site_id,
            common_name: &domain,
            san: vec![domain.clone()],
        })
        .await
        .map_err(ApiError::from)?;

    let cert_id = cert.id;
    let pool_bg = pool.clone();

    // Audit the request initiation.
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "ssl.request".to_owned(),
            resource_type: Some("certificate".to_owned()),
            resource_id: Some(cert_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "site_id": site_id, "domain": domain }),
        })
        .await
        .map_err(ApiError::from)?;

    // Spawn the ACME background task — fire and forget.
    tokio::spawn(async move {
        run_acme_provisioning(pool_bg, cert_id, domain).await;
    });

    Ok((StatusCode::ACCEPTED, Json(to_dto(cert))))
}

// ── POST /api/v1/sites/{id}/ssl/renew ─────────────────────────────────────────

pub async fn renew_certificate(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Site)
        .map_err(ApiError::from)?;

    let site = tundrad_repo::SiteRepo::new(&pool)
        .find_by_id(site_id)
        .await
        .map_err(ApiError::from)?;

    // Find the existing active/failed certificate to renew.
    let existing = CertificateRepo::new(&pool)
        .find_by_site(site_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("certificate"))?;

    let domain = site.primary_domain.clone();
    let cert_id = existing.id;
    let pool_bg = pool.clone();

    // Reset status to pending so the frontend can poll.
    CertificateRepo::new(&pool)
        .update_status(cert_id, "pending")
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "ssl.renew".to_owned(),
            resource_type: Some("certificate".to_owned()),
            resource_id: Some(cert_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "site_id": site_id, "domain": domain }),
        })
        .await
        .map_err(ApiError::from)?;

    tokio::spawn(async move {
        run_acme_provisioning(pool_bg, cert_id, domain).await;
    });

    let updated = CertificateRepo::new(&pool)
        .find_by_id(cert_id)
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::ACCEPTED, Json(to_dto(updated))))
}

// ── GET /.well-known/acme-challenge/{token} ───────────────────────────────────

pub async fn acme_challenge(
    State(pool): State<PgPool>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let key_auth = CertificateRepo::new(&pool)
        .find_key_auth_by_token(&token)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("challenge"))?;

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );

    Ok((headers, key_auth))
}

// ── Background ACME provisioning task ────────────────────────────────────────

async fn run_acme_provisioning(pool: PgPool, cert_id: Uuid, domain: String) {
    tracing::info!(cert_id = %cert_id, domain = %domain, "ACME: starting provisioning task");

    let result = do_provision(&pool, cert_id, &domain).await;
    if let Err(e) = result {
        tracing::error!(cert_id = %cert_id, domain = %domain, error = %e, "ACME: provisioning failed");
        // Mark the certificate row as failed so the UI can display the error state.
        if let Err(db_err) = CertificateRepo::new(&pool)
            .update_status(cert_id, "failed")
            .await
        {
            tracing::error!(cert_id = %cert_id, error = %db_err, "ACME: failed to update status to 'failed'");
        }
    }
}

async fn do_provision(
    pool: &PgPool,
    cert_id: Uuid,
    domain: &str,
) -> anyhow::Result<()> {
    // Use staging in development; the production provisioner should be wired from config.
    // TODO: read ACME environment from tundrad-config (production vs staging).
    let provisioner = AcmeProvisioner::lets_encrypt_staging();

    let pool_cb = pool.clone();
    let issued = provisioner
        .provision(domain, move |token, key_auth| {
            let pool = pool_cb.clone();
            let token = token.to_owned();
            let key_auth = key_auth.to_owned();
            Box::pin(async move {
                CertificateRepo::new(&pool)
                    .update_challenge(
                        cert_id,
                        &token,
                        &key_auth,
                        // order URL not yet known at challenge time; will be empty for now
                        "",
                    )
                    .await
                    .map_err(|e| anyhow::anyhow!("DB error storing challenge: {e}"))
            })
        })
        .await?;

    CertificateRepo::new(pool)
        .update_certificate(
            cert_id,
            &issued.cert_pem,
            &issued.chain_pem,
            issued.key_pem.as_bytes(),
            issued.not_before,
            issued.not_after,
        )
        .await
        .map_err(|e| anyhow::anyhow!("DB error storing certificate: {e}"))?;

    tracing::info!(cert_id = %cert_id, domain = %domain, "ACME: certificate stored successfully");
    Ok(())
}
