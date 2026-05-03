use time::OffsetDateTime;
use tundrad_domain::{OperatorRole, Session};

use crate::AuthError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Read,
    Create,
    Update,
    Delete,
    Rotate,
    Execute,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resource {
    Operator,
    Server,
    Site,
    Deployment,
    AuditLog,
    Settings,
    MasterKey,
    ApiToken,
    Mcp,
    DatabaseServer,
    Database,
    DbUser,
    BackupTarget,
    BackupJob,
    BackupSnapshot,
    Domain,
    DnsRecord,
    MailDomain,
    Mailbox,
    Alias,
    MailQueue,
    Daemon,
    ScheduledTask,
}

pub struct AuthzService;

impl AuthzService {
    pub fn require(
        &self,
        role: &OperatorRole,
        action: Action,
        resource: Resource,
    ) -> Result<(), AuthError> {
        if self.is_allowed(role, action, resource) {
            Ok(())
        } else {
            Err(AuthError::Forbidden(format!(
                "role {role:?} may not perform {action:?} on {resource:?}"
            )))
        }
    }

    pub fn require_step_up(&self, session: &Session) -> Result<(), AuthError> {
        let threshold = OffsetDateTime::now_utc() - time::Duration::minutes(5);
        if session.last_full_auth_at >= threshold {
            Ok(())
        } else {
            Err(AuthError::StepUpRequired)
        }
    }

    fn is_allowed(&self, role: &OperatorRole, action: Action, resource: Resource) -> bool {
        match role {
            OperatorRole::Owner => true,
            OperatorRole::Admin => !matches!(
                (action, resource),
                (Action::Delete, Resource::Server) | (Action::Rotate, Resource::MasterKey)
            ),
            OperatorRole::Operator => matches!(
                (action, resource),
                (
                    Action::Read | Action::Create | Action::Update | Action::Delete,
                    Resource::Site
                ) | (
                    Action::Read | Action::Create | Action::Update | Action::Delete,
                    Resource::Deployment
                ) | (Action::Read, Resource::Server)
                    | (Action::Read, Resource::AuditLog)
                    | (
                        Action::Read | Action::Create | Action::Delete,
                        Resource::ApiToken
                    )
                    | (Action::Read, Resource::Mcp)
                    | (
                        Action::Read | Action::Create | Action::Update | Action::Delete,
                        Resource::DatabaseServer | Resource::Database | Resource::DbUser
                    )
                    | (
                        Action::Read | Action::Create | Action::Update,
                        Resource::BackupTarget | Resource::BackupJob | Resource::BackupSnapshot
                    )
                    | (
                        Action::Read | Action::Create | Action::Update | Action::Delete,
                        Resource::Domain | Resource::DnsRecord
                    )
                    | (
                        Action::Read | Action::Create | Action::Update | Action::Delete,
                        Resource::MailDomain
                            | Resource::Mailbox
                            | Resource::Alias
                            | Resource::MailQueue
                    )
                    | (
                        Action::Read | Action::Create | Action::Delete,
                        Resource::Daemon
                    )
                    | (
                        Action::Read | Action::Create | Action::Delete,
                        Resource::ScheduledTask
                    )
            ),
            OperatorRole::Readonly => action == Action::Read,
        }
    }
}
