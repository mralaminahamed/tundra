use crate::{PgPool, RepoError};
use tundrad_crypto::EncryptedDkimPrivateKey;
use tundrad_domain::mail::{
    Alias, DkimKey, MailDomain, MailQueueEntry, Mailbox, NewAlias, NewDkimKey, NewMailDomain,
    NewMailbox,
};
use uuid::Uuid;

// ── MailDomain ────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct MailDomainRow {
    id: Uuid,
    domain: String,
    spf_policy: String,
    dmarc_policy: String,
    mx_host: String,
    active: bool,
    webmail_enabled: bool,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<MailDomainRow> for MailDomain {
    fn from(r: MailDomainRow) -> Self {
        MailDomain {
            id: r.id,
            domain: r.domain,
            spf_policy: r.spf_policy,
            dmarc_policy: r.dmarc_policy,
            mx_host: r.mx_host,
            active: r.active,
            webmail_enabled: r.webmail_enabled,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const MAIL_DOMAIN_COLS: &str = "id, domain, spf_policy, dmarc_policy, mx_host, active, webmail_enabled, \
     created_at, updated_at";

pub struct MailDomainRepo<'a>(pub &'a PgPool);

impl<'a> MailDomainRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self) -> Result<Vec<MailDomain>, RepoError> {
        sqlx::query_as::<_, MailDomainRow>(&format!(
            "SELECT {MAIL_DOMAIN_COLS} FROM mail_domains WHERE active = true ORDER BY created_at DESC"
        ))
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(MailDomain::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<MailDomain, RepoError> {
        sqlx::query_as::<_, MailDomainRow>(&format!(
            "SELECT {MAIL_DOMAIN_COLS} FROM mail_domains WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or(RepoError::NotFound)
        .map(MailDomain::from)
    }

    pub async fn create(&self, new: NewMailDomain) -> Result<MailDomain, RepoError> {
        let spf = new
            .spf_policy
            .unwrap_or_else(|| "v=spf1 mx ~all".to_owned());
        let dmarc = new
            .dmarc_policy
            .unwrap_or_else(|| format!("v=DMARC1; p=none; rua=mailto:postmaster@{}", new.domain));
        sqlx::query_as::<_, MailDomainRow>(&format!(
            "INSERT INTO mail_domains (domain, spf_policy, dmarc_policy, mx_host) \
             VALUES ($1, $2, $3, $4) RETURNING {MAIL_DOMAIN_COLS}"
        ))
        .bind(&new.domain)
        .bind(&spf)
        .bind(&dmarc)
        .bind(&new.mx_host)
        .fetch_one(self.0)
        .await
        .map(MailDomain::from)
        .map_err(RepoError::from)
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM mail_domains WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }
}

// ── DkimKey ───────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DkimKeyRow {
    id: Uuid,
    mail_domain_id: Uuid,
    selector: String,
    algorithm: String,
    public_key_pem: String,
    is_active: bool,
    created_at: time::OffsetDateTime,
}

impl From<DkimKeyRow> for DkimKey {
    fn from(r: DkimKeyRow) -> Self {
        DkimKey {
            id: r.id,
            mail_domain_id: r.mail_domain_id,
            selector: r.selector,
            algorithm: r.algorithm,
            public_key_pem: r.public_key_pem,
            is_active: r.is_active,
            created_at: r.created_at,
        }
    }
}

pub struct DkimKeyRepo<'a>(pub &'a PgPool);

impl<'a> DkimKeyRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn active_for_domain(
        &self,
        mail_domain_id: Uuid,
    ) -> Result<Option<DkimKey>, RepoError> {
        sqlx::query_as::<_, DkimKeyRow>(
            "SELECT id, mail_domain_id, selector, algorithm, public_key_pem, is_active, created_at \
             FROM dkim_keys WHERE mail_domain_id = $1 AND is_active = true \
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(mail_domain_id)
        .fetch_optional(self.0)
        .await
        .map(|opt| opt.map(DkimKey::from))
        .map_err(RepoError::from)
    }

    pub async fn create(&self, new: NewDkimKey) -> Result<DkimKey, RepoError> {
        let enc_pk = EncryptedDkimPrivateKey::new(new.private_key_pem);
        sqlx::query_as::<_, DkimKeyRow>(
            "INSERT INTO dkim_keys \
             (mail_domain_id, selector, algorithm, public_key_pem, private_key_encrypted) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING id, mail_domain_id, selector, algorithm, public_key_pem, is_active, created_at",
        )
        .bind(new.mail_domain_id)
        .bind(&new.selector)
        .bind(&new.algorithm)
        .bind(&new.public_key_pem)
        .bind(enc_pk)
        .fetch_one(self.0)
        .await
        .map(DkimKey::from)
        .map_err(RepoError::from)
    }

    /// Deactivate all existing keys for domain then insert new one (rotate).
    pub async fn rotate(
        &self,
        mail_domain_id: Uuid,
        new: NewDkimKey,
    ) -> Result<DkimKey, RepoError> {
        sqlx::query(
            "UPDATE dkim_keys SET is_active = false WHERE mail_domain_id = $1 AND is_active = true",
        )
        .bind(mail_domain_id)
        .execute(self.0)
        .await?;
        self.create(new).await
    }

    /// Return the plaintext private key PEM for a given key (for Rspamd deploy).
    pub async fn get_private_key_pem(&self, id: Uuid) -> Result<String, RepoError> {
        #[derive(sqlx::FromRow)]
        struct PkRow {
            private_key_encrypted: EncryptedDkimPrivateKey,
        }
        let row =
            sqlx::query_as::<_, PkRow>("SELECT private_key_encrypted FROM dkim_keys WHERE id = $1")
                .bind(id)
                .fetch_optional(self.0)
                .await?
                .ok_or(RepoError::NotFound)?;
        Ok(row.private_key_encrypted.into_inner())
    }
}

// ── Mailbox ───────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct MailboxRow {
    id: Uuid,
    mail_domain_id: Uuid,
    local_part: String,
    password_scheme: String,
    quota_bytes: i64,
    used_bytes: i64,
    is_active: bool,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<MailboxRow> for Mailbox {
    fn from(r: MailboxRow) -> Self {
        Mailbox {
            id: r.id,
            mail_domain_id: r.mail_domain_id,
            local_part: r.local_part,
            password_scheme: r.password_scheme,
            quota_bytes: r.quota_bytes,
            used_bytes: r.used_bytes,
            is_active: r.is_active,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const MAILBOX_COLS: &str = "id, mail_domain_id, local_part, password_scheme, quota_bytes, used_bytes, \
     is_active, created_at, updated_at";

pub struct MailboxRepo<'a>(pub &'a PgPool);

impl<'a> MailboxRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, mail_domain_id: Uuid) -> Result<Vec<Mailbox>, RepoError> {
        sqlx::query_as::<_, MailboxRow>(&format!(
            "SELECT {MAILBOX_COLS} FROM mailboxes \
             WHERE mail_domain_id = $1 AND is_active = true ORDER BY local_part"
        ))
        .bind(mail_domain_id)
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(Mailbox::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Mailbox, RepoError> {
        sqlx::query_as::<_, MailboxRow>(&format!(
            "SELECT {MAILBOX_COLS} FROM mailboxes WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or(RepoError::NotFound)
        .map(Mailbox::from)
    }

    pub async fn create(&self, new: NewMailbox) -> Result<Mailbox, RepoError> {
        let hash = tundrad_crypto::hash_password(&new.password).map_err(RepoError::Crypto)?;
        let quota = new.quota_bytes.unwrap_or(1_073_741_824);
        sqlx::query_as::<_, MailboxRow>(&format!(
            "INSERT INTO mailboxes (mail_domain_id, local_part, password_hash, quota_bytes) \
             VALUES ($1, $2, $3, $4) RETURNING {MAILBOX_COLS}"
        ))
        .bind(new.mail_domain_id)
        .bind(&new.local_part)
        .bind(&hash)
        .bind(quota)
        .fetch_one(self.0)
        .await
        .map(Mailbox::from)
        .map_err(RepoError::from)
    }

    pub async fn reset_password(&self, id: Uuid, new_password: &str) -> Result<(), RepoError> {
        let hash = tundrad_crypto::hash_password(new_password).map_err(RepoError::Crypto)?;
        sqlx::query("UPDATE mailboxes SET password_hash = $1 WHERE id = $2")
            .bind(&hash)
            .bind(id)
            .execute(self.0)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query(
            "UPDATE mailboxes SET is_active = false WHERE id = $1 AND is_active = true",
        )
        .bind(id)
        .execute(self.0)
        .await?
        .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }
}

// ── Alias ─────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct AliasRow {
    id: Uuid,
    mail_domain_id: Uuid,
    source: String,
    destinations: Vec<String>,
    is_active: bool,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<AliasRow> for Alias {
    fn from(r: AliasRow) -> Self {
        Alias {
            id: r.id,
            mail_domain_id: r.mail_domain_id,
            source: r.source,
            destinations: r.destinations,
            is_active: r.is_active,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const ALIAS_COLS: &str =
    "id, mail_domain_id, source, destinations, is_active, created_at, updated_at";

pub struct AliasRepo<'a>(pub &'a PgPool);

impl<'a> AliasRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, mail_domain_id: Uuid) -> Result<Vec<Alias>, RepoError> {
        sqlx::query_as::<_, AliasRow>(&format!(
            "SELECT {ALIAS_COLS} FROM aliases WHERE mail_domain_id = $1 ORDER BY source"
        ))
        .bind(mail_domain_id)
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(Alias::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn create(&self, new: NewAlias) -> Result<Alias, RepoError> {
        sqlx::query_as::<_, AliasRow>(&format!(
            "INSERT INTO aliases (mail_domain_id, source, destinations) \
             VALUES ($1, $2, $3) RETURNING {ALIAS_COLS}"
        ))
        .bind(new.mail_domain_id)
        .bind(&new.source)
        .bind(&new.destinations)
        .fetch_one(self.0)
        .await
        .map(Alias::from)
        .map_err(RepoError::from)
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        sqlx::query("DELETE FROM aliases WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?;
        Ok(())
    }
}

// ── MailQueue ─────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct MailQueueRow {
    id: Uuid,
    queue_id: String,
    queue_name: String,
    sender: String,
    recipients: Vec<String>,
    subject: Option<String>,
    size_bytes: i64,
    arrival_time: time::OffsetDateTime,
    reason: Option<String>,
}

impl From<MailQueueRow> for MailQueueEntry {
    fn from(r: MailQueueRow) -> Self {
        MailQueueEntry {
            id: r.id,
            queue_id: r.queue_id,
            queue_name: r.queue_name,
            sender: r.sender,
            recipients: r.recipients,
            subject: r.subject,
            size_bytes: r.size_bytes,
            arrival_time: r.arrival_time,
            reason: r.reason,
        }
    }
}

pub struct MailQueueRepo<'a>(pub &'a PgPool);

impl<'a> MailQueueRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self) -> Result<Vec<MailQueueEntry>, RepoError> {
        sqlx::query_as::<_, MailQueueRow>(
            "SELECT id, queue_id, queue_name, sender, recipients, subject, size_bytes, \
             arrival_time, reason FROM mail_queue ORDER BY arrival_time DESC LIMIT 500",
        )
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(MailQueueEntry::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_queue_id(&self, queue_id: &str) -> Result<MailQueueEntry, RepoError> {
        sqlx::query_as::<_, MailQueueRow>(
            "SELECT id, queue_id, queue_name, sender, recipients, subject, size_bytes, \
             arrival_time, reason FROM mail_queue WHERE queue_id = $1",
        )
        .bind(queue_id)
        .fetch_optional(self.0)
        .await?
        .ok_or(RepoError::NotFound)
        .map(MailQueueEntry::from)
    }
}
