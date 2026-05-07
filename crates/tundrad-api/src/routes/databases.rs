use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{AuditActor, NewAuditEntry, NewDatabase, NewDatabaseServer, NewDbUser};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DatabaseServerDto {
    pub id: String,
    pub server_id: String,
    pub engine: String,
    pub version: String,
    pub port: i32,
    pub bind_address: String,
    pub superuser: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DatabaseDto {
    pub id: String,
    pub database_server_id: String,
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
    pub size_bytes: Option<i64>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DbUserDto {
    pub id: String,
    pub database_server_id: String,
    pub username: String,
    pub is_managed: bool,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct CreateDbUserResponse {
    pub user: DbUserDto,
    pub password: String,
}

#[derive(Serialize)]
pub struct ConnectionStringDto {
    pub connection_string: String,
}

#[derive(Deserialize)]
pub struct CreateDatabaseServerRequest {
    pub server_id: String,
    pub engine: String,
    pub version: String,
    pub port: i32,
    pub superuser: String,
    pub superuser_password: String,
}

#[derive(Deserialize)]
pub struct CreateDatabaseRequest {
    pub database_server_id: String,
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateDbUserRequest {
    pub database_server_id: String,
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct GrantRequest {
    pub database_id: String,
    pub privileges: Vec<String>,
}

#[derive(Deserialize)]
pub struct RevokeRequest {
    pub database_id: String,
}

#[derive(Deserialize)]
pub struct ServerIdQuery {
    pub server_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct DbServerIdQuery {
    pub database_server_id: Option<Uuid>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_db_server_dto(s: tundrad_domain::DatabaseServer) -> DatabaseServerDto {
    DatabaseServerDto {
        id: s.id.to_string(),
        server_id: s.server_id.to_string(),
        engine: s.engine.as_str().to_owned(),
        version: s.version,
        port: s.port,
        bind_address: s.bind_address,
        superuser: s.superuser,
        status: s.status.as_str().to_owned(),
        created_at: s.created_at.to_string(),
    }
}

fn to_db_dto(d: tundrad_domain::Database) -> DatabaseDto {
    DatabaseDto {
        id: d.id.to_string(),
        database_server_id: d.database_server_id.to_string(),
        name: d.name,
        charset: d.charset,
        collation: d.collation,
        size_bytes: d.size_bytes,
        created_at: d.created_at.to_string(),
    }
}

fn to_db_user_dto(u: tundrad_domain::DbUser) -> DbUserDto {
    DbUserDto {
        id: u.id.to_string(),
        database_server_id: u.database_server_id.to_string(),
        username: u.username,
        is_managed: u.is_managed,
        created_at: u.created_at.to_string(),
    }
}

// ── Database Servers ──────────────────────────────────────────────────────────

pub async fn list_database_servers(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(q): Query<ServerIdQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::DatabaseServer)
        .map_err(ApiError::from)?;
    let servers = tundrad_repo::DatabaseServerRepo::new(&pool)
        .list(q.server_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = servers.into_iter().map(to_db_server_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_database_server(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::DatabaseServer)
        .map_err(ApiError::from)?;
    let server = tundrad_repo::DatabaseServerRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_db_server_dto(server)))
}

pub async fn create_database_server(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateDatabaseServerRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::DatabaseServer)
        .map_err(ApiError::from)?;

    let server_id: Uuid = body
        .server_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid server_id"))?;
    let engine = body
        .engine
        .parse()
        .map_err(|_| ApiError::bad_request("unknown engine"))?;

    let db_server = tundrad_repo::DatabaseServerRepo::new(&pool)
        .create(NewDatabaseServer {
            server_id,
            engine,
            version: body.version,
            port: body.port,
            superuser: body.superuser,
            superuser_password: body.superuser_password,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "database_server.create".to_owned(),
            resource_type: Some("database_server".to_owned()),
            resource_id: Some(db_server.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "engine": db_server.engine.as_str() }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_db_server_dto(db_server))))
}

pub async fn delete_database_server(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::DatabaseServer)
        .map_err(ApiError::from)?;
    tundrad_repo::DatabaseServerRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "database_server.delete".to_owned(),
            resource_type: Some("database_server".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Databases ─────────────────────────────────────────────────────────────────

pub async fn list_databases_by_site(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Database)
        .map_err(ApiError::from)?;
    let dbs = tundrad_repo::DatabaseRepo::new(&pool)
        .list_by_site(site_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = dbs.into_iter().map(to_db_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn list_databases(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(q): Query<DbServerIdQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Database)
        .map_err(ApiError::from)?;
    let dbs = tundrad_repo::DatabaseRepo::new(&pool)
        .list(q.database_server_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = dbs.into_iter().map(to_db_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_database(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Database)
        .map_err(ApiError::from)?;
    let db = tundrad_repo::DatabaseRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_db_dto(db)))
}

pub async fn create_database(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateDatabaseRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::Database)
        .map_err(ApiError::from)?;

    let database_server_id: Uuid = body
        .database_server_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid database_server_id"))?;

    let db = tundrad_repo::DatabaseRepo::new(&pool)
        .create(NewDatabase {
            database_server_id,
            name: body.name,
            charset: body.charset,
            collation: body.collation,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "database.create".to_owned(),
            resource_type: Some("database".to_owned()),
            resource_id: Some(db.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "name": db.name }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_db_dto(db))))
}

pub async fn delete_database(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::Database)
        .map_err(ApiError::from)?;
    tundrad_repo::DatabaseRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "database.delete".to_owned(),
            resource_type: Some("database".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── DB Users ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DbServerQuery {
    pub database_server_id: Uuid,
}

pub async fn list_db_users(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(q): Query<DbServerQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::DbUser)
        .map_err(ApiError::from)?;
    let users = tundrad_repo::DbUserRepo::new(&pool)
        .list(q.database_server_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = users.into_iter().map(to_db_user_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_db_user(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateDbUserRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::DbUser)
        .map_err(ApiError::from)?;

    let database_server_id: Uuid = body
        .database_server_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid database_server_id"))?;

    let (user, password) = tundrad_repo::DbUserRepo::new(&pool)
        .create(NewDbUser {
            database_server_id,
            username: body.username,
            password: body.password,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "db_user.create".to_owned(),
            resource_type: Some("db_user".to_owned()),
            resource_id: Some(user.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "username": user.username }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(CreateDbUserResponse {
            user: to_db_user_dto(user),
            password,
        }),
    ))
}

pub async fn delete_db_user(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::DbUser)
        .map_err(ApiError::from)?;
    tundrad_repo::DbUserRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "db_user.delete".to_owned(),
            resource_type: Some("db_user".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn grant_privileges(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(user_id): Path<Uuid>,
    Json(body): Json<GrantRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::DbUser)
        .map_err(ApiError::from)?;
    let database_id: Uuid = body
        .database_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid database_id"))?;
    let grant = tundrad_repo::DbUserRepo::new(&pool)
        .set_grant(user_id, database_id, body.privileges)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "db_user.grant".to_owned(),
            resource_type: Some("db_user".to_owned()),
            resource_id: Some(user_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "database_id": database_id, "privileges": grant.privileges }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        serde_json::json!({ "db_user_id": user_id, "database_id": database_id, "privileges": grant.privileges }),
    ))
}

pub async fn revoke_privileges(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(user_id): Path<Uuid>,
    Json(body): Json<RevokeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::DbUser)
        .map_err(ApiError::from)?;
    let database_id: Uuid = body
        .database_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid database_id"))?;
    tundrad_repo::DbUserRepo::new(&pool)
        .revoke_grant(user_id, database_id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "db_user.revoke".to_owned(),
            resource_type: Some("db_user".to_owned()),
            resource_id: Some(user_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "database_id": database_id }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_connection_string(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(user_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::DbUser)
        .map_err(ApiError::from)?;
    // Step-up required — connection strings expose plaintext credentials.
    AuthzService
        .require_step_up(&session)
        .map_err(ApiError::from)?;

    let user = tundrad_repo::DbUserRepo::new(&pool)
        .find_by_id(user_id)
        .await
        .map_err(ApiError::from)?;
    let password = tundrad_repo::DbUserRepo::new(&pool)
        .get_decrypted_password(user_id)
        .await
        .map_err(ApiError::from)?;
    let db_server = tundrad_repo::DatabaseServerRepo::new(&pool)
        .find_by_id(user.database_server_id)
        .await
        .map_err(ApiError::from)?;

    let scheme = match db_server.engine {
        tundrad_domain::DbEngine::Postgresql => "postgres",
        tundrad_domain::DbEngine::Mysql | tundrad_domain::DbEngine::Mariadb => "mysql",
        tundrad_domain::DbEngine::Valkey => "redis",
    };
    let connection_string = format!(
        "{}://{}:{}@{}:{}/",
        scheme, user.username, password, db_server.bind_address, db_server.port
    );

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "database.connection_string.viewed".to_owned(),
            resource_type: Some("db_user".to_owned()),
            resource_id: Some(user_id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(ConnectionStringDto { connection_string }))
}
