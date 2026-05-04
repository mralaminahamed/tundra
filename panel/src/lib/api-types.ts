export interface Server {
  id: string
  name: string
  hostname: string
  region: string | null
  os: string
  status: 'provisioning' | 'active' | 'degraded' | 'offline' | 'disabled'
  agent_version: string | null
  agent_last_seen_at: string | null
  maintenance_starts_at: string | null
  maintenance_ends_at: string | null
  created_at: string
}

export interface ServerMetricsState {
  server_id: string
  cpu_cores: number
  cpu_used_pct: number
  ram_total_mb: number
  ram_used_mb: number
  disk_total_gb: number
  disk_used_gb: number
  site_count: number
  refreshed_at: string
}

export interface SuggestEntry {
  server_id: string
  name: string
  score: number
  available_ram_mb: number
  available_disk_gb: number
  available_cpu_pct: number
}

export interface SiteMove {
  id: string
  site_id: string
  from_server_id: string
  to_server_id: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'abandoned'
  current_stage: string | null
  error: string | null
  initiated_by: string | null
  started_at: string | null
  finished_at: string | null
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

export interface Domain {
  id: string
  apex: string
  dns_managed_by: 'tundra' | 'external' | 'registrar'
  registration_expires_at: string | null
  auto_renew: boolean
  ns_locked: boolean
  notes: string | null
  created_at: string
}

export interface DnsRecord {
  id: string
  domain_id: string
  name: string
  record_type: string
  ttl: number
  priority: number | null
  content: string
  is_managed: boolean
  created_at: string
}

export interface MailDomain {
  id: string
  domain: string
  spf_policy: string
  dmarc_policy: string
  mx_host: string
  active: boolean
  webmail_enabled: boolean
  created_at: string
}

export interface DkimKey {
  id: string
  selector: string
  algorithm: string
  public_key_pem: string
  is_active: boolean
}

export interface Mailbox {
  id: string
  mail_domain_id: string
  local_part: string
  password_scheme: string
  quota_bytes: number
  used_bytes: number
  is_active: boolean
  created_at: string
}

export interface Alias {
  id: string
  mail_domain_id: string
  source: string
  destinations: string[]
  is_active: boolean
  created_at: string
}

export interface Daemon {
  id: string
  site_id: string
  name: string
  command: string
  working_dir: string
  env_file: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MailQueueEntry {
  id: string
  queue_id: string
  queue_name: string
  sender: string
  recipients: string[]
  subject: string | null
  size_bytes: number
  arrival_time: string
  reason: string | null
}

export interface ScheduledTask {
  id: string
  site_id: string
  name: string
  schedule: string
  command: string
  working_dir: string
  is_active: boolean
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface WizardFingerprintResponse {
  host: string
  fingerprint: string
}

export interface WizardInstallResponse {
  ok: boolean
  log: string[]
}

export interface TemplateRuntime {
  kind: string
  version: string
}

export interface TemplateSource {
  kind: string
}

export interface TemplateManifest {
  id: string
  name: string
  description: string
  version: string
  runtime: TemplateRuntime
  source: TemplateSource
  build_command: string | null
  start_command: string | null
  listen_port: number | null
  env: Record<string, string>
  post_create: string[]
  tags: string[]
  icon: string
}
