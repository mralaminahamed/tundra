use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperatorRole {
    Owner,
    Admin,
    Operator,
    Readonly,
}

impl OperatorRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Admin => "admin",
            Self::Operator => "operator",
            Self::Readonly => "readonly",
        }
    }
}

impl std::str::FromStr for OperatorRole {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "owner" => Ok(Self::Owner),
            "admin" => Ok(Self::Admin),
            "operator" => Ok(Self::Operator),
            "readonly" => Ok(Self::Readonly),
            other => Err(format!("unknown role: {other}")),
        }
    }
}

/// Domain representation of a panel operator (user).
#[derive(Debug, Clone)]
pub struct Operator {
    pub id: Uuid,
    pub public_id: String,
    pub email: String,
    pub email_verified_at: Option<OffsetDateTime>,
    pub full_name: String,
    pub role: OperatorRole,
    /// Argon2id PHC hash string. None if the operator uses passkeys only.
    pub password_hash: Option<String>,
    /// True if TOTP is enrolled (secret stored encrypted in DB).
    pub has_totp: bool,
    pub is_active: bool,
    pub last_login_at: Option<OffsetDateTime>,
    pub preferred_locale: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub deleted_at: Option<OffsetDateTime>,
}

/// Data required to create a new operator.
pub struct NewOperator {
    pub email: String,
    pub full_name: String,
    pub role: OperatorRole,
    /// Pre-hashed with Argon2id. None for passkey-only operators.
    pub password_hash: Option<String>,
}
