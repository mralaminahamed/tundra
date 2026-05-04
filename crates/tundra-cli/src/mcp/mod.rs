/// MCP CLI subcommands for Tundra.
///
/// Usage examples:
///   tundra mcp serve --stdio --readonly
///   tundra mcp tokens list
///   tundra mcp tokens create --name "claude-desktop" --scope mcp:read
///   tundra mcp sessions list
///   tundra mcp audit

#[derive(Debug)]
pub enum McpCommand {
    /// Start the MCP server (stdio or HTTP transport).
    Serve {
        stdio: bool,
        readonly: bool,
        port: Option<u16>,
    },
    /// Manage MCP tokens.
    Tokens(TokensCommand),
    /// List active MCP sessions.
    Sessions,
    /// Show recent MCP tool invocations from the audit log.
    Audit { limit: usize },
}

#[derive(Debug)]
pub enum TokensCommand {
    List,
    Create {
        name: String,
        scope: String,
        expires_days: u32,
    },
    Revoke {
        token_id: String,
    },
}

/// Stub dispatcher — returns a "not yet implemented" message for every sub-command.
/// Real implementations will call the tundrad REST API via reqwest.
pub fn run(cmd: McpCommand) -> anyhow::Result<()> {
    match cmd {
        McpCommand::Serve {
            stdio,
            readonly,
            port,
        } => {
            let transport = if stdio { "stdio" } else { "http" };
            let mode = if readonly { "read" } else { "write" };
            let port_info = port.map(|p| format!(" on port {p}")).unwrap_or_default();
            println!(
                "MCP server stub: would start {} transport in {} mode{port_info}",
                transport, mode
            );
            println!(
                "Connect an AI agent with: TUNDRA_API_TOKEN=ttok_... tundra mcp serve --stdio"
            );
        }
        McpCommand::Tokens(TokensCommand::List) => {
            println!("MCP tokens stub: would list tokens from tundrad API");
        }
        McpCommand::Tokens(TokensCommand::Create {
            name,
            scope,
            expires_days,
        }) => {
            println!(
                "MCP tokens stub: would create token '{name}' scope={scope} expires_in={expires_days}d"
            );
        }
        McpCommand::Tokens(TokensCommand::Revoke { token_id }) => {
            println!("MCP tokens stub: would revoke token {token_id}");
        }
        McpCommand::Sessions => {
            println!("MCP sessions stub: would list active sessions from tundrad API");
        }
        McpCommand::Audit { limit } => {
            println!("MCP audit stub: would show last {limit} tool invocations");
        }
    }
    Ok(())
}
