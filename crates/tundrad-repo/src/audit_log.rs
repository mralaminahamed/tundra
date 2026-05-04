use crate::{PgPool, RepoError};
use tundrad_domain::audit_log::{AuditEntry, NewAuditEntry};
use uuid::Uuid;

pub struct AuditLogRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> AuditLogRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Append one entry. The `chain_hash` column is populated by a DB trigger.
    pub async fn append(&self, entry: NewAuditEntry) -> Result<Uuid, RepoError> {
        let actor_type = entry.actor.actor_type();
        let actor_id = entry.actor.actor_id();
        let row: (Uuid,) = sqlx::query_as(
            "INSERT INTO audit_log \
               (actor_type, actor_id, action, resource_type, resource_id, \
                ip, user_agent, details) \
             VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8) \
             RETURNING id",
        )
        .bind(actor_type)
        .bind(actor_id)
        .bind(&entry.action)
        .bind(&entry.resource_type)
        .bind(entry.resource_id)
        .bind(&entry.ip)
        .bind(&entry.user_agent)
        .bind(&entry.details)
        .fetch_one(self.pool)
        .await?;
        Ok(row.0)
    }

    pub async fn list(
        &self,
        limit: i64,
        cursor: Option<Uuid>,
    ) -> Result<Vec<AuditEntry>, RepoError> {
        #[derive(sqlx::FromRow)]
        struct Row {
            id: Uuid,
            occurred_at: time::OffsetDateTime,
            actor_type: String,
            actor_id: Option<Uuid>,
            action: String,
            resource_type: Option<String>,
            resource_id: Option<Uuid>,
            ip: Option<String>,
            user_agent: Option<String>,
            details: serde_json::Value,
        }

        let rows: Vec<Row> = if let Some(after_id) = cursor {
            sqlx::query_as(
                "SELECT id, occurred_at, actor_type, actor_id, action, \
                        resource_type, resource_id, ip::text as ip, user_agent, details \
                 FROM   audit_log \
                 WHERE  occurred_at < (SELECT occurred_at FROM audit_log WHERE id = $2) \
                 ORDER  BY occurred_at DESC, id DESC \
                 LIMIT  $1",
            )
            .bind(limit)
            .bind(after_id)
            .fetch_all(self.pool)
            .await?
        } else {
            sqlx::query_as(
                "SELECT id, occurred_at, actor_type, actor_id, action, \
                        resource_type, resource_id, ip::text as ip, user_agent, details \
                 FROM   audit_log \
                 ORDER  BY occurred_at DESC, id DESC \
                 LIMIT  $1",
            )
            .bind(limit)
            .fetch_all(self.pool)
            .await?
        };

        Ok(rows
            .into_iter()
            .map(|r| AuditEntry {
                id: r.id,
                occurred_at: r.occurred_at,
                actor_type: r.actor_type,
                actor_id: r.actor_id,
                action: r.action,
                resource_type: r.resource_type,
                resource_id: r.resource_id,
                ip: r.ip,
                user_agent: r.user_agent,
                details: r.details,
            })
            .collect())
    }
}
