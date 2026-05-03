use time::OffsetDateTime;
use uuid::Uuid;

/// Active session. Stored in DB; identified by hashed refresh token.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: Uuid,
    pub operator_id: Uuid,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub created_at: OffsetDateTime,
    pub last_seen_at: OffsetDateTime,
    pub last_full_auth_at: OffsetDateTime,
    pub expires_at: OffsetDateTime,
    pub revoked_at: Option<OffsetDateTime>,
}

/// Data required to create a new session.
pub struct NewSession {
    pub operator_id: Uuid,
    /// Raw (unhashed) refresh token — caller holds this, repo stores only the hash.
    pub refresh_token: Vec<u8>,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub expires_at: OffsetDateTime,
}
