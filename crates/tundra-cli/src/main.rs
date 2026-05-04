pub mod acceptance;
pub mod agent_cert;
pub mod master_key;
pub mod mcp;

use std::path::PathBuf;

use clap::{Parser, Subcommand};

// ---------------------------------------------------------------------------
// Top-level CLI
// ---------------------------------------------------------------------------

/// Tundra operator CLI.
#[derive(Debug, Parser)]
#[command(name = "tundra", version, about = "Tundra operator CLI")]
struct Cli {
    /// PostgreSQL database URL (also read from DATABASE_URL env var).
    #[arg(long, env = "DATABASE_URL", global = true, default_value = "")]
    database_url: String,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Run acceptance checks against a Tundra control plane.
    Acceptance {
        #[command(subcommand)]
        sub: AcceptanceCommand,
    },

    /// Manage MCP (Model Context Protocol) server tokens and sessions.
    Mcp {
        #[command(subcommand)]
        cmd: McpCmd,
    },

    /// First-run setup helpers.
    Setup {
        #[command(subcommand)]
        cmd: SetupCmd,
    },

    /// Master-key management (rotation, verification).
    MasterKey {
        #[command(subcommand)]
        cmd: MasterKeyCmd,
    },

    /// Agent management (certificates, enrollment).
    Agent {
        #[command(subcommand)]
        cmd: AgentCmd,
    },
}

// ---------------------------------------------------------------------------
// Acceptance subcommands (pre-existing)
// ---------------------------------------------------------------------------

#[derive(Debug, Subcommand)]
enum AcceptanceCommand {
    /// Run acceptance checks.
    Run {
        /// Which section to run (smoke, identity, enroll, site, deploy,
        /// databases, mail, backups, all).
        #[arg(long, default_value = "all")]
        section: acceptance::Section,

        /// Base URL of the Tundra control plane.
        #[arg(long, default_value = "http://localhost:7400")]
        url: String,

        /// Bearer token for authenticated checks.
        #[arg(long, env = "TUNDRA_API_TOKEN")]
        token: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// MCP subcommands (pre-existing)
// ---------------------------------------------------------------------------

#[derive(Debug, Subcommand)]
enum McpCmd {
    /// Start the MCP server (stdio or HTTP transport).
    Serve {
        /// Use stdio transport (for local AI agents such as Claude Desktop).
        #[arg(long, default_value_t = false)]
        stdio: bool,
        /// Restrict to read-only tool calls.
        #[arg(long, default_value_t = false)]
        readonly: bool,
        /// HTTP port (used when --stdio is not set).
        #[arg(long)]
        port: Option<u16>,
    },
    /// Manage MCP API tokens.
    Tokens {
        #[command(subcommand)]
        cmd: McpTokensCmd,
    },
    /// List active MCP sessions.
    Sessions,
    /// Show recent MCP tool invocations from the audit log.
    Audit {
        /// Number of entries to show.
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
}

#[derive(Debug, Subcommand)]
enum McpTokensCmd {
    /// List all MCP tokens.
    List,
    /// Create a new MCP token.
    Create {
        /// Human-readable name for the token.
        #[arg(long)]
        name: String,
        /// Permission scope (e.g. `mcp:read`).
        #[arg(long, default_value = "mcp:read")]
        scope: String,
        /// Token lifetime in days.
        #[arg(long, default_value_t = 90)]
        expires_days: u32,
    },
    /// Revoke an existing MCP token.
    Revoke {
        /// Token ID to revoke.
        token_id: String,
    },
}

// ---------------------------------------------------------------------------
// Setup subcommands (new — task 2.1)
// ---------------------------------------------------------------------------

#[derive(Debug, Subcommand)]
enum SetupCmd {
    /// Print the one-time setup URL (valid 30 minutes after install).
    ///
    /// Visit the URL to complete the initial owner-account wizard.
    /// Afterwards run `tundra setup create-owner` to finalize.
    PrintLink,

    /// Stub: create the initial owner account after visiting the setup URL.
    CreateOwner,
}

// ---------------------------------------------------------------------------
// Master-key subcommands (new — task 2.2.2)
// ---------------------------------------------------------------------------

#[derive(Debug, Subcommand)]
enum MasterKeyCmd {
    /// Re-encrypt all encrypted columns under a new master key.
    ///
    /// Run during a maintenance window with tundrad stopped:
    ///
    ///   sudo systemctl stop tundrad
    ///   sudo -u tundra tundra master-key rotate \
    ///       --new-key-path /var/lib/tundra/data/master.key.new \
    ///       --backup-old
    Rotate {
        /// Path for the new master key file (32 raw bytes).
        /// Defaults to /var/lib/tundra/data/master.key.new.
        #[arg(long)]
        new_key_path: Option<PathBuf>,

        /// Keep a timestamped copy of the old key before replacing it.
        #[arg(long, default_value_t = false)]
        backup_old: bool,

        /// Resume an interrupted rotation using key_rotation_state.
        #[arg(long, default_value_t = false)]
        resume: bool,
    },

    /// Verify the active master key can decrypt a sample of encrypted rows.
    Verify,
}

// ---------------------------------------------------------------------------
// Agent subcommands (new — task 2.2.3)
// ---------------------------------------------------------------------------

#[derive(Debug, Subcommand)]
enum AgentCmd {
    /// Agent certificate management.
    Cert {
        #[command(subcommand)]
        cmd: AgentCertCmd,
    },
}

#[derive(Debug, Subcommand)]
enum AgentCertCmd {
    /// List all agent certificates and their expiry status.
    List,

    /// Force-issue a new mTLS certificate for an agent.
    Issue {
        /// Hostname of the server whose agent cert should be reissued.
        server: String,

        /// Revoke the existing certificate as part of issuing the new one.
        #[arg(long, default_value_t = false)]
        revoke_existing: bool,
    },

    /// Rotate the Tundra internal CA (use only if CA key is compromised).
    RotateCa,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let db = cli.database_url.as_str();

    match cli.command {
        // ------------------------------------------------------------------
        // Acceptance (pre-existing)
        // ------------------------------------------------------------------
        Command::Acceptance {
            sub:
                AcceptanceCommand::Run {
                    section,
                    url,
                    token,
                },
        } => {
            let runner = acceptance::AcceptanceRunner::new(url, token);
            let results = runner.run(&section).await;
            acceptance::print_report(&results);
        }

        // ------------------------------------------------------------------
        // MCP
        // ------------------------------------------------------------------
        Command::Mcp { cmd } => {
            let mcp_cmd = match cmd {
                McpCmd::Serve {
                    stdio,
                    readonly,
                    port,
                } => mcp::McpCommand::Serve {
                    stdio,
                    readonly,
                    port,
                },
                McpCmd::Tokens {
                    cmd: McpTokensCmd::List,
                } => mcp::McpCommand::Tokens(mcp::TokensCommand::List),
                McpCmd::Tokens {
                    cmd:
                        McpTokensCmd::Create {
                            name,
                            scope,
                            expires_days,
                        },
                } => mcp::McpCommand::Tokens(mcp::TokensCommand::Create {
                    name,
                    scope,
                    expires_days,
                }),
                McpCmd::Tokens {
                    cmd: McpTokensCmd::Revoke { token_id },
                } => mcp::McpCommand::Tokens(mcp::TokensCommand::Revoke { token_id }),
                McpCmd::Sessions => mcp::McpCommand::Sessions,
                McpCmd::Audit { limit } => mcp::McpCommand::Audit { limit },
            };
            mcp::run(mcp_cmd)?;
        }

        // ------------------------------------------------------------------
        // Setup
        // ------------------------------------------------------------------
        Command::Setup { cmd } => match cmd {
            SetupCmd::PrintLink => setup_print_link(),
            SetupCmd::CreateOwner => {
                println!("==> tundra setup create-owner");
                println!("(Stub) Visit the setup URL first, then run this command.");
                println!("      The live implementation reads the pending setup token from");
                println!("      the database and creates the owner account.");
            }
        },

        // ------------------------------------------------------------------
        // Master key
        // ------------------------------------------------------------------
        Command::MasterKey { cmd } => match cmd {
            MasterKeyCmd::Rotate {
                new_key_path,
                backup_old,
                resume,
            } => {
                master_key::rotate(master_key::RotateArgs {
                    new_key_path,
                    backup_old,
                    resume,
                    database_url: db.to_string(),
                })
                .await?;
            }
            MasterKeyCmd::Verify => {
                master_key::verify(db).await?;
            }
        },

        // ------------------------------------------------------------------
        // Agent
        // ------------------------------------------------------------------
        Command::Agent { cmd } => match cmd {
            AgentCmd::Cert { cmd } => match cmd {
                AgentCertCmd::List => {
                    agent_cert::list(db).await?;
                }
                AgentCertCmd::Issue {
                    server,
                    revoke_existing,
                } => {
                    agent_cert::issue(&server, revoke_existing, db).await?;
                }
                AgentCertCmd::RotateCa => {
                    agent_cert::rotate_ca(db).await?;
                }
            },
        },
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

/// Print the one-time setup URL with a stub token.
///
/// The stub generates a random UUIDv4 as the placeholder token.  The live
/// implementation queries the `setup_tokens` table via the tundrad API and
/// returns the real, time-limited token written during `tundrad migrate`.
fn setup_print_link() {
    let token = uuid::Uuid::new_v4();
    let public_url =
        std::env::var("TUNDRA_PUBLIC_URL").unwrap_or_else(|_| "http://localhost:7400".to_string());

    println!("Setup URL: {public_url}/setup?token={token}");
    println!("(Run `tundra setup create-owner` after visiting this URL)");
}
