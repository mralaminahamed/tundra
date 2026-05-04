use crate::{PgPool, RepoError};
use tundrad_domain::operator::{NewOperator, Operator, OperatorRole};
use uuid::Uuid;

/// Raw DB row — mirrors the `operators` table exactly.
#[derive(sqlx::FromRow)]
struct OperatorRow {
    id: Uuid,
    public_id: String,
    email: String,
    email_verified_at: Option<time::OffsetDateTime>,
    full_name: String,
    role: String,
    password_hash: Option<String>,
    totp_secret_encrypted: Option<Vec<u8>>,
    is_active: bool,
    last_login_at: Option<time::OffsetDateTime>,
    preferred_locale: String,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
    deleted_at: Option<time::OffsetDateTime>,
}

impl TryFrom<OperatorRow> for Operator {
    type Error = RepoError;

    fn try_from(r: OperatorRow) -> Result<Self, Self::Error> {
        let role: OperatorRole = r.role.parse().map_err(RepoError::Conflict)?;
        Ok(Operator {
            id: r.id,
            public_id: r.public_id,
            email: r.email,
            email_verified_at: r.email_verified_at,
            full_name: r.full_name,
            role,
            password_hash: r.password_hash,
            has_totp: r.totp_secret_encrypted.is_some(),
            is_active: r.is_active,
            last_login_at: r.last_login_at,
            preferred_locale: r.preferred_locale,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
        })
    }
}

/// Generate an 8-char crockford-base32 public_id.
fn gen_public_id() -> String {
    const ALPHABET: &[u8] = b"0123456789abcdefghjkmnpqrstvwxyz";
    let id = Uuid::now_v7();
    let bytes = &id.as_bytes()[10..]; // 6 bytes of random suffix
    let val = u64::from_be_bytes([
        0, 0, bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
    ]) & 0xFF_FFFF_FFFF; // 40 bits → 8 base32 chars
    let mut out = [b'0'; 8];
    let mut v = val;
    for i in (0..8).rev() {
        out[i] = ALPHABET[(v & 0x1F) as usize];
        v >>= 5;
    }
    String::from_utf8_lossy(&out).into_owned()
}

const SELECT_COLS: &str = "id, public_id, email, email_verified_at, \
    full_name, role, password_hash, totp_secret_encrypted, \
    is_active, last_login_at, preferred_locale, \
    created_at, updated_at, deleted_at";

pub struct OperatorRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> OperatorRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Operator, RepoError> {
        let sql =
            format!("SELECT {SELECT_COLS} FROM operators WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, OperatorRow>(&sql)
            .bind(id)
            .fetch_optional(self.pool)
            .await?
            .ok_or(RepoError::NotFound)?
            .try_into()
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Operator, RepoError> {
        let sql =
            format!("SELECT {SELECT_COLS} FROM operators WHERE email = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, OperatorRow>(&sql)
            .bind(email)
            .fetch_optional(self.pool)
            .await?
            .ok_or(RepoError::NotFound)?
            .try_into()
    }

    pub async fn create(&self, new: NewOperator) -> Result<Operator, RepoError> {
        let public_id = gen_public_id();
        let role = new.role.as_str();
        let sql = format!(
            "INSERT INTO operators (public_id, email, full_name, role, password_hash) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {SELECT_COLS}"
        );
        sqlx::query_as::<_, OperatorRow>(&sql)
            .bind(public_id)
            .bind(new.email)
            .bind(new.full_name)
            .bind(role)
            .bind(new.password_hash)
            .fetch_one(self.pool)
            .await?
            .try_into()
    }

    pub async fn record_login(&self, id: Uuid, ip: Option<&str>) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE operators SET last_login_at = now(), last_login_ip = $2::inet WHERE id = $1",
        )
        .bind(id)
        .bind(ip)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn set_totp_secret(&self, id: Uuid, encrypted: &[u8]) -> Result<(), RepoError> {
        sqlx::query("UPDATE operators SET totp_secret_encrypted = $2 WHERE id = $1")
            .bind(id)
            .bind(encrypted)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_totp_secret_encrypted(&self, id: Uuid) -> Result<Option<Vec<u8>>, RepoError> {
        let row: Option<(Option<Vec<u8>>,)> = sqlx::query_as(
            "SELECT totp_secret_encrypted FROM operators WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;

        row.map(|(v,)| v).ok_or(RepoError::NotFound)
    }

    pub async fn set_recovery_codes(&self, id: Uuid, encrypted: &[u8]) -> Result<(), RepoError> {
        sqlx::query("UPDATE operators SET recovery_codes_encrypted = $2 WHERE id = $1")
            .bind(id)
            .bind(encrypted)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn clear_totp_secret(&self, id: Uuid) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE operators SET totp_secret_encrypted = NULL, \
             recovery_codes_encrypted = NULL WHERE id = $1",
        )
        .bind(id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn soft_delete(&self, id: Uuid) -> Result<(), RepoError> {
        let n = sqlx::query(
            "UPDATE operators SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
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
}
