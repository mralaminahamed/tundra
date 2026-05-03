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
