# AI agent setup

Give your AI agent the ability to pay for paywalled content. Paperwall integrates with AI assistants through two methods: an MCP server (recommended) or an agent skill. Both let agents fetch articles behind paywalls using cryptocurrency micropayments -- no browser needed.

---

## Choose your integration method

**[MCP server](mcp-server-guide.md) (Recommended)** -- The AI calls Paperwall tools directly via the MCP protocol. Richer integration with native tool calls and live resources (wallet balance, budget status, payment history). Works with Claude Code, Cursor, Windsurf, Claude Desktop, Codex, OpenCode, Gemini CLI, and any MCP-compatible client.

**Agent skill (this page)** -- The AI reads a skill file and shells out to the `paperwall` CLI. Use this for clients without MCP support, or if you prefer a simpler CLI-based integration.

If your client supports MCP, see the **[MCP server guide](mcp-server-guide.md)** instead.

---

## Quick setup (skill-based)

**Try instantly with npx (zero install):**

```bash
npx @kobaru/paperwall --help
```

**Or install globally:**

```bash
npm install -g @kobaru/paperwall
```

**Full guided setup** (recommended -- walks you through wallet, budget, and AI client integration):

```bash
paperwall setup
```

The setup wizard walks you through choosing your AI client and integration method (MCP or skill), setting up a wallet, and configuring a budget. The steps below describe the skill-based path.

---

## What the setup wizard does

### Step 1: Choose your AI client

The installer shows a single list of all supported clients and integration methods.

**MCP options (recommended):** Writes the server configuration to your client's config file (Claude Code, Cursor, Windsurf, Codex, OpenCode, Claude Desktop, Gemini CLI, or Antigravity). See the [MCP server guide](mcp-server-guide.md) for details.

**Skill options:** Links your AI agent's skill directory to the skill definition inside the repo:

- **Gemini CLI:** `~/.gemini/skills/paperwall` → `packages/agent/skills/paperwall/`
- **Claude Code:** `~/.claude/skills/paperwall` → `packages/agent/skills/paperwall/`

On macOS/Linux the installer creates a symlink; on Windows it creates a directory junction. Either way, the skill stays up to date whenever you pull the latest code. The skill file teaches the AI agent when and how to invoke the `paperwall` CLI -- no special API integration is needed.

### Step 3: Wallet setup

A wallet is required to make payments. The installer gives you three options:

**Create a new wallet (recommended for most users)**

Generates a fresh Ethereum keypair dedicated to micropayments. The private key is encrypted with machine-bound encryption (PBKDF2 600k iterations + AES-256-GCM, keyed to your hostname and user ID) and stored at `~/.paperwall/wallet.json`. No password is needed -- the wallet auto-decrypts on the same machine for the same user.

After creation, you need to fund the wallet by sending USDC to its address on the SKALE network:

```bash
paperwall wallet address   # get your address
paperwall wallet balance   # check balance after funding
```

**Import an existing key (for users migrating from another machine)**

If you already have a dedicated micropayment key, you can import it. The installer encrypts it with the same machine-bound encryption -- the plaintext key is not stored.

> **Warning:** Never import your main wallet. The agent makes automated payments on your behalf -- AI assistants can trigger transactions without manual approval. Always use a dedicated wallet funded with only the amount you intend to spend (e.g., $5-$50 USDC).

**Skip (configure later)**

You can skip wallet setup and configure it later with `paperwall wallet create` or by setting the `PAPERWALL_PRIVATE_KEY` environment variable. The agent will exit with code 3 if you try to fetch paywalled content without a wallet.

### Step 4: Budget configuration

The budget system is a hard gate that automatically approves or declines payments. The installer prompts for three limits:

- **Per-request** -- Maximum USDC for a single payment (e.g., `0.10`)
- **Daily** -- Maximum USDC per calendar day, resets at midnight UTC (e.g., `1.00`)
- **Total** -- Lifetime spending cap (e.g., `10.00`)

All three are optional. Any limit you set acts as a hard cap -- the agent declines payments that would exceed it. You can adjust limits later with `paperwall budget set`. See the [agent CLI guide](agent-cli-guide.md#budget-commands) for details.

---

## Using the skill

Once installed, your AI agent can access paywalled content by invoking the Paperwall skill:

**With Claude Code:**
```
I need to read this paywalled article: https://example.com/premium-article
Use the paperwall skill to fetch it (max price: $0.10)
```

**With Gemini CLI:**
```
Research the impact of micropayments on digital journalism.
Use the paperwall skill to access any paywalled articles you discover.
Your budget is $5.00 for this research session.
Synthesize your findings into a brief report.
```

The AI agent will automatically invoke the skill, which handles the payment and returns the content.

For direct CLI usage outside of AI agents (scripts, CI pipelines, etc.), see the [agent CLI guide](agent-cli-guide.md).

---

## Troubleshooting

### Gemini CLI does not call the agent

- Ensure the agent CLI is in your PATH (`which paperwall` on macOS/Linux, `Get-Command paperwall` on Windows)
- Verify the skill link exists: `ls -la ~/.gemini/skills/paperwall` (or check `%USERPROFILE%\.gemini\skills\paperwall` on Windows)
- If missing, re-run the installer and choose Gemini CLI
- Check Gemini CLI logs for tool discovery messages

### Claude Code does not call the agent

- Verify the skill link exists: `ls -la ~/.claude/skills/paperwall` (or check `%USERPROFILE%\.claude\skills\paperwall` on Windows)
- If missing, re-run the installer and choose Claude Code
- Try mentioning "paperwall" explicitly in your prompt

### "No wallet configured" (exit code 3)

The agent does not have a wallet. Either:
- Run `paperwall wallet create` to generate a new one
- Run `paperwall wallet import --key 0x<hex>` to import an existing key
- Set `PAPERWALL_PRIVATE_KEY=0x<hex>` as an environment variable

---

## Related documentation

- [MCP server guide](mcp-server-guide.md) -- MCP integration for Claude Code, Cursor, Windsurf, Codex, OpenCode, Claude Desktop, Gemini CLI, Antigravity
- [How Paperwall works](how-it-works.md) -- Conceptual overview of paywalls and payment flow
- [Agent CLI guide](agent-cli-guide.md) -- Full CLI reference (wallet, budget, fetch, history commands)
- [A2A server guide](a2a-server-guide.md) -- Run Paperwall as a server for other AI agents
