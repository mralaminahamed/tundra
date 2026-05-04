use sha2::{Digest, Sha256};

pub fn hash_token(token: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.finalize().to_vec()
}

pub fn generate_token(scope_prefix: &str) -> String {
    use uuid::Uuid;
    let random = Uuid::new_v4().to_string().replace('-', "");
    format!("ttok_{scope_prefix}_{random}")
}
