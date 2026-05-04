import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/settings/mcp')({
  component: McpSettingsPage,
})

function McpSettingsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold">AI Agents (MCP)</h1>
      <p className="mb-6 text-sm text-tundra-ink-500">
        Connect AI agents — Claude Desktop, Claude Code, Cursor, Zed — to your Tundra panel via
        the Model Context Protocol.
      </p>

      <div className="mb-6 rounded-lg border border-tundra-ink-200 bg-tundra-ink-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">HTTP endpoint: </span>
            <span className="font-mono text-tundra-aurora">/mcp</span>
          </div>
          <span className="rounded bg-tundra-lichen-100 px-2 py-0.5 text-xs font-medium text-tundra-lichen-800">
            active
          </span>
        </div>
        <p className="mt-1 text-tundra-ink-400">
          Protocol: MCP 2025-03-26 (Streamable HTTP + stdio)
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
          Tokens
        </h2>
        <Button size="sm">+ Create token</Button>
      </div>

      <div className="mb-8 rounded-lg border border-tundra-ink-200 p-6 text-center text-sm text-tundra-ink-400">
        No MCP tokens yet. Create a token to connect an AI agent.
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-tundra-ink-400">
          Quick connect
        </h2>
      </div>

      <div className="space-y-3">
        <ConnectCard
          title="Claude Desktop"
          snippet={`{\n  "mcpServers": {\n    "tundra": {\n      "command": "tundra",\n      "args": ["mcp", "serve", "--stdio", "--readonly"],\n      "env": { "TUNDRA_API_TOKEN": "ttok_readonly_..." }\n    }\n  }\n}`}
        />
        <ConnectCard
          title="Claude Code"
          snippet={`claude mcp add tundra --command tundra --args "mcp serve --stdio --readonly" \\\n  --env "TUNDRA_API_TOKEN=ttok_readonly_..."`}
        />
        <ConnectCard
          title="Cursor / Zed"
          snippet={`Add Tundra as an MCP server with command: tundra\nArgs: mcp serve --stdio --readonly\nEnv: TUNDRA_API_TOKEN=ttok_readonly_...`}
        />
      </div>
    </div>
  )
}

function ConnectCard({ title, snippet }: { title: string; snippet: string }) {
  return (
    <div className="rounded-lg border border-tundra-ink-200 p-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <pre className="overflow-x-auto rounded bg-tundra-ink-900 p-3 text-xs text-tundra-ink-100">
        {snippet}
      </pre>
    </div>
  )
}
