//! Session lifecycle: authenticate, refresh, revoke, lookup.

use rand::RngCore;
use time::OffsetDateTime;
use tundrad_domain::{AuditActor, NewAuditEntry, NewSession, Session};
use tundrad_repo::{AuditLogRepo, OperatorRepo, PgPool, RepoError, SessionRepo};
use uuid::Uuid;

use crate::AuthError;

/// Session duration: 30 days.
const SESSION_TTL_DAYS: i64 = 30;

/// Byte length of a raw refresh token.
const REFRESH_TOKEN_BYTES: usize = 32;

pub struct SessionService<'a> {
    sessions: SessionRepo<'a>,
    operators: OperatorRepo<'a>,
    audit: AuditLogRepo<'a>,
}

impl<'a> SessionService<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self {
            sessions: SessionRepo::new(pool),
            operators: OperatorRepo::new(pool),
            audit: AuditLogRepo::new(pool),
        }
    }

    /// Authenticate an operator with email + password.
    ///
    /// Steps:
    /// 1. Look up operator by email.
    /// 2. Verify Argon2id password hash.
    /// 3. Confirm operator is active.
    /// 4. Create a 30-day session with a random refresh token.
    /// 5. Write an audit entry.
    ///
    /// Any authentication failure returns [`AuthError::InvalidCredentials`] —
    /// the exact reason is never revealed to the caller.
    pub async fn authenticate_password(
        &self,
        email: &str,
        password: &str,
        user_agent: Option<String>,
        ip: Option<String>,
    ) -> Result<(Session, Vec<u8>), AuthError> {
        // 1. Find operator — map NotFound to InvalidCredentials.
        let operator = self
            .operators
            .find_by_email(email)
            .await
            .map_err(|e| match e {
                RepoError::NotFound => AuthError::InvalidCredentials,
                other => AuthError::Repo(other),
            })?;

        // 2. Verify password (constant-time; also returns false if hash is None).
        let hash = operator
            .password_hash
            .as_deref()
            .ok_or(AuthError::InvalidCredentials)?;

        let valid = tundrad_crypto::verify_password(password, hash).map_err(AuthError::Crypto)?;
        if !valid {
            return Err(AuthError::InvalidCredentials);
        }

        // 3. Confirm account is active.
        if !operator.is_active {
            return Err(AuthError::InvalidCredentials);
        }

        // 4. Create session. Mark mfa_pending when the operator has TOTP enrolled so the
        //    second factor must be verified before protected routes are accessible.
        let raw_token = generate_refresh_token();
        let expires_at = OffsetDateTime::now_utc() + time::Duration::days(SESSION_TTL_DAYS);

        let session = self
            .sessions
            .create(NewSession {
                operator_id: operator.id,
                refresh_token: raw_token.clone(),
                user_agent: user_agent.clone(),
                ip: ip.clone(),
                expires_at,
                mfa_pending: operator.has_totp,
            })
            .await
            .map_err(AuthError::Repo)?;

        // 5. Record login timestamp (best-effort; don't fail auth on error).
        let _ = self
            .operators
            .record_login(operator.id, ip.as_deref())
            .await;

        // 6. Audit entry.
        let _ = self
            .audit
            .append(NewAuditEntry {
                actor: AuditActor::Operator(operator.id),
                action: "operator.login".to_owned(),
                resource_type: Some("operator".to_owned()),
                resource_id: Some(operator.id),
                ip,
                user_agent,
                details: serde_json::json!({ "method": "password" }),
            })
            .await;

        Ok((session, raw_token))
    }

    /// Refresh a session using its raw refresh token.
    ///
    /// Extends the expiry by another 30 days and returns the updated session.
    pub async fn refresh(&self, raw_token: &[u8]) -> Result<Session, AuthError> {
        let session = self
            .sessions
            .find_by_token(raw_token)
            .await
            .map_err(|e| match e {
                RepoError::NotFound => AuthError::SessionNotFound,
                other => AuthError::Repo(other),
            })?;

        // find_by_token already filters out revoked + expired rows, but be explicit.
        if session.revoked_at.is_some() {
            return Err(AuthError::SessionRevoked);
        }
        if session.expires_at < OffsetDateTime::now_utc() {
            return Err(AuthError::SessionExpired);
        }

        let new_expires = OffsetDateTime::now_utc() + time::Duration::days(SESSION_TTL_DAYS);
        self.sessions
            .touch(session.id, new_expires)
            .await
            .map_err(AuthError::Repo)?;

        // Return the session with the updated expiry reflected.
        self.sessions
            .find_by_token(raw_token)
            .await
            .map_err(|e| match e {
                RepoError::NotFound => AuthError::SessionNotFound,
                other => AuthError::Repo(other),
            })
    }

    /// Revoke a session by ID.
    pub async fn revoke(&self, session_id: Uuid, reason: &str) -> Result<(), AuthError> {
        self.sessions
            .revoke(session_id, reason)
            .await
            .map_err(|e| match e {
                RepoError::NotFound => AuthError::SessionNotFound,
                other => AuthError::Repo(other),
            })
    }

    /// Look up a session by raw token and validate it is active and unexpired.
    pub async fn get_active(&self, raw_token: &[u8]) -> Result<Session, AuthError> {
        let session = self
            .sessions
            .find_by_token(raw_token)
            .await
            .map_err(|e| match e {
                RepoError::NotFound => AuthError::SessionNotFound,
                other => AuthError::Repo(other),
            })?;

        if session.revoked_at.is_some() {
            return Err(AuthError::SessionRevoked);
        }
        if session.expires_at < OffsetDateTime::now_utc() {
            return Err(AuthError::SessionExpired);
        }

        Ok(session)
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn generate_refresh_token() -> Vec<u8> {
    let mut bytes = vec![0u8; REFRESH_TOKEN_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}
