use tonic::transport::Channel;
use tundra_proto::agent::{HeartbeatRequest, HeartbeatResponse, agent_client::AgentClient};

use crate::RpcError;

pub struct AgentRpcClient {
    inner: AgentClient<Channel>,
}

impl AgentRpcClient {
    /// Connect without TLS (for single-host UDS mode or dev).
    pub async fn connect_plaintext(endpoint: &str) -> Result<Self, RpcError> {
        let channel = Channel::from_shared(endpoint.to_owned())
            .map_err(|e| RpcError::InvalidEndpoint(e.to_string()))?
            .connect()
            .await?;
        Ok(Self {
            inner: AgentClient::new(channel),
        })
    }

    // mTLS connect wired in P3 after tls-ring feature is added to the workspace
    // tonic dep. For now all connections use plaintext or UDS.

    pub async fn heartbeat(
        &mut self,
        server_id: String,
        agent_version: String,
        csr_pem: Option<Vec<u8>>,
    ) -> Result<HeartbeatResponse, RpcError> {
        let resp = self
            .inner
            .heartbeat(HeartbeatRequest {
                server_id,
                agent_version,
                services: vec![],
                csr_pem,
            })
            .await?;
        Ok(resp.into_inner())
    }
}
