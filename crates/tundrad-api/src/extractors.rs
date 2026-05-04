use axum::{
    extract::FromRequestParts,
    http::{StatusCode, header, request::Parts},
};

use crate::error::ApiError;
use tundrad_domain::session::Session;
use tundrad_repo::{PgPool, SessionRepo};

/// Axum extractor: resolves the current session from the `tundra_session` cookie.
///
/// Returns 403 `auth.mfa_required` when the session has `mfa_pending = true`
/// (password was verified but TOTP has not been confirmed yet).
pub struct AuthSession(pub Session);

impl FromRequestParts<PgPool> for AuthSession {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, pool: &PgPool) -> Result<Self, Self::Rejection> {
        let raw_token = extract_session_token(parts).ok_or_else(ApiError::unauthorized)?;
        let repo = SessionRepo::new(pool);
        let session = repo
            .find_by_token(&raw_token)
            .await
            .map_err(|_| ApiError::unauthorized())?;

        if session.revoked_at.is_some() {
            return Err(ApiError::unauthorized());
        }
        let now = time::OffsetDateTime::now_utc();
        if session.expires_at < now {
            return Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "SESSION_EXPIRED",
                "session has expired",
            ));
        }

        // Block access until the second factor is confirmed.
        if session.mfa_pending {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "auth.mfa_required",
                "multi-factor authentication is required to complete sign-in",
            ));
        }

        Ok(AuthSession(session))
    }
}

/// Axum extractor that accepts sessions that still have `mfa_pending = true`.
///
/// Used exclusively by the TOTP-verify and passkey-verify handlers so they can
/// receive the session cookie before MFA is completed.
pub struct MfaPendingSession(pub Session);

impl FromRequestParts<PgPool> for MfaPendingSession {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, pool: &PgPool) -> Result<Self, Self::Rejection> {
        let raw_token = extract_session_token(parts).ok_or_else(ApiError::unauthorized)?;
        let repo = SessionRepo::new(pool);
        let session = repo
            .find_by_token(&raw_token)
            .await
            .map_err(|_| ApiError::unauthorized())?;

        if session.revoked_at.is_some() {
            return Err(ApiError::unauthorized());
        }
        let now = time::OffsetDateTime::now_utc();
        if session.expires_at < now {
            return Err(ApiError::new(
                StatusCode::UNAUTHORIZED,
                "SESSION_EXPIRED",
                "session has expired",
            ));
        }

        Ok(MfaPendingSession(session))
    }
}

pub fn extract_session_token(parts: &Parts) -> Option<Vec<u8>> {
    let cookies = parts.headers.get(header::COOKIE)?.to_str().ok()?;
    for pair in cookies.split(';') {
        let pair = pair.trim();
        if let Some(val) = pair.strip_prefix("tundra_session=") {
            return Some(val.as_bytes().to_vec());
        }
    }
    None
}
