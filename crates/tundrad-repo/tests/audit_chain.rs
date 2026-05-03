//! Integration tests for audit log chain-hash integrity.
//! Requires Docker.

use tundra_test_harness::TestEnv;
use tundrad_domain::{AuditActor, NewAuditEntry};
use tundrad_repo::AuditLogRepo;

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
async fn audit_chain_rows_have_chain_hash() {
    require_docker!();

    // Init KeyRing for any crypto ops that may be triggered.
    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);

    let env = TestEnv::new().await;
    let pool = env.pool();
    let repo = AuditLogRepo::new(pool);

    // Append two entries.
    let id1 = repo
        .append(NewAuditEntry::system("test.event_one"))
        .await
        .unwrap();
    let id2 = repo
        .append(NewAuditEntry::system("test.event_two"))
        .await
        .unwrap();

    // Retrieve both and verify chain_hash is populated (non-NULL).
    let rows: Vec<(uuid::Uuid, Option<Vec<u8>>)> = sqlx::query_as(
        "SELECT id, chain_hash FROM audit_log WHERE id = ANY($1) ORDER BY occurred_at ASC",
    )
    .bind(vec![id1, id2])
    .fetch_all(pool)
    .await
    .unwrap();

    assert_eq!(rows.len(), 2, "expected 2 audit rows");
    assert!(rows[0].1.is_some(), "first row chain_hash must not be NULL");
    assert!(
        rows[1].1.is_some(),
        "second row chain_hash must not be NULL"
    );

    // The two chain hashes must differ (forward-chaining).
    assert_ne!(rows[0].1, rows[1].1, "consecutive chain hashes must differ");
}

#[tokio::test]
async fn audit_chain_list_returns_entries_newest_first() {
    require_docker!();

    let (_, master) = tundrad_crypto::MasterKey::generate();
    let _ = tundrad_crypto::KeyRing::init_global(master);

    let env = TestEnv::new().await;
    let pool = env.pool();
    let repo = AuditLogRepo::new(pool);

    for i in 0..5 {
        repo.append(NewAuditEntry {
            actor: AuditActor::System,
            action: format!("test.event_{i}"),
            resource_type: None,
            resource_id: None,
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "seq": i }),
        })
        .await
        .unwrap();
    }

    let entries = repo.list(5, None).await.unwrap();
    assert_eq!(entries.len(), 5);

    // Newest first.
    for i in 0..entries.len().saturating_sub(1) {
        assert!(
            entries[i].occurred_at >= entries[i + 1].occurred_at,
            "entries must be ordered newest-first"
        );
    }
}
