use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use uuid::Uuid;

/// Every error returned by a handler serialises to this envelope.
/// `{"error":{"code":"…","message":"…","request_id":"…","details":{}}}`
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
    request_id: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            request_id: format!("req_{}", Uuid::now_v7().simple()),
        }
    }

    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "BAD_REQUEST", msg)
    }

    pub fn unauthorized() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "authentication required",
        )
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "FORBIDDEN", msg)
    }

    pub fn not_found(resource: &'static str) -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            format!("{resource} not found"),
        )
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, "CONFLICT", msg)
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_SERVER_ERROR",
            "an internal error occurred",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = json!({
            "error": {
                "code": self.code,
                "message": self.message,
                "request_id": self.request_id,
                "details": {}
            }
        });
        (self.status, Json(body)).into_response()
    }
}

impl From<tundrad_auth::AuthError> for ApiError {
    fn from(e: tundrad_auth::AuthError) -> Self {
        use tundrad_auth::AuthError;
        match e {
            AuthError::InvalidCredentials => Self::new(
                StatusCode::UNAUTHORIZED,
                "INVALID_CREDENTIALS",
                "invalid credentials",
            ),
            AuthError::SessionNotFound | AuthError::SessionExpired | AuthError::SessionRevoked => {
                Self::unauthorized()
            }
            AuthError::StepUpRequired => Self::new(
                StatusCode::UNAUTHORIZED,
                "STEP_UP_REQUIRED",
                "step-up authentication required",
            ),
            AuthError::Forbidden(msg) => Self::forbidden(msg),
            AuthError::TokenRevoked | AuthError::TokenExpired => Self::new(
                StatusCode::UNAUTHORIZED,
                "TOKEN_INVALID",
                "token is invalid or expired",
            ),
            AuthError::HibpUnavailable => {
                tracing::warn!("HIBP check unavailable — continuing");
                Self::internal()
            }
            err => {
                tracing::error!(?err, "unhandled auth error");
                Self::internal()
            }
        }
    }
}

impl From<tundrad_repo::RepoError> for ApiError {
    fn from(e: tundrad_repo::RepoError) -> Self {
        use tundrad_repo::RepoError;
        match e {
            RepoError::NotFound => Self::not_found("resource"),
            RepoError::Conflict(msg) => Self::conflict(msg),
            err => {
                tracing::error!(?err, "database error");
                Self::internal()
            }
        }
    }
}
