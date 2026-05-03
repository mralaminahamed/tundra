use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{AuditActor, NewAlias, NewAuditEntry, NewDkimKey, NewMailDomain, NewMailbox};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MailDomainDto {
    pub id: String,
    pub domain: String,
    pub spf_policy: String,
    pub dmarc_policy: String,
    pub mx_host: String,
    pub active: bool,
    pub webmail_enabled: bool,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DkimKeyDto {
    pub id: String,
    pub selector: String,
    pub algorithm: String,
    pub public_key_pem: String,
    pub is_active: bool,
}

#[derive(Serialize)]
pub struct MailboxDto {
    pub id: String,
    pub mail_domain_id: String,
    pub local_part: String,
    pub password_scheme: String,
    pub quota_bytes: i64,
    pub used_bytes: i64,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct AliasDto {
    pub id: String,
    pub mail_domain_id: String,
    pub source: String,
    pub destinations: Vec<String>,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct MailQueueEntryDto {
    pub id: String,
    pub queue_id: String,
    pub queue_name: String,
    pub sender: String,
    pub recipients: Vec<String>,
    pub subject: Option<String>,
    pub size_bytes: i64,
    pub arrival_time: String,
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateMailDomainRequest {
    pub domain: String,
    pub mx_host: String,
    pub spf_policy: Option<String>,
    pub dmarc_policy: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateMailboxRequest {
    pub mail_domain_id: String,
    pub local_part: String,
    pub password: String,
    pub quota_bytes: Option<i64>,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub password: String,
}

#[derive(Deserialize)]
pub struct CreateAliasRequest {
    pub mail_domain_id: String,
    pub source: String,
    pub destinations: Vec<String>,
}

#[derive(Deserialize)]
pub struct QueueActionRequest {
    pub queue_id: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_mail_domain_dto(d: tundrad_domain::MailDomain) -> MailDomainDto {
    MailDomainDto {
        id: d.id.to_string(),
        domain: d.domain,
        spf_policy: d.spf_policy,
        dmarc_policy: d.dmarc_policy,
        mx_host: d.mx_host,
        active: d.active,
        webmail_enabled: d.webmail_enabled,
        created_at: d.created_at.to_string(),
    }
}

fn to_mailbox_dto(m: tundrad_domain::Mailbox) -> MailboxDto {
    MailboxDto {
        id: m.id.to_string(),
        mail_domain_id: m.mail_domain_id.to_string(),
        local_part: m.local_part,
        password_scheme: m.password_scheme,
        quota_bytes: m.quota_bytes,
        used_bytes: m.used_bytes,
        is_active: m.is_active,
        created_at: m.created_at.to_string(),
    }
}

fn to_alias_dto(a: tundrad_domain::Alias) -> AliasDto {
    AliasDto {
        id: a.id.to_string(),
        mail_domain_id: a.mail_domain_id.to_string(),
        source: a.source,
        destinations: a.destinations,
        is_active: a.is_active,
        created_at: a.created_at.to_string(),
    }
}

fn to_queue_dto(e: tundrad_domain::MailQueueEntry) -> MailQueueEntryDto {
    MailQueueEntryDto {
        id: e.id.to_string(),
        queue_id: e.queue_id,
        queue_name: e.queue_name,
        sender: e.sender,
        recipients: e.recipients,
        subject: e.subject,
        size_bytes: e.size_bytes,
        arrival_time: e.arrival_time.to_string(),
        reason: e.reason,
    }
}

// ── Mail Domains ──────────────────────────────────────────────────────────────

pub async fn list_mail_domains(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::MailDomain)
        .map_err(ApiError::from)?;
    let domains = tundrad_repo::MailDomainRepo::new(&pool)
        .list()
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = domains.into_iter().map(to_mail_domain_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_mail_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::MailDomain)
        .map_err(ApiError::from)?;
    let domain = tundrad_repo::MailDomainRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_mail_domain_dto(domain)))
}

pub async fn create_mail_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateMailDomainRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::MailDomain)
        .map_err(ApiError::from)?;

    let domain = tundrad_repo::MailDomainRepo::new(&pool)
        .create(NewMailDomain {
            domain: body.domain,
            mx_host: body.mx_host,
            spf_policy: body.spf_policy,
            dmarc_policy: body.dmarc_policy,
        })
        .await
        .map_err(ApiError::from)?;

    // Auto-generate DKIM keypair (stub — production generates real RSA-2048 key).
    let selector = format!("tundra{}", time::OffsetDateTime::now_utc().year());
    let stub_pub = "-----BEGIN PUBLIC KEY-----\nSTUB\n-----END PUBLIC KEY-----".to_owned();
    let stub_priv =
        "-----BEGIN RSA PRIVATE KEY-----\nSTUB\n-----END RSA PRIVATE KEY-----".to_owned();
    tundrad_repo::DkimKeyRepo::new(&pool)
        .create(NewDkimKey {
            mail_domain_id: domain.id,
            selector: selector.clone(),
            algorithm: "rsa".to_owned(),
            public_key_pem: stub_pub,
            private_key_pem: stub_priv,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mail_domain.create".to_owned(),
            resource_type: Some("mail_domain".to_owned()),
            resource_id: Some(domain.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "domain": domain.domain, "dkim_selector": selector }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_mail_domain_dto(domain))))
}

pub async fn delete_mail_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::MailDomain)
        .map_err(ApiError::from)?;
    tundrad_repo::MailDomainRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mail_domain.delete".to_owned(),
            resource_type: Some("mail_domain".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn regenerate_dkim(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::MailDomain)
        .map_err(ApiError::from)?;

    let selector = format!("tundra{}", time::OffsetDateTime::now_utc().unix_timestamp());
    let stub_pub = "-----BEGIN PUBLIC KEY-----\nSTUB-ROTATED\n-----END PUBLIC KEY-----".to_owned();
    let stub_priv =
        "-----BEGIN RSA PRIVATE KEY-----\nSTUB-ROTATED\n-----END RSA PRIVATE KEY-----".to_owned();

    let key = tundrad_repo::DkimKeyRepo::new(&pool)
        .rotate(
            id,
            NewDkimKey {
                mail_domain_id: id,
                selector: selector.clone(),
                algorithm: "rsa".to_owned(),
                public_key_pem: stub_pub.clone(),
                private_key_pem: stub_priv,
            },
        )
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mail_domain.dkim_regenerated".to_owned(),
            resource_type: Some("mail_domain".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "new_selector": selector }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(DkimKeyDto {
        id: key.id.to_string(),
        selector: key.selector,
        algorithm: key.algorithm,
        public_key_pem: key.public_key_pem,
        is_active: key.is_active,
    }))
}

// ── Mailboxes ─────────────────────────────────────────────────────────────────

pub async fn list_mailboxes(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(domain_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Mailbox)
        .map_err(ApiError::from)?;
    let boxes = tundrad_repo::MailboxRepo::new(&pool)
        .list(domain_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = boxes.into_iter().map(to_mailbox_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_mailbox(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateMailboxRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::Mailbox)
        .map_err(ApiError::from)?;

    let mail_domain_id: Uuid = body
        .mail_domain_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid mail_domain_id"))?;

    let mb = tundrad_repo::MailboxRepo::new(&pool)
        .create(NewMailbox {
            mail_domain_id,
            local_part: body.local_part,
            password: body.password,
            quota_bytes: body.quota_bytes,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mailbox.create".to_owned(),
            resource_type: Some("mailbox".to_owned()),
            resource_id: Some(mb.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "local_part": mb.local_part }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_mailbox_dto(mb))))
}

pub async fn delete_mailbox(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::Mailbox)
        .map_err(ApiError::from)?;
    tundrad_repo::MailboxRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mailbox.delete".to_owned(),
            resource_type: Some("mailbox".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reset_mailbox_password(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    Json(body): Json<ResetPasswordRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::Mailbox)
        .map_err(ApiError::from)?;
    tundrad_repo::MailboxRepo::new(&pool)
        .reset_password(id, &body.password)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mailbox.password_reset".to_owned(),
            resource_type: Some("mailbox".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Aliases ───────────────────────────────────────────────────────────────────

pub async fn list_aliases(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(domain_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Alias)
        .map_err(ApiError::from)?;
    let aliases = tundrad_repo::AliasRepo::new(&pool)
        .list(domain_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = aliases.into_iter().map(to_alias_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_alias(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateAliasRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::Alias)
        .map_err(ApiError::from)?;

    let mail_domain_id: Uuid = body
        .mail_domain_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid mail_domain_id"))?;

    let alias = tundrad_repo::AliasRepo::new(&pool)
        .create(NewAlias {
            mail_domain_id,
            source: body.source,
            destinations: body.destinations,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "alias.create".to_owned(),
            resource_type: Some("alias".to_owned()),
            resource_id: Some(alias.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "source": alias.source }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_alias_dto(alias))))
}

pub async fn delete_alias(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::Alias)
        .map_err(ApiError::from)?;
    tundrad_repo::AliasRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "alias.delete".to_owned(),
            resource_type: Some("alias".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Mail queue ────────────────────────────────────────────────────────────────

pub async fn list_queue(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::MailQueue)
        .map_err(ApiError::from)?;
    let entries = tundrad_repo::MailQueueRepo::new(&pool)
        .list()
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = entries.into_iter().map(to_queue_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn queue_hold(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<QueueActionRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::MailQueue)
        .map_err(ApiError::from)?;
    // Production: PostfixProvider::hold_message(&body.queue_id)
    tracing::info!(queue_id = %body.queue_id, "postsuper hold (stub)");
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mail_queue.hold".to_owned(),
            resource_type: Some("mail_queue".to_owned()),
            resource_id: None,
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "queue_id": body.queue_id }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn queue_release(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<QueueActionRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::MailQueue)
        .map_err(ApiError::from)?;
    tracing::info!(queue_id = %body.queue_id, "postsuper release (stub)");
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mail_queue.release".to_owned(),
            resource_type: Some("mail_queue".to_owned()),
            resource_id: None,
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "queue_id": body.queue_id }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn queue_delete(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<QueueActionRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::MailQueue)
        .map_err(ApiError::from)?;
    tracing::info!(queue_id = %body.queue_id, "postsuper delete (stub)");
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "mail_queue.delete".to_owned(),
            resource_type: Some("mail_queue".to_owned()),
            resource_id: None,
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "queue_id": body.queue_id }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}
