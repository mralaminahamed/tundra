//! Integration tests for the password-based auth flow.
//! Requires Docker to be available. Skips automatically if Docker is absent.

use tundra_test_harness::TestEnv;
use tundrad_auth::SessionService;
use tundrad_domain::operator::OperatorRole;

/// Helper: skip test gracefully if Docker is not reachable.
macro_rules! require_docker {
    () => {
        if std::process::Command::new("docker")
            .arg("info")
            .output()
            .map(|o| !o.status.success())
            .unwrap_or(true)
        {
            eprintln!("skipping — Docker not available");
            return;
        }
    };
}

#[tokio::test]
async fn auth_password_flow_succeeds() {
    require_docker!();

    // Init a throwaway KeyRing for crypto ops in this test process.
    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master); // may already be set; ignore error

    let env = TestEnv::new().await;
    let pool = env.pool();

    let op = env
        .seed_operator("alice@example.com", OperatorRole::Admin)
        .await;

    let svc = SessionService::new(pool);
    let result = svc
        .authenticate_password(
            "alice@example.com",
            "test-password-123!",
            Some("test-agent/1.0".to_owned()),
            None,
        )
        .await;

    assert!(result.is_ok(), "expected Ok, got {result:?}");
    let (session, raw_token) = result.unwrap();
    assert_eq!(session.operator_id, op.id);
    assert!(!raw_token.is_empty());
}

#[tokio::test]
async fn auth_password_flow_wrong_password_returns_invalid_credentials() {
    require_docker!();

    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);

    let env = TestEnv::new().await;
    let pool = env.pool();
    env.seed_operator("bob@example.com", OperatorRole::Operator)
        .await;

    let svc = SessionService::new(pool);
    let result = svc
        .authenticate_password("bob@example.com", "wrong-password!", None, None)
        .await;

    assert!(
        matches!(result, Err(tundrad_auth::AuthError::InvalidCredentials)),
        "expected InvalidCredentials, got {result:?}"
    );
}

#[tokio::test]
async fn auth_password_flow_unknown_email_returns_invalid_credentials() {
    require_docker!();

    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);

    let env = TestEnv::new().await;
    let pool = env.pool();

    let svc = SessionService::new(pool);
    let result = svc
        .authenticate_password("nobody@example.com", "anything", None, None)
        .await;

    // Must return InvalidCredentials — never "not found" (timing oracle protection).
    assert!(
        matches!(result, Err(tundrad_auth::AuthError::InvalidCredentials)),
        "expected InvalidCredentials, got {result:?}"
    );
}

#[tokio::test]
async fn session_refresh_returns_active_session() {
    require_docker!();

    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);

    let env = TestEnv::new().await;
    let pool = env.pool();
    env.seed_operator("carol@example.com", OperatorRole::Readonly)
        .await;

    let svc = SessionService::new(pool);
    let (_, raw_token) = svc
        .authenticate_password("carol@example.com", "test-password-123!", None, None)
        .await
        .unwrap();

    let refreshed = svc.refresh(&raw_token).await;
    assert!(refreshed.is_ok(), "refresh failed: {refreshed:?}");
}

#[tokio::test]
async fn session_revoke_prevents_further_use() {
    require_docker!();

    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);

    let env = TestEnv::new().await;
    let pool = env.pool();
    env.seed_operator("dave@example.com", OperatorRole::Operator)
        .await;

    let svc = SessionService::new(pool);
    let (session, raw_token) = svc
        .authenticate_password("dave@example.com", "test-password-123!", None, None)
        .await
        .unwrap();

    svc.revoke(session.id, "test_revoke").await.unwrap();

    let after = svc.get_active(&raw_token).await;
    assert!(
        matches!(
            after,
            Err(tundrad_auth::AuthError::SessionRevoked | tundrad_auth::AuthError::SessionNotFound)
        ),
        "expected revoked/not-found, got {after:?}"
    );
}
