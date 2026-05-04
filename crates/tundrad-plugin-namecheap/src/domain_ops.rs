/// Describes a domain operation that needs confirmation before executing
/// (e.g., registration and renewal spend money).
#[derive(Debug)]
pub struct DomainOp {
    pub kind: DomainOpKind,
    pub domain: String,
    pub estimated_cost_usd: Option<f64>,
}

#[derive(Debug)]
pub enum DomainOpKind {
    Register { years: u32 },
    Renew { years: u32 },
    TransferIn,
    SetNameservers { nameservers: Vec<String> },
    SetPrivacy { enabled: bool },
    SetLock { locked: bool },
}
