use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{AuditActor, DnsManagedBy, NewAuditEntry, NewDnsRecord, NewDomain, UpdateDomain};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DomainDto {
    pub id: String,
    pub site_id: Option<String>,
    pub site_name: Option<String>,
    pub apex: String,
    pub dns_managed_by: String,
    pub registration_expires_at: Option<String>,
    pub auto_renew: bool,
    pub ns_locked: bool,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateDomainRequest {
    pub apex: String,
    pub dns_managed_by: Option<String>,
    pub auto_renew: Option<bool>,
    pub notes: Option<String>,
    pub registration_expires_at: Option<String>,
}

#[derive(Deserialize)]
pub struct PatchDomainRequest {
    pub dns_managed_by: Option<String>,
    pub auto_renew: Option<bool>,
    pub notes: Option<serde_json::Value>,   // null = clear, string = set
    pub registration_expires_at: Option<serde_json::Value>, // null = clear, string = set
}

#[derive(Serialize)]
pub struct DnsRecordDto {
    pub id: String,
    pub domain_id: String,
    pub name: String,
    pub record_type: String,
    pub ttl: i32,
    pub priority: Option<i32>,
    pub content: String,
    pub is_managed: bool,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateDnsRecordRequest {
    pub name: String,
    pub record_type: String,
    pub ttl: Option<i32>,
    pub priority: Option<i32>,
    pub content: String,
}

#[derive(Deserialize)]
pub struct UpdateDnsRecordRequest {
    pub ttl: Option<i32>,
    pub priority: Option<i32>,
    pub content: String,
}

#[derive(Deserialize)]
pub struct BatchUpdateRequest {
    pub records: Vec<CreateDnsRecordRequest>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_domain_dto(d: tundrad_domain::Domain) -> DomainDto {
    DomainDto {
        id: d.id.to_string(),
        site_id: d.site_id.map(|u| u.to_string()),
        site_name: d.site_name,
        apex: d.apex,
        dns_managed_by: d.dns_managed_by.as_str().to_owned(),
        registration_expires_at: d.registration_expires_at.map(|t| t.to_string()),
        auto_renew: d.auto_renew,
        ns_locked: d.ns_locked,
        notes: d.notes,
        created_at: d.created_at.to_string(),
    }
}

fn to_record_dto(r: tundrad_domain::DnsRecord) -> DnsRecordDto {
    DnsRecordDto {
        id: r.id.to_string(),
        domain_id: r.domain_id.to_string(),
        name: r.name,
        record_type: r.record_type,
        ttl: r.ttl,
        priority: r.priority,
        content: r.content,
        is_managed: r.is_managed,
        created_at: r.created_at.to_string(),
    }
}

// ── Domain handlers ───────────────────────────────────────────────────────────

pub async fn list_domains(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Domain)
        .map_err(ApiError::from)?;
    let domains = tundrad_repo::DomainRepo::new(&pool)
        .list()
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = domains.into_iter().map(to_domain_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Domain)
        .map_err(ApiError::from)?;
    let domain = tundrad_repo::DomainRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_domain_dto(domain)))
}

pub async fn create_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateDomainRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::Domain)
        .map_err(ApiError::from)?;

    let dns_managed_by = body
        .dns_managed_by
        .as_deref()
        .unwrap_or("tundra")
        .parse::<DnsManagedBy>()
        .map_err(|_| ApiError::bad_request("invalid dns_managed_by"))?;

    let expires = body.registration_expires_at
        .as_deref()
        .map(|s| time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
            .map_err(|_| ApiError::bad_request("invalid registration_expires_at")))
        .transpose()?;

    let domain = tundrad_repo::DomainRepo::new(&pool)
        .create(NewDomain {
            site_id: None,
            apex: body.apex,
            dns_managed_by,
            registration_expires_at: expires,
            auto_renew: body.auto_renew.unwrap_or(true),
            notes: body.notes,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "domain.create".to_owned(),
            resource_type: Some("domain".to_owned()),
            resource_id: Some(domain.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "apex": domain.apex }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_domain_dto(domain))))
}

pub async fn delete_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::Domain)
        .map_err(ApiError::from)?;
    tundrad_repo::DomainRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "domain.delete".to_owned(),
            resource_type: Some("domain".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_domain_by_apex(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(apex): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService.require(&op.role, Action::Read, Resource::Domain).map_err(ApiError::from)?;
    let domain = tundrad_repo::DomainRepo::new(&pool)
        .find_by_apex(&apex)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_domain_dto(domain)))
}

pub async fn patch_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    Json(body): Json<PatchDomainRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::Domain)
        .map_err(ApiError::from)?;

    let dns_managed_by = body.dns_managed_by
        .as_deref()
        .map(|s| s.parse::<DnsManagedBy>().map_err(|_| ApiError::bad_request("invalid dns_managed_by")))
        .transpose()?;

    let registration_expires_at = match &body.registration_expires_at {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(s)) => {
            let t = time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
                .map_err(|_| ApiError::bad_request("invalid registration_expires_at"))?;
            Some(Some(t))
        }
        _ => return Err(ApiError::bad_request("registration_expires_at must be null or a date string")),
    };

    let notes = match &body.notes {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(s)) => Some(Some(s.clone())),
        _ => return Err(ApiError::bad_request("notes must be null or a string")),
    };

    let domain = tundrad_repo::DomainRepo::new(&pool)
        .update(id, UpdateDomain { dns_managed_by, registration_expires_at, auto_renew: body.auto_renew, notes })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "domain.update".to_owned(),
            resource_type: Some("domain".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({}),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_domain_dto(domain)))
}

// ── Site-scoped domain handlers ───────────────────────────────────────────────

pub async fn list_site_domains(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService.require(&op.role, Action::Read, Resource::Domain).map_err(ApiError::from)?;
    let domains = tundrad_repo::DomainRepo::new(&pool)
        .list_by_site(site_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = domains.into_iter().map(to_domain_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_site_domain(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
    Json(body): Json<CreateDomainRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService.require(&op.role, Action::Create, Resource::Domain).map_err(ApiError::from)?;

    let dns_managed_by = body.dns_managed_by.as_deref().unwrap_or("tundra")
        .parse::<DnsManagedBy>()
        .map_err(|_| ApiError::bad_request("invalid dns_managed_by"))?;

    let domain = tundrad_repo::DomainRepo::new(&pool)
        .create(NewDomain {
            site_id: Some(site_id),
            apex: body.apex,
            dns_managed_by,
            registration_expires_at: None,
            auto_renew: body.auto_renew.unwrap_or(true),
            notes: body.notes,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "domain.create".to_owned(),
            resource_type: Some("domain".to_owned()),
            resource_id: Some(domain.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "apex": domain.apex, "site_id": site_id }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_domain_dto(domain))))
}

// ── DNS record handlers ───────────────────────────────────────────────────────

pub async fn list_dns_records(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(domain_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::DnsRecord)
        .map_err(ApiError::from)?;
    let records = tundrad_repo::DnsRecordRepo::new(&pool)
        .list(domain_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = records.into_iter().map(to_record_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_dns_record(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(domain_id): Path<Uuid>,
    Json(body): Json<CreateDnsRecordRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::DnsRecord)
        .map_err(ApiError::from)?;

    let record = tundrad_repo::DnsRecordRepo::new(&pool)
        .create(NewDnsRecord {
            domain_id,
            name: body.name,
            record_type: body.record_type,
            ttl: body.ttl.unwrap_or(300),
            priority: body.priority,
            content: body.content,
            is_managed: false,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "dns_record.create".to_owned(),
            resource_type: Some("dns_record".to_owned()),
            resource_id: Some(record.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "domain_id": domain_id, "type": record.record_type }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_record_dto(record))))
}

pub async fn update_dns_record(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path((domain_id, record_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateDnsRecordRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::DnsRecord)
        .map_err(ApiError::from)?;

    let record = tundrad_repo::DnsRecordRepo::new(&pool)
        .update(
            record_id,
            body.ttl.unwrap_or(300),
            body.priority,
            &body.content,
        )
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "dns_record.update".to_owned(),
            resource_type: Some("dns_record".to_owned()),
            resource_id: Some(record_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "domain_id": domain_id }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_record_dto(record)))
}

pub async fn delete_dns_record(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path((domain_id, record_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::DnsRecord)
        .map_err(ApiError::from)?;
    tundrad_repo::DnsRecordRepo::new(&pool)
        .delete(record_id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "dns_record.delete".to_owned(),
            resource_type: Some("dns_record".to_owned()),
            resource_id: Some(record_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "domain_id": domain_id }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn batch_update_dns_records(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(domain_id): Path<Uuid>,
    Json(body): Json<BatchUpdateRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::DnsRecord)
        .map_err(ApiError::from)?;

    let new_records: Vec<NewDnsRecord> = body
        .records
        .into_iter()
        .map(|r| NewDnsRecord {
            domain_id,
            name: r.name,
            record_type: r.record_type,
            ttl: r.ttl.unwrap_or(300),
            priority: r.priority,
            content: r.content,
            is_managed: false,
        })
        .collect();

    let count = new_records.len();
    tundrad_repo::DnsRecordRepo::new(&pool)
        .batch_replace(domain_id, new_records)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "dns_records.batch_update".to_owned(),
            resource_type: Some("domain".to_owned()),
            resource_id: Some(domain_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "record_count": count }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({ "updated": count })))
}
