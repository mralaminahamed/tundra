use crate::{PgPool, RepoError};
use time::OffsetDateTime;
use uuid::Uuid;

// ── Row type ─────────────────────────────────────────────────────────────────

/// A row from the `certificates` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CertificateRow {
    pub id: Uuid,
    pub site_id: Option<Uuid>,
    pub common_name: String,
    pub san: Vec<String>,
    pub issuer: String,
    pub cert_pem: String,
    pub chain_pem: String,
    /// The private key bytes stored in the DB.
    ///
    /// **TODO**: migrate to `EncryptedField<String, CertKeyFamily>` once the crypto
    /// key-family is wired into `tundrad-crypto`.  For now the raw PEM bytes are stored
    /// in this `bytea` column.  Do **not** rely on this being encrypted in the current
    /// implementation.
    pub key_encrypted: Vec<u8>,
    pub not_before: Option<OffsetDateTime>,
    pub not_after: Option<OffsetDateTime>,
    pub auto_renew: bool,
    pub last_renewed_at: Option<OffsetDateTime>,
    pub status: String,
    /// Stored as `"{token}:{key_authorization}"` so a single column can be split
    /// to serve the HTTP-01 challenge endpoint without an extra lookup field.
    pub challenge_token: Option<String>,
    pub acme_order_url: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

// ── Input types ───────────────────────────────────────────────────────────────

/// Input for creating a new pending certificate row.
pub struct NewCertificate<'a> {
    pub site_id: Uuid,
    pub common_name: &'a str,
    pub san: Vec<String>,
}

// ── Repo ─────────────────────────────────────────────────────────────────────

pub struct CertificateRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> CertificateRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Find the most-recently created certificate for a site.
    pub async fn find_by_site(
        &self,
        site_id: Uuid,
    ) -> Result<Option<CertificateRow>, RepoError> {
        sqlx::query_as::<_, CertificateRow>(
            "SELECT id, site_id, common_name, san, issuer, cert_pem, chain_pem, \
                    key_encrypted, not_before, not_after, auto_renew, last_renewed_at, \
                    status, challenge_token, acme_order_url, created_at, updated_at \
             FROM certificates \
             WHERE site_id = $1 \
             ORDER BY created_at DESC \
             LIMIT 1",
        )
        .bind(site_id)
        .fetch_optional(self.pool)
        .await
        .map_err(RepoError::from)
    }

    /// Find a specific certificate by its primary key.
    pub async fn find_by_id(&self, id: Uuid) -> Result<CertificateRow, RepoError> {
        sqlx::query_as::<_, CertificateRow>(
            "SELECT id, site_id, common_name, san, issuer, cert_pem, chain_pem, \
                    key_encrypted, not_before, not_after, auto_renew, last_renewed_at, \
                    status, challenge_token, acme_order_url, created_at, updated_at \
             FROM certificates \
             WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?
        .ok_or(RepoError::NotFound)
    }

    /// Insert a new certificate row with `status = 'pending'` and empty key bytes.
    pub async fn create(
        &self,
        new: NewCertificate<'_>,
    ) -> Result<CertificateRow, RepoError> {
        sqlx::query_as::<_, CertificateRow>(
            "INSERT INTO certificates \
               (site_id, common_name, san, key_encrypted, issuer, status) \
             VALUES ($1, $2, $3, '\\x'::bytea, 'letsencrypt', 'pending') \
             RETURNING id, site_id, common_name, san, issuer, cert_pem, chain_pem, \
                       key_encrypted, not_before, not_after, auto_renew, last_renewed_at, \
                       status, challenge_token, acme_order_url, created_at, updated_at",
        )
        .bind(new.site_id)
        .bind(new.common_name)
        .bind(&new.san)
        .fetch_one(self.pool)
        .await
        .map_err(RepoError::from)
    }

    /// Persist the HTTP-01 challenge token + key-authorization.
    ///
    /// Stores `"{token}:{key_auth}"` in `challenge_token` and the ACME order URL.
    pub async fn update_challenge(
        &self,
        id: Uuid,
        token: &str,
        key_auth: &str,
        acme_order_url: &str,
    ) -> Result<(), RepoError> {
        let combined = format!("{token}:{key_auth}");
        sqlx::query(
            "UPDATE certificates \
             SET challenge_token = $2, acme_order_url = $3 \
             WHERE id = $1",
        )
        .bind(id)
        .bind(&combined)
        .bind(acme_order_url)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Store the issued certificate, chain, and private key; set `status = 'active'`.
    ///
    /// `key_pem_bytes` should be the raw PEM bytes of the private key.
    /// **TODO**: encrypt with `EncryptedField<String, CertKeyFamily>` before storing.
    pub async fn update_certificate(
        &self,
        id: Uuid,
        cert_pem: &str,
        chain_pem: &str,
        key_pem_bytes: &[u8],
        not_before: OffsetDateTime,
        not_after: OffsetDateTime,
    ) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE certificates \
             SET cert_pem       = $2, \
                 chain_pem      = $3, \
                 key_encrypted  = $4, \
                 not_before     = $5, \
                 not_after      = $6, \
                 status         = 'active', \
                 last_renewed_at = now() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(cert_pem)
        .bind(chain_pem)
        .bind(key_pem_bytes)
        .bind(not_before)
        .bind(not_after)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Update only the `status` column (e.g. `'failed'`, `'revoked'`).
    pub async fn update_status(&self, id: Uuid, status: &str) -> Result<(), RepoError> {
        sqlx::query("UPDATE certificates SET status = $2 WHERE id = $1")
            .bind(id)
            .bind(status)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    /// Look up the key-authorization for an HTTP-01 challenge by its token.
    ///
    /// `challenge_token` is stored as `"{token}:{key_auth}"`.  This method splits on the
    /// first `:` and returns the key-authorization portion.
    pub async fn find_key_auth_by_token(
        &self,
        token: &str,
    ) -> Result<Option<String>, RepoError> {
        // The stored value is "{token}:{key_auth}" — we query with a LIKE prefix match
        // to avoid a seq-scan on the text column.
        let prefix = format!("{token}:%");
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT challenge_token \
             FROM certificates \
             WHERE challenge_token LIKE $1 \
             LIMIT 1",
        )
        .bind(&prefix)
        .fetch_optional(self.pool)
        .await?;

        Ok(row.and_then(|(combined,)| {
            combined
                .splitn(2, ':')
                .nth(1)
                .map(str::to_owned)
        }))
    }
}
