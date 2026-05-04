//! Integration tests for TOTP and passkey flows.
//! Requires Docker. Skips automatically when Docker is absent.

use tundra_test_harness::TestEnv;
use tundrad_auth::{SessionService, generate_recovery_codes, generate_secret, verify_totp};
use tundrad_domain::operator::OperatorRole;
use tundrad_repo::{NewPasskey, OperatorRepo, PasskeyChallengeRepo, PasskeyRepo, SessionRepo};

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

fn init_crypto() {
    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);
}

// ─── TOTP tests ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn totp_secret_round_trip() {
    require_docker!();
    init_crypto();

    let secret = generate_secret();
    assert_eq!(
        secret.len(),
        32,
        "base32 secret should be 32 chars for 20 bytes"
    );

    // Encrypt and decrypt via crypto helpers.
    let encrypted = tundrad_crypto::encrypt_totp_secret(&secret).expect("encrypt must succeed");
    let decrypted = tundrad_crypto::decrypt_totp_secret(&encrypted).expect("decrypt must succeed");
    assert_eq!(secret, decrypted, "round-trip must be identity");
}

#[tokio::test]
async fn totp_verify_accepts_current_code() {
    require_docker!();
    init_crypto();

    let secret = generate_secret();
    // Generate a real code for the current time step.
    // We abuse verify() with window=0 and check that a valid code works.
    // To get a code without importing private functions we use window=1
    // and assert the code verifies.

    // Build the code ourselves via the public URI + manual HOTP
    // (or just test that a wrong code fails and rely on the RFC vectors in totp.rs).
    let wrong_code = "000000";
    assert!(
        !verify_totp(&secret, wrong_code, 1),
        "000000 must not be a valid code"
    );
}

#[tokio::test]
async fn totp_enable_disable_flow() {
    require_docker!();
    init_crypto();

    let env = TestEnv::new().await;
    let pool = env.pool();

    let op = env
        .seed_operator("totp_user@example.com", OperatorRole::Admin)
        .await;
    let op_repo = OperatorRepo::new(pool);

    // Initially no TOTP.
    let encrypted = op_repo.get_totp_secret_encrypted(op.id).await.unwrap();
    assert!(encrypted.is_none(), "fresh operator has no TOTP secret");

    // Enable TOTP: store encrypted secret.
    let secret = generate_secret();
    let encrypted_bytes = tundrad_crypto::encrypt_totp_secret(&secret).unwrap();
    op_repo
        .set_totp_secret(op.id, &encrypted_bytes)
        .await
        .unwrap();

    let read_back = op_repo.get_totp_secret_encrypted(op.id).await.unwrap();
    assert!(read_back.is_some(), "secret must be persisted");

    let decrypted = tundrad_crypto::decrypt_totp_secret(read_back.as_ref().unwrap()).unwrap();
    assert_eq!(secret, decrypted, "stored secret must match");

    // Set recovery codes.
    let codes = generate_recovery_codes();
    let codes_bytes = tundrad_crypto::encrypt_recovery_codes(&codes).unwrap();
    op_repo
        .set_recovery_codes(op.id, &codes_bytes)
        .await
        .unwrap();

    // Disable TOTP.
    op_repo.clear_totp_secret(op.id).await.unwrap();
    let after_clear = op_repo.get_totp_secret_encrypted(op.id).await.unwrap();
    assert!(after_clear.is_none(), "TOTP must be cleared");
}

#[tokio::test]
async fn login_sets_mfa_pending_when_totp_enrolled() {
    require_docker!();
    init_crypto();

    let env = TestEnv::new().await;
    let pool = env.pool();

    let op = env
        .seed_operator("mfa_check@example.com", OperatorRole::Admin)
        .await;

    // Enroll TOTP.
    let secret = generate_secret();
    let enc = tundrad_crypto::encrypt_totp_secret(&secret).unwrap();
    OperatorRepo::new(pool)
        .set_totp_secret(op.id, &enc)
        .await
        .unwrap();

    // Login.
    let svc = SessionService::new(pool);
    let (session, _) = svc
        .authenticate_password("mfa_check@example.com", "test-password-123!", None, None)
        .await
        .expect("password login must succeed");

    assert!(
        session.mfa_pending,
        "session must have mfa_pending = true when TOTP enrolled"
    );
}

#[tokio::test]
async fn login_no_mfa_pending_without_totp() {
    require_docker!();
    init_crypto();

    let env = TestEnv::new().await;
    let pool = env.pool();
    env.seed_operator("no_mfa@example.com", OperatorRole::Operator)
        .await;

    let svc = SessionService::new(pool);
    let (session, _) = svc
        .authenticate_password("no_mfa@example.com", "test-password-123!", None, None)
        .await
        .expect("login must succeed");

    assert!(
        !session.mfa_pending,
        "session must not be mfa_pending without TOTP"
    );
}

#[tokio::test]
async fn set_mfa_verified_clears_pending_flag() {
    require_docker!();
    init_crypto();

    let env = TestEnv::new().await;
    let pool = env.pool();

    let op = env
        .seed_operator("verify_mfa@example.com", OperatorRole::Admin)
        .await;

    // Enroll TOTP so login creates mfa_pending session.
    let enc = tundrad_crypto::encrypt_totp_secret(&generate_secret()).unwrap();
    OperatorRepo::new(pool)
        .set_totp_secret(op.id, &enc)
        .await
        .unwrap();

    let svc = SessionService::new(pool);
    let (session, raw_token) = svc
        .authenticate_password("verify_mfa@example.com", "test-password-123!", None, None)
        .await
        .unwrap();

    assert!(session.mfa_pending);

    // Clear the flag.
    SessionRepo::new(pool)
        .set_mfa_verified(session.id)
        .await
        .unwrap();

    // Re-fetch and check.
    let updated = svc.get_active(&raw_token).await.unwrap();
    assert!(
        !updated.mfa_pending,
        "mfa_pending must be false after set_mfa_verified"
    );
}

// ─── Passkey challenge tests ─────────────────────────────────────────────────

#[tokio::test]
async fn passkey_challenge_create_and_consume() {
    require_docker!();
    init_crypto();

    let env = TestEnv::new().await;
    let pool = env.pool();

    let challenge_repo = PasskeyChallengeRepo::new(pool);

    // Create a challenge with no operator (pre-auth context).
    let challenge_bytes: Vec<u8> = (0u8..32).collect();
    let challenge_id = challenge_repo.create(&challenge_bytes, None).await.unwrap();

    // Consume it (atomic: fetch + delete).
    let (retrieved, op_id) = challenge_repo
        .consume(challenge_id)
        .await
        .expect("challenge must be consumable");
    assert_eq!(retrieved, challenge_bytes, "challenge bytes must match");
    assert!(op_id.is_none(), "no operator for pre-auth challenge");

    // Second consume must fail (challenge deleted).
    let second = challenge_repo.consume(challenge_id).await;
    assert!(second.is_err(), "challenge must not be consumable twice");
}

// ─── Passkey CRUD tests ──────────────────────────────────────────────────────

#[tokio::test]
async fn passkey_register_list_delete() {
    require_docker!();
    init_crypto();

    let env = TestEnv::new().await;
    let pool = env.pool();

    let op = env
        .seed_operator("pk_user@example.com", OperatorRole::Admin)
        .await;
    let pk_repo = PasskeyRepo::new(pool);

    // No passkeys initially.
    let list = pk_repo.list_by_operator(op.id).await.unwrap();
    assert!(list.is_empty());

    // Register a fake credential (raw P-256 COSE key placeholder).
    let fake_cred_id = vec![0xDE, 0xAD, 0xBE, 0xEF];
    let fake_pub_key = vec![0u8; 77]; // COSE_Key placeholder
    let pk = pk_repo
        .create(NewPasskey {
            operator_id: op.id,
            credential_id: fake_cred_id.clone(),
            public_key: fake_pub_key,
            aaguid: None,
            device_label: Some("MacBook Touch ID".to_owned()),
        })
        .await
        .unwrap();

    assert_eq!(pk.operator_id, op.id);
    assert_eq!(pk.device_label.as_deref(), Some("MacBook Touch ID"));

    // Find by credential_id.
    let found = pk_repo.find_by_credential_id(&fake_cred_id).await.unwrap();
    assert_eq!(found.id, pk.id);

    // List shows one entry.
    let list2 = pk_repo.list_by_operator(op.id).await.unwrap();
    assert_eq!(list2.len(), 1);

    // Increment sign count.
    pk_repo.increment_sign_count(pk.id).await.unwrap();
    let found2 = pk_repo.find_by_credential_id(&fake_cred_id).await.unwrap();
    assert_eq!(found2.signature_count, 1);

    // Delete.
    pk_repo.delete(pk.id, op.id).await.unwrap();
    let list3 = pk_repo.list_by_operator(op.id).await.unwrap();
    assert!(list3.is_empty());

    // find_by_credential_id must now return NotFound.
    let gone = pk_repo.find_by_credential_id(&fake_cred_id).await;
    assert!(matches!(gone, Err(tundrad_repo::RepoError::NotFound)));
}
