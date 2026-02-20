# MCP server guide

Paperwall's MCP (Model Context Protocol) server lets AI assistants call Paperwall tools directly -- no shell-outs or skill files needed. The assistant gets native access to fetch paywalled content, manage budgets, and check wallet status through structured tool calls and live resources.

MCP is the recommended integration method for any client that supports it: Claude Code, Cursor, Windsurf, Claude Desktop, OpenCode, Codex, Gemini CLI, Antigravity, and others.

---

## Table of Contents

- [How it works](#how-it-works)
- [MCP vs skill-based integration](#mcp-vs-skill-based-integration)
- [Getting started](#getting-started)
  - [1. Build the CLI](#1-build-the-cli)
  - [2. Create a wallet](#2-create-a-wallet)
  - [3. Set spending limits](#3-set-spending-limits)
  - [4. Configure your MCP client](#4-configure-your-mcp-client)
- [Client configuration](#client-configuration)
  - [Claude Code](#claude-code)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Codex](#codex)
  - [OpenCode](#opencode)
  - [Claude Desktop](#claude-desktop)
  - [Gemini CLI](#gemini-cli)
  - [Antigravity](#antigravity)
  - [Other MCP clients](#other-mcp-clients)
- [Usage](#usage)
  - [Example prompts](#example-prompts)
  - [Verifying the connection](#verifying-the-connection)
- [Tools reference](#tools-reference)
  - [`fetch_url`](#fetch_url)
  - [`set_budget`](#set_budget)
- [Resources reference](#resources-reference)
  - [`paperwall://wallet/info`](#paperwallwalletinfo)
  - [`paperwall://wallet/balance`](#paperwallwalletbalance)
  - [`paperwall://budget/status`](#paperwallbudgetstatus)
  - [`paperwall://history/recent`](#paperwallhistoryrecent)
- [Error codes](#error-codes)
- [CLI reference](#cli-reference)
- [Automated install](#automated-install)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

---

## How it works

The MCP server runs as a subprocess of your AI assistant, communicating over stdio (standard input/output). The assistant sends JSON-RPC 2.0 requests, and the server responds with tool results or resource data.

1. **Startup** -- Your MCP client launches `node /path/to/cli.js mcp` as a child process. The server validates that a wallet exists, registers its tools and resources, and begins listening on stdin.

2. **Discovery** -- The client queries the server for available tools and resources. Paperwall exposes 2 tools (`fetch_url`, `set_budget`) and 4 resources (wallet info, balance, budget status, payment history).

3. **Tool calls** -- When the AI assistant needs to access paywalled content, it calls `fetch_url` with a URL and optional max price. The server handles payment detection, budget checks, EIP-712 signing, and on-chain settlement automatically.

4. **Resources** -- The assistant can read wallet balance, budget status, and payment history at any time as live context, without requiring a tool call.

All payments settle on the SKALE network with ultra-low fees. The full payment amount goes to the publisher.

---

## MCP vs skill-based integration

Paperwall supports two integration methods. MCP is recommended when your client supports it.

| | MCP server | Agent skill |
|---|---|---|
| **How it works** | AI calls tools directly via structured protocol | AI reads a skill file and shells out to CLI |
| **Tools** | `fetch_url`, `set_budget` as native tool calls | `paperwall fetch`, `paperwall budget set` via bash |
| **Live context** | Wallet balance, budget status, payment history as resources | AI must run CLI commands to check status |
| **Error handling** | Structured error codes (`budget_exceeded`, `no_wallet`) | AI parses JSON from stdout + exit codes |
| **Clients** | Claude Code, Cursor, Windsurf, Claude Desktop, Codex, OpenCode, Gemini CLI, Antigravity | Clients without MCP support |

**Use MCP** if your client supports it. **Use the agent skill** for clients without MCP support. See the [AI agent setup guide](ai-agent-setup.md) for skill-based installation.

---

## Getting started

### 1. Build the CLI

```bash
git clone https://github.com/kobaru/paperwall.git
cd paperwall
npm install
npm run build
```

After building, the CLI is at `packages/agent/dist/cli.js`.

### 2. Create a wallet

```bash
node packages/agent/dist/cli.js wallet create
```

This generates a fresh keypair, encrypts it with machine-bound encryption (PBKDF2 + AES-256-GCM keyed to hostname and user ID), and stores it at `~/.paperwall/wallet.json`. No password needed -- the wallet auto-decrypts on the same machine.

Fund the wallet by sending USDC to its address on the SKALE network:

```bash
node packages/agent/dist/cli.js wallet address   # get your address
node packages/agent/dist/cli.js wallet balance    # check balance after funding
```

### 3. Set spending limits

```bash
node packages/agent/dist/cli.js budget set --per-request 0.10 --daily 5.00 --total 50.00
```

All limits are optional but recommended. They act as hard gates -- payments that exceed any limit are automatically declined.

### 4. Configure your MCP client

Add Paperwall to your MCP client's configuration. See [client configuration](#client-configuration) below for your specific client, or use the [automated installer](#automated-install).

---

## Client configuration

Each MCP client stores its server configuration in a different location and format. Below are the configurations for supported clients.

In all examples, replace `/absolute/path/to/packages/agent/dist/cli.js` with the actual absolute path to the built CLI on your machine.

### Claude Code

**Config file:** `~/.claude/mcp.json`

```json
{
  "mcpServers": {
    "paperwall": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

If the file already exists, add the `"paperwall"` entry under `"mcpServers"`.

### Cursor

**Config file:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "paperwall": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

### Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "paperwall": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

### Codex

**Config file:** `~/.codex/config.toml`

Codex uses TOML format:

```toml
[mcp_servers.paperwall]
command = "node"
args = ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
```

If the file already exists, append this block at the end.

### OpenCode

**Config file:** `~/.config/opencode/opencode.json`

OpenCode uses a different JSON structure:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "paperwall": {
      "type": "local",
      "command": ["node", "/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

Note: OpenCode uses `"mcp"` (not `"mcpServers"`) and `"command"` is an array (not a string).

### Claude Desktop

**Config file (macOS):** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Config file (Linux):** `~/.config/Claude/claude_desktop_config.json`
**Config file (Windows):** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "paperwall": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

Restart Claude Desktop after editing the config file.

### Gemini CLI

**Config file:** `~/.gemini/settings.json`

```json
{
  "mcpServers": {
    "paperwall": {
      "command": "node",
      "args": ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

If the file already exists, add the `"paperwall"` entry under `"mcpServers"`. Other settings in the file are preserved.

You can also configure it at the project level in `.gemini/settings.json` at the root of your repository.

### Antigravity

**Config file:** `~/.gemini/antigravity/mcp_config.json`

```json
{
  "mcpServers": {
    "paperwall": {
      "command": "node",
      "args": ["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]
    }
  }
}
```

You can also edit this file through the Antigravity UI: open the agent pane, click the ellipsis menu, select "MCP Servers", then "Manage MCP Servers", and click "View raw config".

### Other MCP clients

For any MCP client that supports stdio transport, configure a server with:

- **Command:** `node`
- **Arguments:** `["/absolute/path/to/packages/agent/dist/cli.js", "mcp"]`
- **Transport:** stdio

---

## Usage

After configuring your MCP client, you can ask your AI assistant to fetch paywalled content, manage budgets, and check wallet status using natural language.

### Example prompts

Most AI assistants have a built-in web fetch capability. If you simply ask "read this URL for me", the assistant will likely use its own fetch tool instead of Paperwall's -- and it won't be able to pay for paywalled content. To make sure the assistant uses Paperwall, mention the tool name, the paywall, or Paperwall itself in your prompt.

**Fetching content:**

```
Use the fetch_url tool to read and summarize this article: https://example.com/premium-article
```

```
This article is paywalled. Use Paperwall to fetch it and give me the key points: https://example.com/premium-article
```

```
Fetch https://example.com/premium-article using Paperwall's fetch_url tool. I'm willing to pay up to $0.10.
```

**Managing budgets:**

```
Set my Paperwall budget to $0.10 per request and $5.00 per day.
```

```
Use the set_budget tool to set a total spending limit of $50.
```

**Checking status:**

```
What's my Paperwall wallet balance?
```

```
Show me my recent Paperwall payment history.
```

### Verifying the connection

Before fetching content, confirm that the MCP server is connected by asking your assistant:

```
What Paperwall tools do you have available?
```

The assistant should list `fetch_url` and `set_budget`. If it doesn't recognize them, the MCP server isn't connected -- check the [troubleshooting](#troubleshooting) section.

---

## Tools reference

The MCP server exposes 2 tools.

### `fetch_url`

Fetch web content from a URL, automatically handling payment if the content is paywalled. Supports HTTP 402 (x402 protocol), client-mode (direct facilitator settlement), and server-mode (publisher-mediated settlement).

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The URL to fetch |
| `maxPrice` | string | No | Maximum USDC willing to pay (e.g., `"0.10"`). If omitted, uses the per-request budget limit. |

**Annotations:** `destructiveHint: true` (triggers payments), `idempotentHint: false` (each call may make a new payment), `openWorldHint: true` (contacts external servers).

**Success response:**

```json
{
  "ok": true,
  "url": "https://example.com/article",
  "statusCode": 200,
  "contentType": "text/html",
  "content": "<html>...full article content...</html>",
  "payment": {
    "mode": "client",
    "amount": "50000",
    "amountFormatted": "0.05",
    "network": "eip155:324705682",
    "txHash": "0xabc123...",
    "payee": "0xdef456..."
  },
  "receipt": {
    "id": "receipt-uuid",
    "ap2Stage": "settled"
  }
}
```

When the content is free (no paywall), `payment` is `null` and `receipt.ap2Stage` is `"intent"`.

**Error response:**

```json
{
  "ok": false,
  "error": "budget_exceeded",
  "message": "Daily budget exceeded",
  "url": "https://example.com/article"
}
```

Errors set `isError: true` on the MCP result. See [error codes](#error-codes) for the full list.

### `set_budget`

Set spending limits for Paperwall payments. At least one limit must be provided. Limits persist across sessions in `~/.paperwall/budget.json`.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `perRequest` | string | No | Max USDC per single payment (e.g., `"0.10"`) |
| `daily` | string | No | Max USDC per day, resets at midnight UTC (e.g., `"5.00"`) |
| `total` | string | No | Max USDC lifetime, never resets (e.g., `"50.00"`) |

**Annotations:** `destructiveHint: false`, `idempotentHint: true` (same input produces same config).

**Success response:**

```json
{
  "ok": true,
  "budget": {
    "perRequest": "0.10",
    "daily": "5.00",
    "total": "50.00"
  },
  "message": "Budget updated successfully"
}
```

**Error response** (no limits provided):

```json
{
  "ok": false,
  "error": "invalid_input",
  "message": "At least one limit must be provided: perRequest, daily, or total"
}
```

---

## Resources reference

The MCP server exposes 4 read-only resources. All return JSON.

### `paperwall://wallet/info`

Wallet address and configured network.

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
  "network": "eip155:324705682",
  "networkName": "SKALE Base Sepolia"
}
```

Returns `{"error": "no_wallet", "message": "..."}` if no wallet is configured.

### `paperwall://wallet/balance`

Current USDC balance on the configured network. Queries the blockchain in real time.

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28",
  "balance": "12.50",
  "currency": "USDC",
  "network": "eip155:324705682"
}
```

Returns `{"error": "rpc_error", "message": "..."}` on RPC failure, `{"error": "no_wallet", "message": "..."}` if no wallet.

### `paperwall://budget/status`

Current budget limits, spending totals, and remaining amounts.

```json
{
  "configured": true,
  "limits": {
    "perRequest": "0.10",
    "daily": "5.00",
    "total": "50.00"
  },
  "spending": {
    "today": "2.30",
    "lifetime": "15.75"
  },
  "remaining": {
    "daily": "2.70",
    "total": "34.25"
  }
}
```

Remaining values are clamped to `"0.00"` if spending exceeds the limit. Returns `{"configured": false, "message": "..."}` if no budget is set.

### `paperwall://history/recent`

Last 20 payment transactions.

```json
{
  "count": 2,
  "entries": [
    {
      "ts": "2026-02-19T10:30:00Z",
      "url": "https://example.com/article-1",
      "amount": "50000",
      "amountFormatted": "0.05",
      "asset": "USDC",
      "network": "eip155:324705682",
      "txHash": "0xabc123...",
      "mode": "client"
    },
    {
      "ts": "2026-02-19T10:25:00Z",
      "url": "https://example.com/article-2",
      "amount": "100000",
      "amountFormatted": "0.10",
      "asset": "USDC",
      "network": "eip155:324705682",
      "txHash": "0xdef456...",
      "mode": "402"
    }
  ]
}
```

The `mode` field indicates the payment flow: `client` (facilitator direct), `server` (publisher endpoint), or `402` (HTTP 402 flow).

---

## Error codes

All tool errors set `isError: true` on the MCP result and return a JSON payload with `ok: false`.

| Code | Meaning | Retryable? | Action |
|------|---------|------------|--------|
| `budget_exceeded` | A spending limit was hit | No | Increase budget with `set_budget` |
| `max_price_exceeded` | URL costs more than `maxPrice` | No | Increase `maxPrice` parameter |
| `no_wallet` | No wallet at `~/.paperwall/wallet.json` | No | Run `paperwall wallet create` |
| `no_budget` | No budget set and no `maxPrice` given | No | Set budget or provide `maxPrice` |
| `payment_error` | Payment signing or settlement failed | Maybe | Transient -- retry once |
| `settle_failed` | Facilitator settlement failed | Maybe | Transient -- retry once |
| `network_error` | HTTP fetch or RPC failed | Maybe | Check connectivity |
| `invalid_input` | Invalid tool parameters | No | Fix the input |

---

## CLI reference

The `paperwall mcp` command starts the MCP server on stdio.

```bash
paperwall mcp [--network <caip2>]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --network <caip2>` | Blockchain network in CAIP-2 format | Network from wallet (or `eip155:324705682`) |

The command validates that a wallet exists before starting. If no wallet is found, it exits with code 3.

**Environment variables:**

| Variable | Purpose |
|----------|---------|
| `PAPERWALL_PRIVATE_KEY` | Private key (bypasses wallet file, for CI/automation) |
| `PAPERWALL_NETWORK` | Default network (overridden by `--network` flag) |

---

## Automated install

The install script handles downloading, building, wallet setup, budget configuration, and MCP client configuration in one step.

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.ps1 | iex
```

**From source** (if you already cloned the repo):

```bash
git clone https://github.com/kobaru-io/paperwall.git
cd paperwall
npm install
bash packages/agent/install.sh       # macOS / Linux
# pwsh packages/agent/install.ps1    # Windows
```

The installer prompts you to choose your AI client (Claude Code, Cursor, Windsurf, Codex, OpenCode, Claude Desktop, Gemini CLI, Antigravity, or print config for other clients). Both MCP and skill-based options are available in a single list.

The installer:
1. Builds the CLI and installs it (`~/.local/bin/paperwall` on Unix, `%USERPROFILE%\.local\bin\paperwall.cmd` on Windows)
2. Writes the MCP config to the appropriate file for your client
3. Adds Paperwall instructions to your client's global instructions file (Claude Code: `~/.claude/CLAUDE.md`, Codex: `~/.codex/AGENTS.md`, Gemini CLI / Antigravity: `~/.gemini/GEMINI.md`). This tells the AI assistant to prefer Paperwall's `fetch_url` tool over any built-in web fetch when accessing URLs.
4. Walks you through wallet creation (machine-bound encryption, no password)
5. Prompts for spending limits (per-request, daily, total)

For clients with existing config files, the Unix installer merges the Paperwall entry using `jq` (JSON clients) or appends the TOML block (Codex). If `jq` is not installed and the config file already exists, it prints the snippet for manual copy-paste. The Windows installer uses PowerShell's native `ConvertFrom-Json`/`ConvertTo-Json` -- no external tools needed.

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| MCP server not starting | No wallet configured | Run `paperwall wallet create` |
| MCP server not starting | Wrong path in config | Verify the path in your MCP config points to the actual `dist/cli.js` file |
| Tool not appearing in AI assistant | MCP config not loaded | Restart your MCP client after editing the config file |
| `fetch_url` returns `no_wallet` | Wallet missing or env var not set | Run `paperwall wallet create` or set `PAPERWALL_PRIVATE_KEY` |
| `fetch_url` returns `budget_exceeded` | Spending limit hit | Use `set_budget` tool or run `paperwall budget set` with higher limits |
| `fetch_url` returns `no_budget` | No budget set and no `maxPrice` | Either set a budget first or pass `maxPrice` in the tool call |
| Balance resource shows error | RPC node unreachable | Check internet connection; SKALE RPC may be temporarily down |
| Codex shows "invalid TOML" | Syntax error in `config.toml` | Check for mismatched quotes or brackets in `~/.codex/config.toml` |
| OpenCode ignores the server | Wrong JSON structure | Ensure you use `"mcp"` key (not `"mcpServers"`) and `"command"` as array |
| Gemini CLI ignores the server | Config not in right file | Ensure `~/.gemini/settings.json` has `"mcpServers"` key (not `"mcp"`) |

---

## Related documentation

- [How Paperwall works](how-it-works.md) -- Plain-language overview of paywalls and payment flow
- [AI agent setup](ai-agent-setup.md) -- Skill-based setup for Gemini CLI and Claude Code
- [Agent CLI guide](agent-cli-guide.md) -- Full CLI reference (wallet, budget, fetch, history commands)
- [A2A server guide](a2a-server-guide.md) -- Run Paperwall as an A2A server for other AI agents
- [Architecture deep dive](architecture.md) -- Full system architecture, payment flows, and security model
