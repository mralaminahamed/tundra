export interface Server {
  id: string
  name: string
  hostname: string
  region: string | null
  os: string
  status: 'provisioning' | 'active' | 'degraded' | 'offline' | 'disabled'
  agent_version: string | null
  agent_last_seen_at: string | null
  created_at: string
}

export interface Site {
  id: string
  name: string
  primary_domain: string
  server_id: string
  status: 'provisioning' | 'active' | 'suspended' | 'migrating' | 'archived'
  document_root: string
  created_at: string
}

export interface Deployment {
  id: string
  site_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  triggered_by: string
  source_ref: string | null
  created_at: string
  log_stream: string
}

export interface CreateServerResponse {
  server: Server
  setup_token: string
  enrolment_command: string
}

export interface CreateSiteResponse {
  data: Site
  deployment: Deployment
}

export interface ListResponse<T> {
  data: T[]
  next_cursor: string | null
}

export interface DatabaseServer {
  id: string
  server_id: string
  engine: 'postgresql' | 'mysql' | 'mariadb' | 'valkey'
  version: string
  port: number
  bind_address: string
  superuser: string
  status: 'active' | 'stopped' | 'error'
  created_at: string
}

export interface Database {
  id: string
  database_server_id: string
  name: string
  charset: string | null
  collation: string | null
  size_bytes: number | null
  created_at: string
}

export interface DbUser {
  id: string
  database_server_id: string
  username: string
  is_managed: boolean
  created_at: string
}

export interface CreateDbUserResponse {
  user: DbUser
  password: string
}

export interface ConnectionStringResponse {
  connection_string: string
}

export interface BackupTarget {
  id: string
  name: string
  kind: 's3' | 'local' | 'sftp' | 'b2' | 'wasabi' | 'r2'
  config: Record<string, unknown>
  is_default: boolean
  created_at: string
}

export interface BackupJob {
  id: string
  name: string
  scope_kind: string
  scope_id: string | null
  target_id: string
  schedule_cron: string | null
  retention_policy: Record<string, unknown>
  is_active: boolean
  last_run_at: string | null
  last_status: string | null
  next_run_at: string | null
  created_at: string
}

export interface BackupSnapshot {
  id: string
  job_id: string
  snapshot_id: string
  size_bytes: number
  status: 'succeeded' | 'failed' | 'partial'
  duration_ms: number
  created_at: string
}

export interface RestorePreview {
  restore_id: string
  preview: {
    snapshot_id: string
    size_bytes: number
    job_id: string
    created_at: string
  }
  expires_at: string
}
