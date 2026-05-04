-- database_servers: one per engine instance on a server

CREATE TABLE database_servers (
  id                              uuid        PRIMARY KEY DEFAULT uuidv7(),
  server_id                       uuid        NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  engine                          text        NOT NULL
                                    CHECK (engine IN ('postgresql','mysql','mariadb','valkey')),
  version                         text        NOT NULL,
  port                            int         NOT NULL,
  bind_address                    inet        NOT NULL DEFAULT '127.0.0.1',
  superuser                       text        NOT NULL,
  superuser_password_encrypted    bytea       NOT NULL,
  status                          text        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','stopped','error')),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_database_servers_server ON database_servers (server_id);

CREATE TRIGGER trg_database_servers_updated_at
  BEFORE UPDATE ON database_servers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- databases: individual databases within an engine instance

CREATE TABLE databases (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  database_server_id  uuid        NOT NULL REFERENCES database_servers(id) ON DELETE RESTRICT,
  name                text        NOT NULL,
  charset             text        NULL,
  "collation"         text        NULL,
  size_bytes          bigint      NULL,
  application_id      uuid        NULL REFERENCES applications(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT databases_name_per_server UNIQUE (database_server_id, name)
);

CREATE INDEX idx_databases_server ON databases (database_server_id);
CREATE INDEX idx_databases_app    ON databases (application_id);

CREATE TRIGGER trg_databases_updated_at
  BEFORE UPDATE ON databases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- db_users: database-level users managed by Tundra

CREATE TABLE db_users (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  database_server_id  uuid        NOT NULL REFERENCES database_servers(id) ON DELETE CASCADE,
  username            text        NOT NULL,
  password_encrypted  bytea       NOT NULL,
  is_managed          boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT db_users_unique UNIQUE (database_server_id, username)
);

CREATE INDEX idx_db_users_server ON db_users (database_server_id);

-- db_grants: privileges a db_user holds on a database

CREATE TABLE db_grants (
  db_user_id   uuid    NOT NULL REFERENCES db_users(id)  ON DELETE CASCADE,
  database_id  uuid    NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  privileges   text[]  NOT NULL,
  PRIMARY KEY (db_user_id, database_id)
);
