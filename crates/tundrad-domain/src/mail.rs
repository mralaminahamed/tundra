use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailDomain {
    pub id: Uuid,
    pub domain: String,
    pub spf_policy: String,
    pub dmarc_policy: String,
    pub mx_host: String,
    pub active: bool,
    pub webmail_enabled: bool,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewMailDomain {
    pub domain: String,
    pub mx_host: String,
    pub spf_policy: Option<String>,
    pub dmarc_policy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DkimKey {
    pub id: Uuid,
    pub mail_domain_id: Uuid,
    pub selector: String,
    pub algorithm: String,
    pub public_key_pem: String,
    pub is_active: bool,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDkimKey {
    pub mail_domain_id: Uuid,
    pub selector: String,
    pub algorithm: String,
    pub public_key_pem: String,
    pub private_key_pem: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mailbox {
    pub id: Uuid,
    pub mail_domain_id: Uuid,
    pub local_part: String,
    pub password_scheme: String,
    pub quota_bytes: i64,
    pub used_bytes: i64,
    pub is_active: bool,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewMailbox {
    pub mail_domain_id: Uuid,
    pub local_part: String,
    pub password: String,
    pub quota_bytes: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alias {
    pub id: Uuid,
    pub mail_domain_id: Uuid,
    pub source: String,
    pub destinations: Vec<String>,
    pub is_active: bool,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewAlias {
    pub mail_domain_id: Uuid,
    pub source: String,
    pub destinations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailQueueEntry {
    pub id: Uuid,
    pub queue_id: String,
    pub queue_name: String,
    pub sender: String,
    pub recipients: Vec<String>,
    pub subject: Option<String>,
    pub size_bytes: i64,
    pub arrival_time: OffsetDateTime,
    pub reason: Option<String>,
}
