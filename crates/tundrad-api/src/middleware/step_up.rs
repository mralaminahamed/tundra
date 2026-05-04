use axum::http::HeaderValue;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

/// Step-up authentication window: 5 minutes, matching the security spec.
const STEP_UP_WINDOW_MINUTES: i64 = 5;

/// Build a `401 Unauthorized` response that signals the panel UI to re-prompt
/// for credentials without discarding the current form state.
///
/// The `WWW-Authenticate: TundraStepUp` header is the agreed-upon sentinel
/// value understood by the React panel's global error interceptor.
pub fn require_step_up() -> Response {
    let mut response = StatusCode::UNAUTHORIZED.into_response();
    response.headers_mut().insert(
        "WWW-Authenticate",
        HeaderValue::from_static("TundraStepUp realm=\"Tundra Panel\""),
    );
    response
}

/// Verify that the session's last full authentication falls within the step-up
/// window (default: 5 minutes).
///
/// Returns `Ok(())` when the session is fresh enough, or
/// `Err(Response)` containing a `401 TundraStepUp` response when step-up is
/// required.
///
/// # Usage in handlers
///
/// ```ignore
/// async fn delete_server(session: AuthSession, ...) -> impl IntoResponse {
///     check_step_up(session.last_full_auth_at)?;
///     // ... proceed with destructive operation
/// }
/// ```
pub fn check_step_up(last_full_auth_at: Option<time::OffsetDateTime>) -> Result<(), Response> {
    let threshold =
        time::OffsetDateTime::now_utc() - time::Duration::minutes(STEP_UP_WINDOW_MINUTES);
    match last_full_auth_at {
        Some(t) if t > threshold => Ok(()),
        _ => Err(require_step_up()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_auth_passes_step_up() {
        // A timestamp 1 minute ago should be within the 5-minute window.
        let recent = time::OffsetDateTime::now_utc() - time::Duration::minutes(1);
        assert!(check_step_up(Some(recent)).is_ok());
    }

    #[test]
    fn stale_auth_fails_step_up() {
        // A timestamp 10 minutes ago should fail.
        let stale = time::OffsetDateTime::now_utc() - time::Duration::minutes(10);
        assert!(check_step_up(Some(stale)).is_err());
    }

    #[test]
    fn missing_auth_fails_step_up() {
        assert!(check_step_up(None).is_err());
    }

    #[test]
    fn step_up_response_has_www_authenticate_header() {
        let resp = require_step_up();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        let header = resp.headers().get("WWW-Authenticate").unwrap();
        assert!(header.to_str().unwrap().starts_with("TundraStepUp"));
    }
}
