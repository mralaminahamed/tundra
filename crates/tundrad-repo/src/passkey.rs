use crate::{PgPool, RepoError};
use time::OffsetDateTime;
use uuid::Uuid;

/// A stored WebAuthn passkey credential (public key only — never private).
#[derive(Debug, Clone)]
pub struct Passkey {
    pub id: Uuid,
    pub operator_id: Uuid,
    pub credential_id: Vec<u8>,
    pub public_key: Vec<u8>,
    pub signature_count: i64,
    pub aaguid: Option<Uuid>,
    pub device_label: Option<String>,
    pub last_used_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

/// Parameters for registering a new passkey.
pub struct NewPasskey {
    pub operator_id: Uuid,
    pub credential_id: Vec<u8>,
    pub public_key: Vec<u8>,
    pub aaguid: Option<Uuid>,
    pub device_label: Option<String>,
}

#[derive(sqlx::FromRow)]
struct PasskeyRow {
    id: Uuid,
    operator_id: Uuid,
    credential_id: Vec<u8>,
    public_key: Vec<u8>,
    signature_count: i64,
    aaguid: Option<Uuid>,
    device_label: Option<String>,
    last_used_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
}

impl From<PasskeyRow> for Passkey {
    fn from(r: PasskeyRow) -> Self {
        Passkey {
            id: r.id,
            operator_id: r.operator_id,
            credential_id: r.credential_id,
            public_key: r.public_key,
            signature_count: r.signature_count,
            aaguid: r.aaguid,
            device_label: r.device_label,
            last_used_at: r.last_used_at,
            created_at: r.created_at,
        }
    }
}

const SELECT_COLS: &str = "id, operator_id, credential_id, public_key, signature_count, aaguid, \
     device_label, last_used_at, created_at";

pub struct PasskeyRepo<'a>(pub &'a PgPool);

impl<'a> PasskeyRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    /// Insert a new passkey credential row.
    pub async fn create(&self, new: NewPasskey) -> Result<Passkey, RepoError> {
        let sql = format!(
            "INSERT INTO passkeys \
               (operator_id, credential_id, public_key, aaguid, device_label) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, PasskeyRow>(&sql)
            .bind(new.operator_id)
            .bind(&new.credential_id)
            .bind(&new.public_key)
            .bind(new.aaguid)
            .bind(new.device_label)
            .fetch_one(self.0)
            .await
            .map(Into::into)
            .map_err(|e| {
                if let sqlx::Error::Database(ref db) = e
                    && db.constraint() == Some("passkeys_credential_id_unique")
                {
                    return RepoError::Conflict("credential_id already registered".to_owned());
                }
                e.into()
            })
    }

    /// Look up a passkey by its raw credential_id bytes.
    pub async fn find_by_credential_id(&self, cred_id: &[u8]) -> Result<Passkey, RepoError> {
        let sql = format!("SELECT {SELECT_COLS} FROM passkeys WHERE credential_id = $1");
        sqlx::query_as::<_, PasskeyRow>(&sql)
            .bind(cred_id)
            .fetch_optional(self.0)
            .await?
            .ok_or(RepoError::NotFound)
            .map(Into::into)
    }

    /// List all passkeys belonging to an operator (for display; public_key omitted at handler level).
    pub async fn list_by_operator(&self, operator_id: Uuid) -> Result<Vec<Passkey>, RepoError> {
        let sql = format!(
            "SELECT {SELECT_COLS} FROM passkeys WHERE operator_id = $1 ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, PasskeyRow>(&sql)
            .bind(operator_id)
            .fetch_all(self.0)
            .await
            .map(|rows| rows.into_iter().map(Into::into).collect())
            .map_err(Into::into)
    }

    /// Delete a passkey by id, scoped to the given operator (prevents cross-user deletion).
    pub async fn delete(&self, id: Uuid, operator_id: Uuid) -> Result<(), RepoError> {
        let n = sqlx::query("DELETE FROM passkeys WHERE id = $1 AND operator_id = $2")
            .bind(id)
            .bind(operator_id)
            .execute(self.0)
            .await?
            .rows_affected();
        if n == 0 {
            Err(RepoError::NotFound)
        } else {
            Ok(())
        }
    }

    /// Increment the signature counter and update last_used_at after a successful assertion.
    pub async fn increment_sign_count(&self, id: Uuid) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE passkeys SET signature_count = signature_count + 1, last_used_at = now() \
             WHERE id = $1",
        )
        .bind(id)
        .execute(self.0)
        .await?;
        Ok(())
    }
}

/// Repository for short-lived passkey challenges stored in the DB.
pub struct PasskeyChallengeRepo<'a>(pub &'a PgPool);

impl<'a> PasskeyChallengeRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    /// Persist a new challenge; returns the generated UUID.
    pub async fn create(
        &self,
        challenge: &[u8],
        operator_id: Option<Uuid>,
    ) -> Result<Uuid, RepoError> {
        let row: (Uuid,) = sqlx::query_as(
            "INSERT INTO passkey_challenges (challenge, operator_id) \
             VALUES ($1, $2) \
             RETURNING id",
        )
        .bind(challenge)
        .bind(operator_id)
        .fetch_one(self.0)
        .await?;
        Ok(row.0)
    }

    /// Fetch a challenge by id and verify it hasn't expired.
    /// Deletes the row so it can't be replayed.
    pub async fn consume(&self, id: Uuid) -> Result<(Vec<u8>, Option<Uuid>), RepoError> {
        let row: Option<(Vec<u8>, Option<Uuid>)> = sqlx::query_as(
            "DELETE FROM passkey_challenges \
             WHERE id = $1 AND expires_at > now() \
             RETURNING challenge, operator_id",
        )
        .bind(id)
        .fetch_optional(self.0)
        .await?;
        row.ok_or(RepoError::NotFound)
    }
}
