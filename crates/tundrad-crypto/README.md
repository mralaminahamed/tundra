# tundrad-crypto

All cryptographic primitives for the Tundra control plane. Zero network I/O; pure computation.

## Components

### Master key

64-byte file on disk: `[0..32]` = 32-byte key material, `[32..64]` = BLAKE3-256 of the key material. `tundrad` refuses to start if the integrity check fails.

```rust
let master = MasterKey::load(Path::new("/var/lib/tundra/data/master.key"))?;
```

### KeyRing

Process-global singleton. Loads the master key once at startup; derives per-column-family AES-256-GCM keys on demand via HKDF-SHA256. Family keys live in memory only — never persisted.

```rust
KeyRing::init_global(master)?;
let cipher = KeyRing::global()?.family_cipher("tundra:v1:identity:totp_secret")?;
```

### EncryptedField\<T, F\>

SQLx custom `bytea` type. Transparent encryption/decryption at the query boundary.

Wire format: `[1-byte version=0x01][12-byte nonce][ciphertext][16-byte GCM tag]`

```rust
// In a sqlx::FromRow struct:
totp_secret: Option<EncryptedTotpSecret>,  // = EncryptedField<String, TotpSecretFamily>
```

### Argon2id

Password hashing with fixed parameters: memory=64 MiB, time=3, parallelism=1.

```rust
let hash = hash_password("correct-horse-battery-staple")?;
assert!(verify_password("correct-horse-battery-staple", &hash)?);
```

## Security constraints

- `openssl-sys` is banned — `rustls` only throughout the dependency tree
- Family keys are zeroized when the `KeyRing` drops
- Master key bytes are zeroized via `ZeroizeOnDrop`
