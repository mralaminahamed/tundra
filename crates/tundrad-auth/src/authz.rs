use time::OffsetDateTime;
use tundrad_domain::{OperatorRole, Session};

use crate::AuthError;

/// Actions that can be performed on a resource.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Read,
    Create,
    Update,
    Delete,
    Rotate,
    Execute,
}

/// Resources that can be acted upon.
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
}

/// Stateless RBAC enforcement service.
pub struct AuthzService;

impl AuthzService {
    /// Check whether `role` may perform `action` on `resource`.
    ///
    /// Returns `Ok(())` if permitted, `Err(AuthError::Forbidden)` otherwise.
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

    /// Require that the session was fully authenticated within the last 5 minutes.
    ///
    /// Used for sensitive operations: server deletion, master-key rotation,
    /// admin token issuance.
    pub fn require_step_up(&self, session: &Session) -> Result<(), AuthError> {
        let threshold = OffsetDateTime::now_utc() - time::Duration::minutes(5);
        if session.last_full_auth_at >= threshold {
            Ok(())
        } else {
            Err(AuthError::StepUpRequired)
        }
    }

    // -----------------------------------------------------------------------
    // Permission matrix
    // -----------------------------------------------------------------------

    fn is_allowed(&self, role: &OperatorRole, action: Action, resource: Resource) -> bool {
        match role {
            // Owner: unrestricted.
            OperatorRole::Owner => true,

            // Admin: everything except deleting servers and rotating the master key.
            OperatorRole::Admin => !matches!(
                (action, resource),
                (Action::Delete, Resource::Server) | (Action::Rotate, Resource::MasterKey)
            ),

            // Operator: limited set per resource.
            OperatorRole::Operator => matches!(
                (action, resource),
                // Sites and Deployments — full CRUD
                (Action::Read | Action::Create | Action::Update | Action::Delete, Resource::Site)
                | (
                    Action::Read | Action::Create | Action::Update | Action::Delete,
                    Resource::Deployment
                )
                // Servers — read only
                | (Action::Read, Resource::Server)
                // Audit log — read only
                | (Action::Read, Resource::AuditLog)
                // API tokens — read, create, delete
                | (Action::Read | Action::Create | Action::Delete, Resource::ApiToken)
                // MCP — read only
                | (Action::Read, Resource::Mcp)
                // Databases — full CRUD
                | (
                    Action::Read | Action::Create | Action::Update | Action::Delete,
                    Resource::DatabaseServer | Resource::Database | Resource::DbUser
                )
                // Backups — read, create, update (operators can't delete targets)
                | (
                    Action::Read | Action::Create | Action::Update,
                    Resource::BackupTarget | Resource::BackupJob | Resource::BackupSnapshot
                )
            ),

            // Readonly: read only on everything.
            OperatorRole::Readonly => action == Action::Read,
        }
    }
}
