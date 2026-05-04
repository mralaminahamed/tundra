use crate::{PgPool, RepoError};
use sha2::{Digest, Sha256};
use tundrad_domain::session::{NewSession, Session};
use uuid::Uuid;

fn hash_token(raw: &[u8]) -> Vec<u8> {
    Sha256::digest(raw).to_vec()
}

#[derive(sqlx::FromRow)]
struct SessionRow {
    id: Uuid,
    operator_id: Uuid,
    user_agent: Option<String>,
    ip: Option<String>,
    created_at: time::OffsetDateTime,
    last_seen_at: time::OffsetDateTime,
    last_full_auth_at: time::OffsetDateTime,
    expires_at: time::OffsetDateTime,
    revoked_at: Option<time::OffsetDateTime>,
}

impl From<SessionRow> for Session {
    fn from(r: SessionRow) -> Self {
        Session {
            id: r.id,
            operator_id: r.operator_id,
            user_agent: r.user_agent,
            ip: r.ip,
            created_at: r.created_at,
            last_seen_at: r.last_seen_at,
            last_full_auth_at: r.last_full_auth_at,
            expires_at: r.expires_at,
            revoked_at: r.revoked_at,
        }
    }
}

const SELECT_COLS: &str = "id, operator_id, user_agent, ip::text as ip, created_at, last_seen_at, \
     last_full_auth_at, expires_at, revoked_at";

pub struct SessionRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> SessionRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, new: NewSession) -> Result<Session, RepoError> {
        let token_hash = hash_token(&new.refresh_token);
        let sql = format!(
            "INSERT INTO sessions \
               (operator_id, refresh_token_hash, user_agent, ip, expires_at) \
             VALUES ($1, $2, $3, $4::inet, $5) \
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, SessionRow>(&sql)
            .bind(new.operator_id)
            .bind(token_hash)
            .bind(new.user_agent)
            .bind(new.ip)
            .bind(new.expires_at)
            .fetch_one(self.pool)
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn find_by_token(&self, raw_token: &[u8]) -> Result<Session, RepoError> {
        let token_hash = hash_token(raw_token);
        let sql = format!(
            "SELECT {SELECT_COLS} FROM sessions \
             WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()"
        );
        sqlx::query_as::<_, SessionRow>(&sql)
            .bind(token_hash)
            .fetch_optional(self.pool)
            .await?
            .ok_or(RepoError::NotFound)
            .map(Into::into)
    }

    pub async fn touch(
        &self,
        id: Uuid,
        new_expires_at: time::OffsetDateTime,
    ) -> Result<(), RepoError> {
        sqlx::query("UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1")
            .bind(id)
            .bind(new_expires_at)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn record_full_auth(&self, id: Uuid) -> Result<(), RepoError> {
        sqlx::query("UPDATE sessions SET last_full_auth_at = now() WHERE id = $1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn revoke(&self, id: Uuid, reason: &str) -> Result<(), RepoError> {
        let n = sqlx::query(
            "UPDATE sessions SET revoked_at = now(), revoke_reason = $2 \
             WHERE id = $1 AND revoked_at IS NULL",
        )
        .bind(id)
        .bind(reason)
        .execute(self.pool)
        .await?
        .rows_affected();
        if n == 0 {
            Err(RepoError::NotFound)
        } else {
            Ok(())
        }
    }

    pub async fn revoke_all_for_operator(
        &self,
        operator_id: Uuid,
        reason: &str,
    ) -> Result<u64, RepoError> {
        let n = sqlx::query(
            "UPDATE sessions SET revoked_at = now(), revoke_reason = $2 \
             WHERE operator_id = $1 AND revoked_at IS NULL",
        )
        .bind(operator_id)
        .bind(reason)
        .execute(self.pool)
        .await?
        .rows_affected();
        Ok(n)
    }
}
