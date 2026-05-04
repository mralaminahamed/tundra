/// Describes a relay-configuration operation to be applied via the Mailgun API.
#[derive(Debug)]
pub struct RelayOp {
    pub kind: RelayOpKind,
    pub mail_domain: String,
}

#[derive(Debug)]
pub enum RelayOpKind {
    ConfigureRelay { smtp_password: String },
    RemoveRelay,
    RotateSmtpPassword { new_password: String },
}
