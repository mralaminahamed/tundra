/// Describes a zone-level operation to be applied through the Cloudflare API.
#[derive(Debug)]
pub struct ZoneOp {
    pub kind: ZoneOpKind,
    pub zone_id: String,
}

#[derive(Debug)]
pub enum ZoneOpKind {
    PublishZone {
        record_count: usize,
    },
    UpsertRecord {
        name: String,
        record_type: String,
        content: String,
        ttl: u32,
    },
    DeleteRecord {
        record_id: String,
    },
    SetAcmeChallenge {
        fqdn: String,
        token: String,
    },
    ClearAcmeChallenge {
        fqdn: String,
    },
}
