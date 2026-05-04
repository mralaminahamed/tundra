use crate::{PgPool, RepoError};
use tundrad_domain::server::{NewServer, Server, ServerStatus};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct ServerRow {
    id: Uuid,
    name: String,
    hostname: String,
    region: Option<String>,
    public_ip: Option<String>,
    os: String,
    os_version: String,
    arch: String,
    agent_version: Option<String>,
    status: String,
    agent_last_seen_at: Option<time::OffsetDateTime>,
    capabilities: serde_json::Value,
    resources_total: serde_json::Value,
    agent_cert_fingerprint: Option<String>,
    notes: Option<String>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
    deleted_at: Option<time::OffsetDateTime>,
}

impl TryFrom<ServerRow> for Server {
    type Error = RepoError;
    fn try_from(r: ServerRow) -> Result<Self, Self::Error> {
        let status: ServerStatus = r.status.parse().map_err(RepoError::Conflict)?;
        Ok(Server {
            id: r.id,
            name: r.name,
            hostname: r.hostname,
            region: r.region,
            public_ip: r.public_ip,
            os: r.os,
            os_version: r.os_version,
            arch: r.arch,
            agent_version: r.agent_version,
            status,
            agent_last_seen_at: r.agent_last_seen_at,
            capabilities: r.capabilities,
            resources_total: r.resources_total,
            agent_cert_fingerprint: r.agent_cert_fingerprint,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
        })
    }
}

const SELECT_COLS: &str = "id, name, hostname, region, public_ip::text as public_ip, \
    os, os_version, arch, agent_version, status, agent_last_seen_at, capabilities, \
    resources_total, agent_cert_fingerprint, notes, created_at, updated_at, deleted_at";

pub struct ServerRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> ServerRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Server, RepoError> {
        let sql = format!("SELECT {SELECT_COLS} FROM servers WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, ServerRow>(&sql)
            .bind(id)
            .fetch_optional(self.pool)
            .await?
            .ok_or(RepoError::NotFound)?
            .try_into()
    }

    pub async fn list(&self, limit: i64) -> Result<Vec<Server>, RepoError> {
        let sql = format!(
            "SELECT {SELECT_COLS} FROM servers WHERE deleted_at IS NULL \
             ORDER BY created_at DESC LIMIT $1"
        );
        sqlx::query_as::<_, ServerRow>(&sql)
            .bind(limit)
            .fetch_all(self.pool)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    pub async fn create(
        &self,
        new: NewServer,
        setup_token_hash: &[u8],
        setup_token_expires_at: time::OffsetDateTime,
    ) -> Result<Server, RepoError> {
        let sql = format!(
            "INSERT INTO servers (name, hostname, region, os, setup_token_hash, setup_token_expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, ServerRow>(&sql)
            .bind(new.name)
            .bind(new.hostname)
            .bind(new.region)
            .bind(new.os)
            .bind(setup_token_hash)
            .bind(setup_token_expires_at)
            .fetch_one(self.pool)
            .await?
            .try_into()
    }

    /// Called by the agent enrolment gRPC to exchange setup token for cert.
    /// Returns the server if the token hash matches and hasn't expired.
    pub async fn find_by_setup_token(&self, token_hash: &[u8]) -> Result<Server, RepoError> {
        let sql = format!(
            "SELECT {SELECT_COLS} FROM servers \
             WHERE setup_token_hash = $1 \
               AND setup_token_expires_at > now() \
               AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, ServerRow>(&sql)
            .bind(token_hash)
            .fetch_optional(self.pool)
            .await?
            .ok_or(RepoError::NotFound)?
            .try_into()
    }

    /// Consume the setup token and record the issued cert fingerprint.
    pub async fn complete_enrolment(
        &self,
        server_id: Uuid,
        cert_fingerprint: &str,
    ) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE servers SET \
               status = 'provisioning', \
               agent_cert_fingerprint = $2, \
               setup_token_hash = NULL, \
               setup_token_expires_at = NULL \
             WHERE id = $1",
        )
        .bind(server_id)
        .bind(cert_fingerprint)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_heartbeat(
        &self,
        server_id: Uuid,
        agent_version: &str,
        cert_fingerprint: &str,
    ) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE servers SET \
               status = 'active', \
               agent_last_seen_at = now(), \
               agent_version = $2, \
               agent_cert_fingerprint = $3 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(server_id)
        .bind(agent_version)
        .bind(cert_fingerprint)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn soft_delete(&self, id: Uuid) -> Result<(), RepoError> {
        let n = sqlx::query(
            "UPDATE servers SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(self.pool)
        .await?
        .rows_affected();
        if n == 0 {
            Err(RepoError::NotFound)
        } else {
            Ok(())
        }
    }

    pub async fn update_metadata(
        &self,
        id: Uuid,
        name: Option<&str>,
        region: Option<Option<&str>>,
        notes: Option<Option<&str>>,
    ) -> Result<(), RepoError> {
        let n = sqlx::query(
            "UPDATE servers SET \
               name   = COALESCE($2, name), \
               region = CASE WHEN $3 THEN $4 ELSE region END, \
               notes  = CASE WHEN $5 THEN $6 ELSE notes  END \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(name)
        .bind(region.is_some())
        .bind(region.flatten())
        .bind(notes.is_some())
        .bind(notes.flatten())
        .execute(self.pool)
        .await?
        .rows_affected();
        if n == 0 {
            Err(RepoError::NotFound)
        } else {
            Ok(())
        }
    }

    /// Update the maintenance window columns.  Pass `None` to clear a field.
    pub async fn update_maintenance(
        &self,
        id: Uuid,
        starts_at: Option<time::OffsetDateTime>,
        ends_at: Option<time::OffsetDateTime>,
    ) -> Result<(), RepoError> {
        let n = sqlx::query(
            "UPDATE servers SET \
               maintenance_starts_at = $2, \
               maintenance_ends_at   = $3 \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(starts_at)
        .bind(ends_at)
        .execute(self.pool)
        .await?
        .rows_affected();
        if n == 0 {
            Err(RepoError::NotFound)
        } else {
            Ok(())
        }
    }
}

// ── AgentCredentialsRepo ──────────────────────────────────────────────────────

pub struct AgentCredentialsRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> AgentCredentialsRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn suspend_agent(&self, server_id: Uuid, reason: &str) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE agent_credentials \
             SET suspended_at = now(), suspend_reason = $1 \
             WHERE server_id = $2 AND revoked_at IS NULL AND suspended_at IS NULL",
        )
        .bind(reason)
        .bind(server_id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn reinstate_agent(&self, server_id: Uuid) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE agent_credentials \
             SET suspended_at = NULL, suspend_reason = NULL \
             WHERE server_id = $1 AND revoked_at IS NULL",
        )
        .bind(server_id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn is_suspended(&self, server_id: Uuid) -> Result<bool, RepoError> {
        let row = sqlx::query_as::<_, (bool,)>(
            "SELECT EXISTS(\
               SELECT 1 FROM agent_credentials \
               WHERE server_id = $1 \
                 AND revoked_at IS NULL \
                 AND suspended_at IS NOT NULL\
             )",
        )
        .bind(server_id)
        .fetch_one(self.pool)
        .await?;
        Ok(row.0)
    }
}
