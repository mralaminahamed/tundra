pub mod acceptance;
pub mod mcp;

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(name = "tundra", version, about = "Tundra operator CLI")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Run acceptance checks against a Tundra control plane.
    Acceptance {
        #[command(subcommand)]
        sub: AcceptanceCommand,
    },
}

#[derive(Subcommand, Debug)]
enum AcceptanceCommand {
    /// Run acceptance checks.
    Run {
        /// Which section to run (smoke, identity, enroll, site, deploy, databases, mail, backups,
        /// all).
        #[arg(long, default_value = "all")]
        section: acceptance::Section,

        /// Base URL of the Tundra control plane (e.g. https://panel.example.com).
        #[arg(long, default_value = "http://localhost:7400")]
        url: String,

        /// Bearer token for authenticated checks.
        #[arg(long, env = "TUNDRA_API_TOKEN")]
        token: Option<String>,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
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
    }

    Ok(())
}
