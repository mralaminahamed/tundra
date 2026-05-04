use crate::{PgPool, RepoError};
use tundrad_crypto::{EncryptedDbSuperuserPassword, EncryptedDbUserPassword};
use tundrad_domain::database::{
    Database, DatabaseServer, DbGrant, DbUser, NewDatabase, NewDatabaseServer, NewDbUser,
};
use uuid::Uuid;

// ── DatabaseServer ────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DatabaseServerRow {
    id: Uuid,
    server_id: Uuid,
    engine: String,
    version: String,
    port: i32,
    bind_address: String,
    superuser: String,
    status: String,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl TryFrom<DatabaseServerRow> for DatabaseServer {
    type Error = RepoError;
    fn try_from(r: DatabaseServerRow) -> Result<Self, Self::Error> {
        Ok(DatabaseServer {
            id: r.id,
            server_id: r.server_id,
            engine: r.engine.parse().map_err(RepoError::Conflict)?,
            version: r.version,
            port: r.port,
            bind_address: r.bind_address,
            superuser: r.superuser,
            status: r.status.parse().map_err(RepoError::Conflict)?,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

const DB_SERVER_COLS: &str = "id, server_id, engine, version, port, bind_address::text, superuser, status, \
     created_at, updated_at";

pub struct DatabaseServerRepo<'a>(pub &'a PgPool);

impl<'a> DatabaseServerRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, server_id: Option<Uuid>) -> Result<Vec<DatabaseServer>, RepoError> {
        let rows: Vec<DatabaseServerRow> = if let Some(sid) = server_id {
            sqlx::query_as::<_, DatabaseServerRow>(&format!(
                "SELECT {DB_SERVER_COLS} FROM database_servers WHERE server_id = $1"
            ))
            .bind(sid)
            .fetch_all(self.0)
            .await?
        } else {
            sqlx::query_as::<_, DatabaseServerRow>(&format!(
                "SELECT {DB_SERVER_COLS} FROM database_servers ORDER BY created_at DESC"
            ))
            .fetch_all(self.0)
            .await?
        };
        rows.into_iter().map(TryFrom::try_from).collect()
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<DatabaseServer, RepoError> {
        sqlx::query_as::<_, DatabaseServerRow>(&format!(
            "SELECT {DB_SERVER_COLS} FROM database_servers WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)?
        .try_into()
    }

    pub async fn create(&self, new: NewDatabaseServer) -> Result<DatabaseServer, RepoError> {
        let enc_pw = EncryptedDbSuperuserPassword::new(new.superuser_password);
        sqlx::query_as::<_, DatabaseServerRow>(&format!(
            "INSERT INTO database_servers \
             (server_id, engine, version, port, superuser, superuser_password_encrypted, status) \
             VALUES ($1, $2, $3, $4, $5, $6, 'active') \
             RETURNING {DB_SERVER_COLS}"
        ))
        .bind(new.server_id)
        .bind(new.engine.as_str())
        .bind(&new.version)
        .bind(new.port)
        .bind(&new.superuser)
        .bind(enc_pw)
        .fetch_one(self.0)
        .await?
        .try_into()
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM database_servers WHERE id = $1")
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

// ── Database ──────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DatabaseRow {
    id: Uuid,
    database_server_id: Uuid,
    name: String,
    charset: Option<String>,
    collation: Option<String>,
    size_bytes: Option<i64>,
    application_id: Option<Uuid>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<DatabaseRow> for Database {
    fn from(r: DatabaseRow) -> Self {
        Database {
            id: r.id,
            database_server_id: r.database_server_id,
            name: r.name,
            charset: r.charset,
            collation: r.collation,
            size_bytes: r.size_bytes,
            application_id: r.application_id,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const DB_COLS: &str = "id, database_server_id, name, charset, collation, size_bytes, \
    application_id, created_at, updated_at";

pub struct DatabaseRepo<'a>(pub &'a PgPool);

impl<'a> DatabaseRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, server_id: Option<Uuid>) -> Result<Vec<Database>, RepoError> {
        let rows: Vec<DatabaseRow> = if let Some(sid) = server_id {
            sqlx::query_as::<_, DatabaseRow>(&format!(
                "SELECT {DB_COLS} FROM databases \
                 WHERE database_server_id = $1 ORDER BY created_at DESC"
            ))
            .bind(sid)
            .fetch_all(self.0)
            .await?
        } else {
            sqlx::query_as::<_, DatabaseRow>(&format!(
                "SELECT {DB_COLS} FROM databases ORDER BY created_at DESC"
            ))
            .fetch_all(self.0)
            .await?
        };
        Ok(rows.into_iter().map(Database::from).collect())
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Database, RepoError> {
        sqlx::query_as::<_, DatabaseRow>(&format!("SELECT {DB_COLS} FROM databases WHERE id = $1"))
            .bind(id)
            .fetch_optional(self.0)
            .await?
            .ok_or_else(|| RepoError::NotFound)
            .map(Database::from)
    }

    pub async fn create(&self, new: NewDatabase) -> Result<Database, RepoError> {
        sqlx::query_as::<_, DatabaseRow>(&format!(
            "INSERT INTO databases (database_server_id, name, charset, collation) \
             VALUES ($1, $2, $3, $4) RETURNING {DB_COLS}"
        ))
        .bind(new.database_server_id)
        .bind(&new.name)
        .bind(new.charset.as_deref())
        .bind(new.collation.as_deref())
        .fetch_one(self.0)
        .await
        .map(Database::from)
        .map_err(RepoError::from)
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM databases WHERE id = $1")
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

// ── DbUser ────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DbUserRow {
    id: Uuid,
    database_server_id: Uuid,
    username: String,
    is_managed: bool,
    created_at: time::OffsetDateTime,
}

impl From<DbUserRow> for DbUser {
    fn from(r: DbUserRow) -> Self {
        DbUser {
            id: r.id,
            database_server_id: r.database_server_id,
            username: r.username,
            is_managed: r.is_managed,
            created_at: r.created_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct DbGrantRow {
    db_user_id: Uuid,
    database_id: Uuid,
    privileges: Vec<String>,
}

impl From<DbGrantRow> for DbGrant {
    fn from(r: DbGrantRow) -> Self {
        DbGrant {
            db_user_id: r.db_user_id,
            database_id: r.database_id,
            privileges: r.privileges,
        }
    }
}

pub struct DbUserRepo<'a>(pub &'a PgPool);

impl<'a> DbUserRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, database_server_id: Uuid) -> Result<Vec<DbUser>, RepoError> {
        let rows: Vec<DbUserRow> = sqlx::query_as::<_, DbUserRow>(
            "SELECT id, database_server_id, username, is_managed, created_at \
             FROM db_users WHERE database_server_id = $1 ORDER BY created_at DESC",
        )
        .bind(database_server_id)
        .fetch_all(self.0)
        .await?;
        Ok(rows.into_iter().map(DbUser::from).collect())
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<DbUser, RepoError> {
        sqlx::query_as::<_, DbUserRow>(
            "SELECT id, database_server_id, username, is_managed, created_at \
             FROM db_users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)
        .map(DbUser::from)
    }

    /// Returns the plaintext password so it can be returned once on creation.
    pub async fn create(&self, new: NewDbUser) -> Result<(DbUser, String), RepoError> {
        let password = new.password.clone();
        let enc_pw = EncryptedDbUserPassword::new(new.password);
        let row = sqlx::query_as::<_, DbUserRow>(
            "INSERT INTO db_users (database_server_id, username, password_encrypted, is_managed) \
             VALUES ($1, $2, $3, true) \
             RETURNING id, database_server_id, username, is_managed, created_at",
        )
        .bind(new.database_server_id)
        .bind(&new.username)
        .bind(enc_pw)
        .fetch_one(self.0)
        .await?;
        Ok((DbUser::from(row), password))
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM db_users WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn list_grants(&self, user_id: Uuid) -> Result<Vec<DbGrant>, RepoError> {
        let rows: Vec<DbGrantRow> =
            sqlx::query_as::<_, DbGrantRow>("SELECT * FROM db_grants WHERE db_user_id = $1")
                .bind(user_id)
                .fetch_all(self.0)
                .await?;
        Ok(rows.into_iter().map(DbGrant::from).collect())
    }

    pub async fn set_grant(
        &self,
        user_id: Uuid,
        database_id: Uuid,
        privileges: Vec<String>,
    ) -> Result<DbGrant, RepoError> {
        sqlx::query_as::<_, DbGrantRow>(
            "INSERT INTO db_grants (db_user_id, database_id, privileges) VALUES ($1, $2, $3) \
             ON CONFLICT (db_user_id, database_id) \
             DO UPDATE SET privileges = EXCLUDED.privileges \
             RETURNING *",
        )
        .bind(user_id)
        .bind(database_id)
        .bind(&privileges)
        .fetch_one(self.0)
        .await
        .map(DbGrant::from)
        .map_err(RepoError::from)
    }

    pub async fn revoke_grant(&self, user_id: Uuid, database_id: Uuid) -> Result<(), RepoError> {
        sqlx::query("DELETE FROM db_grants WHERE db_user_id = $1 AND database_id = $2")
            .bind(user_id)
            .bind(database_id)
            .execute(self.0)
            .await?;
        Ok(())
    }

    /// Decrypt and return the plaintext connection password for a db_user.
    pub async fn get_decrypted_password(&self, id: Uuid) -> Result<String, RepoError> {
        #[derive(sqlx::FromRow)]
        struct PwRow {
            password_encrypted: EncryptedDbUserPassword,
        }
        let row =
            sqlx::query_as::<_, PwRow>("SELECT password_encrypted FROM db_users WHERE id = $1")
                .bind(id)
                .fetch_optional(self.0)
                .await?
                .ok_or_else(|| RepoError::NotFound)?;
        Ok(row.password_encrypted.into_inner())
    }
}
