use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tundrad_auth::SessionService;
use tundrad_repo::{AuditLogRepo, OperatorRepo, PasskeyChallengeRepo, PasskeyRepo, PgPool};
use uuid::Uuid;

use crate::{
    error::ApiError,
    extractors::{AuthSession, MfaPendingSession},
};

// ─── Login / logout / me ──────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub operator: OperatorDto,
    pub requires_totp: bool,
}

#[derive(Serialize)]
pub struct OperatorDto {
    pub id: String,
    pub email: String,
    pub full_name: String,
    pub role: String,
}

pub async fn login(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let ip = headers
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let svc = SessionService::new(&pool);
    let (session, raw_token) = svc
        .authenticate_password(&body.email, &body.password, user_agent, ip)
        .await
        .map_err(ApiError::from)?;

    let op = OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    let cookie = format!(
        "tundra_session={}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000",
        String::from_utf8_lossy(&raw_token),
    );

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(LoginResponse {
            requires_totp: op.has_totp,
            operator: OperatorDto {
                id: op.id.to_string(),
                email: op.email,
                full_name: op.full_name,
                role: op.role.as_str().to_owned(),
            },
        }),
    ))
}

pub async fn logout(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let svc = SessionService::new(&pool);
    svc.revoke(session.id, "operator_logout")
        .await
        .map_err(ApiError::from)?;

    let clear = "tundra_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, clear)]))
}

pub async fn me(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(OperatorDto {
        id: op.id.to_string(),
        email: op.email,
        full_name: op.full_name,
        role: op.role.as_str().to_owned(),
    }))
}

// ─── TOTP setup/enable/disable/verify ─────────────────────────────────────────

/// GET /api/v1/auth/totp/setup
///
/// Returns a fresh TOTP secret and otpauth URI. The secret is NOT persisted
/// until `totp_enable` is called with a valid code.
#[derive(Serialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub uri: String,
}

pub async fn totp_setup(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    let secret = tundrad_auth::generate_secret();
    let uri = tundrad_auth::totp_uri(&secret, &op.email, "Tundra");

    Ok(Json(TotpSetupResponse { secret, uri }))
}

/// POST /api/v1/auth/totp/enable
///
/// Body: `{ secret, code }` — the client sends back the secret it received
/// from `totp_setup` plus a live TOTP code. On success the secret is stored
/// encrypted and recovery codes are returned.
#[derive(Deserialize)]
pub struct TotpEnableRequest {
    pub secret: String,
    pub code: String,
}

#[derive(Serialize)]
pub struct TotpEnableResponse {
    pub recovery_codes: Vec<String>,
}

pub async fn totp_enable(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<TotpEnableRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Verify the submitted code against the supplied secret before persisting.
    if !tundrad_auth::verify_totp(&body.secret, &body.code, 1) {
        return Err(ApiError::bad_request("invalid TOTP code"));
    }

    // Encrypt and store the secret using the crypto convenience helper.
    let secret_bytes = tundrad_crypto::encrypt_totp_secret(&body.secret).map_err(|e| {
        tracing::error!(?e, "failed to encrypt TOTP secret");
        ApiError::internal()
    })?;

    OperatorRepo::new(&pool)
        .set_totp_secret(session.operator_id, &secret_bytes)
        .await
        .map_err(ApiError::from)?;

    // Generate and store recovery codes (encrypted).
    let codes = tundrad_auth::generate_recovery_codes();
    let codes_bytes = tundrad_crypto::encrypt_recovery_codes(&codes).map_err(|e| {
        tracing::error!(?e, "failed to encrypt recovery codes");
        ApiError::internal()
    })?;

    OperatorRepo::new(&pool)
        .set_recovery_codes(session.operator_id, &codes_bytes)
        .await
        .map_err(ApiError::from)?;

    // Audit.
    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.totp_enabled".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(session.operator_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({}),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::OK,
        Json(TotpEnableResponse {
            recovery_codes: codes,
        }),
    ))
}

/// DELETE /api/v1/auth/totp
///
/// Disables TOTP. Requires step-up: `last_full_auth_at` must be within 5 minutes.
pub async fn totp_disable(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    // Step-up check.
    let five_minutes_ago = time::OffsetDateTime::now_utc() - time::Duration::minutes(5);
    if session.last_full_auth_at < five_minutes_ago {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "STEP_UP_REQUIRED",
            "step-up authentication required",
        ));
    }

    OperatorRepo::new(&pool)
        .clear_totp_secret(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.totp_disabled".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(session.operator_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({}),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/auth/totp/verify
///
/// Called after password login when `requires_totp = true`.
/// Accepts sessions with `mfa_pending = true`.
/// On success clears `mfa_pending` and returns 204.
#[derive(Deserialize)]
pub struct TotpVerifyRequest {
    pub code: String,
}

pub async fn totp_verify(
    State(pool): State<PgPool>,
    MfaPendingSession(session): MfaPendingSession,
    Json(body): Json<TotpVerifyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Retrieve the encrypted TOTP secret.
    let encrypted_bytes = OperatorRepo::new(&pool)
        .get_totp_secret_encrypted(session.operator_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::bad_request("TOTP not configured"))?;

    // Decrypt using the EncryptedField infrastructure.
    let secret = decrypt_totp_secret(&encrypted_bytes)?;

    if !tundrad_auth::verify_totp(&secret, &body.code, 1) {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_TOTP_CODE",
            "invalid or expired TOTP code",
        ));
    }

    // Clear the MFA gate.
    tundrad_repo::SessionRepo::new(&pool)
        .set_mfa_verified(session.id)
        .await
        .map_err(ApiError::from)?;

    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.totp_verified".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(session.operator_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({}),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Passkey auth challenge / verify ──────────────────────────────────────────

/// POST /api/v1/auth/passkey/challenge
///
/// Returns a fresh challenge for a WebAuthn authentication assertion.
#[derive(Serialize)]
pub struct PasskeyChallengeResponse {
    pub challenge_id: Uuid,
    pub challenge: String, // base64url-encoded random bytes
}

pub async fn passkey_challenge(State(pool): State<PgPool>) -> Result<impl IntoResponse, ApiError> {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);

    let challenge_id = PasskeyChallengeRepo::new(&pool)
        .create(&bytes, None)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(PasskeyChallengeResponse {
        challenge_id,
        challenge: URL_SAFE_NO_PAD.encode(bytes),
    }))
}

/// POST /api/v1/auth/passkey/verify
///
/// Verifies a WebAuthn authentication assertion and creates a session.
#[derive(Deserialize)]
pub struct PasskeyVerifyRequest {
    pub challenge_id: Uuid,
    pub credential_id: String,      // base64url
    pub authenticator_data: String, // base64url
    pub client_data_json: String,   // base64url
    pub signature: String,          // base64url
}

pub async fn passkey_verify(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    Json(body): Json<PasskeyVerifyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // 1. Consume the challenge (single-use, checks expiry).
    let (challenge_bytes, _) = PasskeyChallengeRepo::new(&pool)
        .consume(body.challenge_id)
        .await
        .map_err(|_| ApiError::bad_request("challenge not found or expired"))?;

    // 2. Decode inputs.
    let cred_id_bytes = URL_SAFE_NO_PAD
        .decode(&body.credential_id)
        .map_err(|_| ApiError::bad_request("invalid credential_id encoding"))?;

    let auth_data = URL_SAFE_NO_PAD
        .decode(&body.authenticator_data)
        .map_err(|_| ApiError::bad_request("invalid authenticator_data encoding"))?;

    let client_data_raw = URL_SAFE_NO_PAD
        .decode(&body.client_data_json)
        .map_err(|_| ApiError::bad_request("invalid client_data_json encoding"))?;

    let sig_bytes = URL_SAFE_NO_PAD
        .decode(&body.signature)
        .map_err(|_| ApiError::bad_request("invalid signature encoding"))?;

    // 3. Parse and verify clientDataJSON.
    let client_data: serde_json::Value = serde_json::from_slice(&client_data_raw)
        .map_err(|_| ApiError::bad_request("client_data_json is not valid JSON"))?;

    if client_data.get("type").and_then(|v| v.as_str()) != Some("webauthn.get") {
        return Err(ApiError::bad_request(
            "client_data_json type must be webauthn.get",
        ));
    }

    let client_challenge = client_data
        .get("challenge")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::bad_request("missing challenge in client_data_json"))?;

    let client_challenge_bytes = URL_SAFE_NO_PAD.decode(client_challenge).map_err(|_| {
        ApiError::bad_request("challenge in client_data_json is not valid base64url")
    })?;

    if client_challenge_bytes != challenge_bytes {
        return Err(ApiError::bad_request("challenge mismatch"));
    }

    // 4. Verify authenticator_data basic structure.
    // Bytes 0..32 = rpIdHash, byte 32 = flags.
    if auth_data.len() < 37 {
        return Err(ApiError::bad_request("authenticator_data too short"));
    }
    let flags = auth_data[32];
    // UP (user present) flag must be set (bit 0).
    if flags & 0x01 == 0 {
        return Err(ApiError::bad_request("user-present flag not set"));
    }

    // 5. Look up the passkey.
    let passkey = PasskeyRepo::new(&pool)
        .find_by_credential_id(&cred_id_bytes)
        .await
        .map_err(|_| ApiError::bad_request("passkey not found"))?;

    // 6. Verify ECDSA-P256 signature.
    //    Signed data = authenticator_data || SHA-256(client_data_json_raw_bytes)
    let client_data_hash = Sha256::digest(&client_data_raw);
    let mut signed_data = Vec::with_capacity(auth_data.len() + 32);
    signed_data.extend_from_slice(&auth_data);
    signed_data.extend_from_slice(&client_data_hash);

    verify_p256_signature(&passkey.public_key, &signed_data, &sig_bytes)
        .map_err(|_| ApiError::bad_request("signature verification failed"))?;

    // 7. Increment sign count.
    PasskeyRepo::new(&pool)
        .increment_sign_count(passkey.id)
        .await
        .map_err(ApiError::from)?;

    // 8. Create a fully-authenticated session (mfa_pending = false for passkey auth).
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let ip = headers
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let mut raw_token = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw_token);
    let expires_at = time::OffsetDateTime::now_utc() + time::Duration::days(30);

    let session = tundrad_repo::SessionRepo::new(&pool)
        .create(tundrad_domain::NewSession {
            operator_id: passkey.operator_id,
            refresh_token: raw_token.clone(),
            user_agent: user_agent.clone(),
            ip: ip.clone(),
            expires_at,
            mfa_pending: false,
        })
        .await
        .map_err(ApiError::from)?;

    // 9. Audit.
    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(passkey.operator_id),
            action: "operator.login".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(passkey.operator_id),
            ip,
            user_agent,
            details: serde_json::json!({ "method": "passkey", "session_id": session.id }),
        })
        .await
        .map_err(ApiError::from)?;

    let cookie = format!(
        "tundra_session={}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000",
        String::from_utf8_lossy(&raw_token),
    );

    let op = OperatorRepo::new(&pool)
        .find_by_id(passkey.operator_id)
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(serde_json::json!({
            "operator": {
                "id": op.id.to_string(),
                "email": op.email,
                "full_name": op.full_name,
                "role": op.role.as_str(),
            }
        })),
    ))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Decrypt an encrypted TOTP secret from raw `bytea` bytes.
fn decrypt_totp_secret(bytes: &[u8]) -> Result<String, ApiError> {
    tundrad_crypto::decrypt_totp_secret(bytes).map_err(|e| {
        tracing::error!(?e, "failed to decrypt TOTP secret");
        ApiError::internal()
    })
}

/// Verify an ECDSA-P256 signature over `message` using a COSE_Key-encoded public key.
fn verify_p256_signature(
    cose_key_bytes: &[u8],
    message: &[u8],
    signature_der: &[u8],
) -> Result<(), String> {
    use p256::ecdsa::{Signature, VerifyingKey, signature::Verifier};

    // Parse COSE_Key map to extract x and y coordinates.
    let (x, y) = parse_cose_ec2_key(cose_key_bytes).map_err(|e| e.to_string())?;

    // Build uncompressed point: 0x04 || x || y
    let mut uncompressed = Vec::with_capacity(65);
    uncompressed.push(0x04u8);
    uncompressed.extend_from_slice(&x);
    uncompressed.extend_from_slice(&y);

    let verifying_key = VerifyingKey::from_sec1_bytes(&uncompressed)
        .map_err(|e| format!("invalid public key: {e:?}"))?;

    // Signature may be DER-encoded.
    let sig = Signature::from_der(signature_der)
        .map_err(|e| format!("invalid signature encoding: {e:?}"))?;

    verifying_key
        .verify(message, &sig)
        .map_err(|e| format!("signature verification failed: {e:?}"))?;
    Ok(())
}

/// Parse a COSE_Key map (EC2, P-256) and return the (x, y) coordinate bytes.
fn parse_cose_ec2_key(
    bytes: &[u8],
) -> Result<([u8; 32], [u8; 32]), Box<dyn std::error::Error + Send + Sync>> {
    use ciborium::value::Value;

    let value: Value = ciborium::de::from_reader(bytes)?;

    let map = match value {
        Value::Map(m) => m,
        _ => return Err("COSE_Key is not a map".into()),
    };

    let get_int = |key: i64| -> Option<&Value> {
        for (k, v) in &map {
            if let Value::Integer(i) = k {
                if i128::from(*i) == key as i128 {
                    return Some(v);
                }
            }
        }
        None
    };

    // -2 (x coordinate) and -3 (y coordinate)
    let x_val = get_int(-2).ok_or("missing x in COSE_Key")?;
    let y_val = get_int(-3).ok_or("missing y in COSE_Key")?;

    let x_bytes = match x_val {
        Value::Bytes(b) => b.as_slice().to_vec(),
        _ => return Err("x is not bytes".into()),
    };
    let y_bytes = match y_val {
        Value::Bytes(b) => b.as_slice().to_vec(),
        _ => return Err("y is not bytes".into()),
    };

    if x_bytes.len() != 32 || y_bytes.len() != 32 {
        return Err("x/y coordinates must be 32 bytes each".into());
    }

    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&x_bytes);
    y.copy_from_slice(&y_bytes);

    Ok((x, y))
}
