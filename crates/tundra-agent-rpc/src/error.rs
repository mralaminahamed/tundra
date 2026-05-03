use thiserror::Error;

#[derive(Debug, Error)]
pub enum RpcError {
    #[error("transport error: {0}")]
    Transport(#[from] tonic::transport::Error),

    #[error("gRPC status: {0}")]
    Status(#[from] tonic::Status),

    #[error("invalid endpoint URI: {0}")]
    InvalidEndpoint(String),
}
