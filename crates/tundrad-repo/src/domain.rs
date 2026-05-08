use crate::{PgPool, RepoError};
use tundrad_domain::domain::{DnsRecord, Domain, NewDnsRecord, NewDomain, UpdateDomain};
use uuid::Uuid;

// ── Domain ────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DomainRow {
    id: Uuid,
    site_id: Option<Uuid>,
    site_name: Option<String>,
    apex: String,
    dns_managed_by: String,
    registration_expires_at: Option<time::OffsetDateTime>,
    auto_renew: bool,
    ns_locked: bool,
    notes: Option<String>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl TryFrom<DomainRow> for Domain {
    type Error = RepoError;
    fn try_from(r: DomainRow) -> Result<Self, Self::Error> {
        Ok(Domain {
            id: r.id,
            site_id: r.site_id,
            site_name: r.site_name,
            apex: r.apex,
            dns_managed_by: r.dns_managed_by.parse().map_err(RepoError::Conflict)?,
            registration_expires_at: r.registration_expires_at,
            auto_renew: r.auto_renew,
            ns_locked: r.ns_locked,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

const DOMAIN_COLS: &str = "d.id, d.site_id, s.name AS site_name, d.apex, d.dns_managed_by, \
    d.registration_expires_at, d.auto_renew, d.ns_locked, d.notes, d.created_at, d.updated_at";

const DOMAIN_JOIN: &str = "domains d LEFT JOIN sites s ON s.id = d.site_id";

// ── DnsRecord ─────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DnsRecordRow {
    id: Uuid,
    domain_id: Uuid,
    name: String,
    record_type: String,
    ttl: i32,
    priority: Option<i32>,
    content: String,
    is_managed: bool,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<DnsRecordRow> for DnsRecord {
    fn from(r: DnsRecordRow) -> Self {
        DnsRecord {
            id: r.id,
            domain_id: r.domain_id,
            name: r.name,
            record_type: r.record_type,
            ttl: r.ttl,
            priority: r.priority,
            content: r.content,
            is_managed: r.is_managed,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const DNS_RECORD_COLS: &str = "id, domain_id, name, type AS record_type, ttl, \
    priority, content, is_managed, created_at, updated_at";

// ── DomainRepo ────────────────────────────────────────────────────────────────

pub struct DomainRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> DomainRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Domain>, RepoError> {
        sqlx::query_as::<_, DomainRow>(&format!(
            "SELECT {DOMAIN_COLS} FROM {DOMAIN_JOIN} ORDER BY d.created_at DESC"
        ))
        .fetch_all(self.pool)
        .await?
        .into_iter()
        .map(TryInto::try_into)
        .collect()
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Domain, RepoError> {
        sqlx::query_as::<_, DomainRow>(&format!(
            "SELECT {DOMAIN_COLS} FROM {DOMAIN_JOIN} WHERE d.id = $1"
        ))
        .bind(id)
        .fetch_optional(self.pool)
        .await?
        .ok_or(RepoError::NotFound)?
        .try_into()
    }

    pub async fn find_by_apex(&self, apex: &str) -> Result<Domain, RepoError> {
        sqlx::query_as::<_, DomainRow>(&format!(
            "SELECT {DOMAIN_COLS} FROM {DOMAIN_JOIN} WHERE d.apex = $1"
        ))
        .bind(apex)
        .fetch_optional(self.pool)
        .await?
        .ok_or(RepoError::NotFound)?
        .try_into()
    }

    pub async fn list_by_site(&self, site_id: Uuid) -> Result<Vec<Domain>, RepoError> {
        sqlx::query_as::<_, DomainRow>(&format!(
            "SELECT {DOMAIN_COLS} FROM {DOMAIN_JOIN} WHERE d.site_id = $1 ORDER BY d.created_at ASC"
        ))
        .bind(site_id)
        .fetch_all(self.pool)
        .await?
        .into_iter()
        .map(TryInto::try_into)
        .collect()
    }

    pub async fn create(&self, new: NewDomain) -> Result<Domain, RepoError> {
        // CTE: INSERT then JOIN to get site_name
        sqlx::query_as::<_, DomainRow>(&format!(
            "WITH r AS ( \
               INSERT INTO domains (site_id, apex, dns_managed_by, registration_expires_at, auto_renew, notes) \
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id \
             ) SELECT {DOMAIN_COLS} FROM {DOMAIN_JOIN} WHERE d.id = (SELECT id FROM r)"
        ))
        .bind(new.site_id)
        .bind(&new.apex)
        .bind(new.dns_managed_by.as_str())
        .bind(new.registration_expires_at)
        .bind(new.auto_renew)
        .bind(new.notes)
        .fetch_one(self.pool)
        .await?
        .try_into()
    }

    pub async fn update(&self, id: Uuid, patch: UpdateDomain) -> Result<Domain, RepoError> {
        if patch.dns_managed_by.is_none()
            && patch.registration_expires_at.is_none()
            && patch.auto_renew.is_none()
            && patch.notes.is_none()
        {
            return self.find_by_id(id).await;
        }

        let mut sets = Vec::<String>::new();
        let mut idx: i32 = 2;
        if patch.dns_managed_by.is_some()          { sets.push(format!("dns_managed_by = ${idx}"));          idx += 1; }
        if patch.registration_expires_at.is_some() { sets.push(format!("registration_expires_at = ${idx}")); idx += 1; }
        if patch.auto_renew.is_some()              { sets.push(format!("auto_renew = ${idx}"));              idx += 1; }
        if patch.notes.is_some()                   { sets.push(format!("notes = ${idx}"));                   #[allow(unused_assignments)] { idx += 1; } }

        let sql = format!(
            "WITH r AS ( \
               UPDATE domains SET {}, updated_at = now() WHERE id = $1 RETURNING id \
             ) SELECT {DOMAIN_COLS} FROM {DOMAIN_JOIN} WHERE d.id = (SELECT id FROM r)",
            sets.join(", ")
        );

        let mut q = sqlx::query_as::<_, DomainRow>(&sql).bind(id);
        if let Some(v) = patch.dns_managed_by         { q = q.bind(v.as_str().to_owned()); }
        if let Some(v) = patch.registration_expires_at { q = q.bind(v); }
        if let Some(v) = patch.auto_renew             { q = q.bind(v); }
        if let Some(v) = patch.notes                  { q = q.bind(v); }

        q.fetch_optional(self.pool)
            .await?
            .ok_or(RepoError::NotFound)?
            .try_into()
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let n = sqlx::query("DELETE FROM domains WHERE id = $1")
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

// ── DnsRecordRepo ─────────────────────────────────────────────────────────────

pub struct DnsRecordRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> DnsRecordRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self, domain_id: Uuid) -> Result<Vec<DnsRecord>, RepoError> {
        sqlx::query_as::<_, DnsRecordRow>(&format!(
            "SELECT {DNS_RECORD_COLS} FROM dns_records WHERE domain_id = $1 ORDER BY created_at ASC"
        ))
        .bind(domain_id)
        .fetch_all(self.pool)
        .await
        .map(|rows| rows.into_iter().map(Into::into).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<DnsRecord, RepoError> {
        sqlx::query_as::<_, DnsRecordRow>(&format!(
            "SELECT {DNS_RECORD_COLS} FROM dns_records WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.pool)
        .await?
        .ok_or(RepoError::NotFound)
        .map(Into::into)
    }

    pub async fn create(&self, new: NewDnsRecord) -> Result<DnsRecord, RepoError> {
        sqlx::query_as::<_, DnsRecordRow>(&format!(
            "INSERT INTO dns_records (domain_id, name, type, ttl, priority, content, is_managed) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING {DNS_RECORD_COLS}"
        ))
        .bind(new.domain_id)
        .bind(&new.name)
        .bind(&new.record_type)
        .bind(new.ttl)
        .bind(new.priority)
        .bind(&new.content)
        .bind(new.is_managed)
        .fetch_one(self.pool)
        .await
        .map(Into::into)
        .map_err(RepoError::from)
    }

    pub async fn update(
        &self,
        id: Uuid,
        ttl: i32,
        priority: Option<i32>,
        content: &str,
    ) -> Result<DnsRecord, RepoError> {
        sqlx::query_as::<_, DnsRecordRow>(&format!(
            "UPDATE dns_records SET ttl = $2, priority = $3, content = $4 \
             WHERE id = $1 RETURNING {DNS_RECORD_COLS}"
        ))
        .bind(id)
        .bind(ttl)
        .bind(priority)
        .bind(content)
        .fetch_optional(self.pool)
        .await?
        .ok_or(RepoError::NotFound)
        .map(Into::into)
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let n = sqlx::query("DELETE FROM dns_records WHERE id = $1")
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

    /// Replace all non-managed records for a domain in a single transaction.
    ///
    /// Managed records (is_managed = true, owned by Tundra automation) are
    /// preserved. All user-supplied records are deleted and re-inserted.
    pub async fn batch_replace(
        &self,
        domain_id: Uuid,
        records: Vec<NewDnsRecord>,
    ) -> Result<usize, RepoError> {
        let mut tx = self.pool.begin().await?;

        // Delete only user-managed (is_managed = false) records so automation
        // records (e.g. ACME TXT, NS glue) survive.
        sqlx::query("DELETE FROM dns_records WHERE domain_id = $1 AND is_managed = false")
            .bind(domain_id)
            .execute(&mut *tx)
            .await?;

        let count = records.len();
        for rec in records {
            sqlx::query(
                "INSERT INTO dns_records (domain_id, name, type, ttl, priority, content, is_managed) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7) \
                 ON CONFLICT (domain_id, name, type, content) DO UPDATE \
                   SET ttl = EXCLUDED.ttl, priority = EXCLUDED.priority, \
                       is_managed = EXCLUDED.is_managed",
            )
            .bind(domain_id)
            .bind(&rec.name)
            .bind(&rec.record_type)
            .bind(rec.ttl)
            .bind(rec.priority)
            .bind(&rec.content)
            .bind(rec.is_managed)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(count)
    }
}
