# Agent CLI guide

The Paperwall Agent CLI is a command-line tool that lets AI agents (and humans) pay for access to paywalled web content using cryptocurrency micropayments. It works headlessly -- no browser required.

> **New here?** Read [How Paperwall works](how-it-works.md) for a plain-language overview.
> **Setting up MCP?** See the [MCP server guide](mcp-server-guide.md) for Claude Code, Cursor, Windsurf, Codex, OpenCode, Claude Desktop.
> **Setting up a skill?** See the [AI agent setup guide](ai-agent-setup.md) for Gemini CLI and skill-based integration.
> **Running an A2A server?** See the [A2A server guide](a2a-server-guide.md) for the Agent-to-Agent protocol server.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [With npx](#with-npx-recommended-zero-install)
  - [Global install](#global-install)
  - [Full guided setup](#full-guided-setup)
  - [From source](#from-source)
  - [With Docker](#with-docker)
- [Quick start](#quick-start)
- [Wallet commands](#wallet-commands)
  - [Create a wallet](#create-a-wallet)
  - [Import an existing key](#import-an-existing-key)
  - [Wallet info](#wallet-info)
  - [Migrate storage backend](#migrate-storage-backend)
  - [Check balance](#check-balance)
  - [Show address](#show-address)
- [Budget commands](#budget-commands)
  - [Set budget limits](#set-budget-limits)
  - [Check budget status](#check-budget-status)
  - [How budget checks work](#how-budget-checks-work)
- [Fetch command](#fetch-command)
  - [Successful fetch with payment](#successful-fetch-with-payment)
  - [Successful fetch without payment](#successful-fetch-without-payment)
  - [Payment declined](#payment-declined)
  - [Payment detection](#payment-detection)
- [History command](#history-command)
- [Output format](#output-format)
- [Exit codes](#exit-codes)
- [Environment variables](#environment-variables)
  - [Key resolution priority](#key-resolution-priority)
- [Supported networks](#supported-networks)
- [Data storage](#data-storage)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)

---

## Prerequisites

- **Node.js 18 or newer** -- check with `node --version`
- **A terminal** -- any OS (Windows, Mac, Linux)

---

## Installation

### With npx (recommended, zero install)

```bash
npx @kobaru/paperwall --help
```

### Global install

```bash
npm install -g @kobaru/paperwall
paperwall --help
```

### Full guided setup

The installer walks you through wallet creation, budget configuration, and AI client integration (MCP or skill):

```bash
curl -fsSL https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.sh | bash
```

### From source

```bash
git clone https://github.com/kobaru/paperwall.git
cd paperwall
npm install
npm run build
```

After building, the CLI is at `packages/agent/dist/cli.js`. You can run it directly:

```bash
node packages/agent/dist/cli.js --help
```

Or link it globally for convenience:

```bash
npm link --workspace=@kobaru/paperwall
paperwall --help
```

### With Docker

```bash
docker build -t paperwall packages/agent/
docker run paperwall --help
```

See the [A2A server guide](a2a-server-guide.md#docker-deployment) for full Docker production setup including volumes and access control.

---

## Quick start

Set up your wallet, configure a budget, and fetch your first article in under a minute:

```bash
# 1. Create an encrypted wallet (machine-bound, no password needed)
paperwall wallet create

# 2. Fund your wallet with USDC on SKALE testnet
#    (copy your address from the output above, then use a faucet or transfer)

# 3. Check your balance
paperwall wallet balance

# 4. Set spending limits
paperwall budget set --per-request 0.10 --daily 5.00 --total 50.00

# 5. Fetch a paywalled article
paperwall fetch https://example.com/article --max-price 0.05
```

---

## Wallet commands

The agent supports two storage backends for private keys:

| Backend | Where key lives | Protection | Best for |
|---------|----------------|------------|----------|
| **Encrypted file** (default) | `~/.paperwall/wallet.json` (0o600) | PBKDF2 + AES-256-GCM | All platforms |
| **OS keychain** | macOS Keychain, GNOME Keyring, Windows Credential Manager | OS-level access control | Desktop machines with native keychain |

When using the encrypted file backend, three encryption modes are supported:

| Mode | When to use | How it works | Key derivation |
|------|-------------|-------------|-----------------|
| **Password** | MCP CLI (interactive) | User enters password on each session. Password is masked via @inquirer/password. Session caching minimizes re-prompts during a CLI session. | Password + 32-byte random salt via PBKDF2 |
| **Environment-injected** | A2A server (containers, K8s) | Encryption key read from `PAPERWALL_WALLET_KEY` environment variable. Enables deterministic key derivation across pod instances without re-entering passwords. | Base64-encoded 32-byte key from env var |
| **Machine-bound** | Backward compatibility (legacy) | No password needed. Wallet auto-decrypts on the same machine for the same user. Breaks when pod restarts (machine identity changes). | Hostname + user ID + fixed salt via PBKDF2 |

The wallet metadata includes `encryptionMode` field. If missing (legacy wallets), the agent auto-detects as `machine-bound`.

### Create a wallet

```bash
paperwall wallet create [--network <caip2>] [--mode <mode>] [--keychain] [--force]
```

Generates a fresh private key dedicated to micropayments. The key is encrypted with the selected mode and stored locally, or stored in the OS keychain.

**Options:**
- `--network <caip2>` -- Default blockchain network in CAIP-2 format (default: `eip155:324705682`, SKALE testnet)
- `--mode <mode>` -- Encryption mode: `machine-bound` (default), `password`, or `env-injected`. Cannot be combined with `--keychain`.
- `--keychain` -- Store the private key in the OS keychain instead of an encrypted file. Cannot be combined with `--mode`.
- `--force` -- Overwrite an existing wallet (without this flag, the command refuses to overwrite)

**Examples:**

```bash
# Machine-bound (default, no password needed)
paperwall wallet create

# Store in OS keychain (macOS Keychain, GNOME Keyring, Windows Credential Manager)
paperwall wallet create --keychain

# Password mode (interactive, prompted on first use)
paperwall wallet create --mode password

# Environment-injected (for container deployments)
paperwall wallet create --mode env-injected
```

**Output:**
```json
{
  "ok": true,
  "address": "0xAbCd...1234",
  "network": "eip155:324705682",
  "encryptionMode": "password",
  "storagePath": "/home/you/.paperwall/wallet.json"
}
```

Save your address -- you need it to fund the wallet.

### Import an existing key

```bash
paperwall wallet import --key <hex> [--network <caip2>] [--mode <mode>] [--keychain] [--force]
```

Imports an existing private key and encrypts it with the selected mode, or stores it in the OS keychain. The plaintext key is not stored -- only the encrypted form (or keychain entry) is persisted.

**Warning:** Never import your main wallet. This agent makes automated payments on your behalf -- AI assistants can trigger transactions without manual approval. Always use a dedicated wallet funded with only the amount you intend to spend on micropayments.

**Options:**
- `--key <hex>` -- Private key as hex (with or without `0x` prefix, 64 hex characters). Required.
- `--network <caip2>` -- Default blockchain network (default: `eip155:324705682`)
- `--mode <mode>` -- Encryption mode: `machine-bound` (default), `password`, or `env-injected`. Cannot be combined with `--keychain`.
- `--keychain` -- Store the private key in the OS keychain. Cannot be combined with `--mode`.
- `--force` -- Overwrite an existing wallet

**Examples:**

```bash
# Import with machine-bound encryption
paperwall wallet import --key 0x1234...abcd

# Import into OS keychain
paperwall wallet import --key 0x1234...abcd --keychain

# Import with password encryption (interactive)
paperwall wallet import --key 0x1234...abcd --mode password

# Import with environment-injected encryption
paperwall wallet import --key 0x1234...abcd --mode env-injected
```

**Output:** Same format as `wallet create` with `encryptionMode` and `keyStorage` fields.

### Check balance

```bash
paperwall wallet balance [--network <caip2>]
```

Queries the blockchain for your current USDC balance.

**Options:**
- `--network <caip2>` -- Query a specific network (default: network from wallet creation)

**Output:**
```json
{
  "ok": true,
  "address": "0xAbCd...1234",
  "balance": "1000000",
  "balanceFormatted": "1.00",
  "asset": "USDC",
  "network": "eip155:324705682"
}
```

The `balance` field is in smallest units (1 USDC = 1,000,000 smallest units). The `balanceFormatted` field is human-readable.

### Show address

```bash
paperwall wallet address
```

Prints your wallet's public address.

**Output:**
```json
{
  "ok": true,
  "address": "0xAbCd...1234"
}
```

### Wallet info

```bash
paperwall wallet info
```

Shows the current wallet's storage backend and encryption mode.

**Output:**
```json
{
  "ok": true,
  "address": "0xAbCd...1234",
  "keyStorage": "file",
  "encryptionMode": "password"
}
```

The `keyStorage` field is `"file"` (encrypted file) or `"keychain"` (OS keychain). When `keyStorage` is `"keychain"`, the `encryptionMode` is `"none"` (the OS keychain provides its own protection).

### Migrate storage backend

```bash
paperwall wallet migrate to-keychain [--mode <mode>]
paperwall wallet migrate to-file [--mode <mode>]
```

Moves the private key between storage backends. Migration is atomic: the key is written to the new backend, verified, then removed from the old backend. If any step fails, the original is preserved.

**`to-keychain`** -- Moves the key from the encrypted file to the OS keychain. Requires a password if the current encryption mode is `password`.

**`to-file`** -- Moves the key from the OS keychain to an encrypted file.
- `--mode <mode>` -- Encryption mode for the new file: `machine-bound` (default), `password`, or `env-injected`.

**Examples:**

```bash
# Move from encrypted file to OS keychain
paperwall wallet migrate to-keychain

# Move from OS keychain to password-encrypted file
paperwall wallet migrate to-file --mode password
```

**Output:**
```json
{
  "ok": true,
  "from": "file",
  "to": "keychain",
  "address": "0xAbCd...1234"
}
```

---

## Budget commands

The budget system is a hard gate -- the agent declines any payment that exceeds a limit. This replaces the extension's "Approve/Reject" prompt with automated spending controls. Budget config is stored at `~/.paperwall/budget.json`.

### Set budget limits

```bash
paperwall budget set [--per-request <amount>] [--daily <amount>] [--total <amount>]
```

Sets one or more spending limits. All amounts are in USDC. You must provide at least one limit.

**Options:**
- `--per-request <amount>` -- Maximum USDC for a single payment (e.g., `0.10`)
- `--daily <amount>` -- Maximum USDC per UTC calendar day (resets at midnight UTC) (e.g., `5.00`)
- `--total <amount>` -- Lifetime maximum USDC (e.g., `50.00`)

The command merges new limits with your existing config -- you can update one limit without resetting the others.

**Output:**
```json
{
  "ok": true,
  "budget": {
    "perRequestMax": "0.10",
    "dailyMax": "5.00",
    "totalMax": "50.00"
  }
}
```

### Check budget status

```bash
paperwall budget status
```

Shows current limits, spending totals, and remaining budget.

**Output:**
```json
{
  "ok": true,
  "budget": {
    "perRequestMax": "0.10",
    "dailyMax": "5.00",
    "totalMax": "50.00"
  },
  "spent": {
    "today": "0.25",
    "total": "1.50",
    "transactionCount": 15
  },
  "remaining": {
    "daily": "4.75",
    "total": "48.50"
  }
}
```

### How budget checks work

When a payment is requested, the agent checks limits in this order:

1. **Per-request limit** -- Is this single payment within `perRequestMax`?
2. **`--max-price` flag** -- If provided on the `fetch` command, is the amount within that cap?
3. **Daily limit** -- Would today's total since UTC midnight (including this payment) exceed `dailyMax`?
4. **Lifetime limit** -- Would the lifetime total (including this payment) exceed `totalMax`?

If any check fails, the payment is declined with exit code 2. If no budget is configured and no `--max-price` flag is provided, the payment is also declined.

---

## Fetch command

```bash
paperwall fetch <url> [--max-price <amount>] [--network <caip2>] [--timeout <ms>]
```

Fetches a URL and automatically handles payment if the page is paywalled.

**Arguments:**
- `<url>` -- The URL to fetch (required)

**Options:**
- `--max-price <amount>` -- Maximum USDC to pay for this request (e.g., `0.05`). Overrides per-request budget limit if more restrictive. Required if no budget is configured.
- `--network <caip2>` -- Force a specific blockchain network
- `--timeout <ms>` -- Request timeout in milliseconds (default: `30000`)

### Successful fetch with payment

```json
{
  "ok": true,
  "url": "https://example.com/article",
  "statusCode": 200,
  "contentType": "text/html",
  "content": "<html>...full article content...</html>",
  "payment": {
    "mode": "client",
    "amount": "10000",
    "amountFormatted": "0.01",
    "asset": "USDC",
    "network": "eip155:324705682",
    "txHash": "0xabc123...",
    "payTo": "0x1234...publisher",
    "payer": "0x5678...your-wallet"
  }
}
```

### Successful fetch without payment

If the page has no paywall, the `payment` field is absent:

```json
{
  "ok": true,
  "url": "https://example.com/free-article",
  "statusCode": 200,
  "contentType": "text/html",
  "content": "<html>...article content...</html>"
}
```

### Payment declined

When the amount exceeds budget limits:

```json
{
  "ok": false,
  "error": "budget_exceeded",
  "message": "Daily budget exceeded: spent 4.80 of 5.00 daily limit",
  "url": "https://example.com/article",
  "requestedAmount": "50000",
  "requestedAmountFormatted": "0.05"
}
```

### Payment detection

The agent detects paywalls in this priority order:

| Priority | Signal | Action |
|----------|--------|--------|
| 1 | HTTP 402 response | Uses `@x402/fetch` library to sign and retry |
| 2 | `<meta>` tag, `mode="client"` | Agent calls facilitator `/supported` then `/settle` |
| 3 | `<meta>` tag, `mode="server"` | Agent signs and POSTs to publisher's payment URL |
| 4 | No signal | Returns content as-is (no payment) |

---

## History command

```bash
paperwall history [--last <count>]
```

Shows recent payment history. History is stored as append-only JSONL at `~/.paperwall/history.jsonl`.

**Options:**
- `--last <count>` -- Number of recent entries to show (default: `20`)

**Output:**
```json
{
  "ok": true,
  "payments": [
    {
      "timestamp": "2026-02-11T10:30:00.000Z",
      "url": "https://example.com/article",
      "amount": "10000",
      "amountFormatted": "0.01",
      "asset": "USDC",
      "network": "eip155:324705682",
      "txHash": "0xdef456...",
      "mode": "client"
    }
  ],
  "total": 1
}
```

The `mode` field indicates how the payment was processed: `client` (facilitator direct), `server` (publisher endpoint), or `402` (HTTP 402 flow).

---

## Output format

The agent follows a strict output convention:

- **stdout** -- Valid JSON only. Every command outputs a single JSON object. Parse with `JSON.parse()`.
- **stderr** -- Human-readable log messages. Safe to ignore in scripts.

Always check the `ok` field in the JSON response before processing results.

---

## Exit codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Content fetched and returned |
| 1 | Operational error | Network failure, invalid arguments, facilitator error. May be retried. |
| 2 | Payment declined | Budget exceeded or `--max-price` exceeded. **Do not retry the same URL.** |
| 3 | No wallet | Run `paperwall wallet create` first |

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PAPERWALL_PRIVATE_KEY` | Private key as `0x`-prefixed hex. For automation and CI. Bypasses wallet file entirely. |
| `PAPERWALL_WALLET_KEY` | Base64-encoded 32-byte encryption key for environment-injected wallet mode. For container deployments where wallet is encrypted at rest. |
| `PAPERWALL_NETWORK` | Blockchain network as CAIP-2 ID (default: `eip155:324705682`) |

Server-specific variables (`PAPERWALL_PORT`, `PAPERWALL_HOST`, `PAPERWALL_ACCESS_KEYS`) are documented in the [A2A server guide](a2a-server-guide.md#configuration).

### Key resolution priority

When the agent needs your private key (for `fetch` or `serve`), it tries these sources in order:

1. `PAPERWALL_PRIVATE_KEY` environment variable -- direct key, no wallet file needed (highest priority)
2. OS keychain -- if `wallet.json` has `keyStorage: "keychain"`, retrieves from macOS Keychain / GNOME Keyring / Windows Credential Manager
3. Encrypted wallet file at `~/.paperwall/wallet.json` -- auto-decrypts using detected encryption mode:
   - Machine-bound: derives key from hostname+uid
   - Password: prompts user for password (interactive)
   - Environment-injected: requires `PAPERWALL_WALLET_KEY`

**Examples:**

```bash
# Option 1: Direct key (raw private key in env var)
PAPERWALL_PRIVATE_KEY=0x... paperwall fetch https://example.com/article --max-price 0.05

# Option 2: Environment-injected (wallet file encrypted, key in env var)
PAPERWALL_WALLET_KEY=base64-32-bytes paperwall fetch https://example.com/article --max-price 0.05

# Option 3: Machine-bound (wallet auto-unlocks on same machine)
paperwall fetch https://example.com/article --max-price 0.05

# Option 4: Password mode (interactive prompt)
paperwall fetch https://example.com/article --max-price 0.05
# (prompts for password; cached during session)
```

---

## Supported networks

| Network | CAIP-2 ID | Use |
|---------|-----------|-----|
| SKALE Base Sepolia (testnet) | `eip155:324705682` | Development and testing (default) |
| SKALE Base (mainnet) | `eip155:1187947933` | Production |

Both networks use USDC (6 decimals) with ultra-low gas fees.

---

## Data storage

All data is stored in `~/.paperwall/` with restrictive file permissions:

| File | Permissions | Format | Purpose |
|------|-------------|--------|---------|
| `wallet.json` | `0o600` | JSON | Wallet metadata (address, network, encryption mode, key storage). When `keyStorage` is `"file"`, also contains the encrypted private key. When `keyStorage` is `"keychain"`, the key lives in the OS credential store. |
| `budget.json` | `0o600` | JSON | Budget limits (per-request, daily, total) |
| `history.jsonl` | `0o600` | JSONL (append-only) | Payment history |
| `receipts.jsonl` | `0o600` | JSONL (append-only) | A2A server receipts ([AP2](https://ap2-protocol.org/) lifecycle) |
| `server.json` | `0o600` | JSON | Server config (port, host, network, access keys) |

The `~/.paperwall/` directory itself is created with `0o700` permissions (owner only).

---

## Troubleshooting

### "No wallet configured" (exit code 3)

You need to create a wallet first:

```bash
paperwall wallet create
```

### "Budget exceeded" (exit code 2)

The content price exceeds your budget limits. Check your current status:

```bash
paperwall budget status
```

Then either increase limits with `budget set` or use a higher `--max-price` on the `fetch` command.

### "Insufficient balance"

Your wallet does not have enough USDC. Check your balance:

```bash
paperwall wallet balance
```

Fund your wallet by sending USDC to your wallet address on the SKALE network.

### "Wallet already exists"

The agent refuses to overwrite an existing wallet to prevent accidental loss of funds. To replace your wallet:

```bash
paperwall wallet create --force
# or
paperwall wallet import --key 0x... --force
```

### Network or facilitator errors

- Check your internet connection
- Verify the SKALE RPC endpoint is responding: `curl https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha`
- If the facilitator is down, payments will fail but free content still works

> For A2A server troubleshooting (port conflicts, authentication errors, receipt issues), see the [A2A server guide](a2a-server-guide.md#troubleshooting).
> For AI agent skill issues (Gemini CLI not finding the agent), see the [AI agent setup guide](ai-agent-setup.md#troubleshooting).

---

## Security notes

### Encryption modes (detailed)

**Machine-bound encryption** (default, backward compatible):
- Encryption key: `PBKDF2(hostname:uid:salt, 600,000 iterations, SHA-256)` → 32-byte key
- **Pro:** No password needed; wallet auto-unlocks on the same machine for the same user
- **Con:** Breaks when pod restarts (machine identity changes); useless if wallet file is copied elsewhere
- **Use case:** Development, local testing, or machines with stable identity

**Password encryption** (MCP interactive):
- Encryption key: `PBKDF2(password, 600,000 iterations, SHA-256, 32-byte random salt)` → 32-byte key
- **Pro:** Password-protected; portable across machines; explicit user intent per session
- **Con:** Requires user interaction; slower (password hashing) on every session
- **Use case:** MCP CLI usage, interactive terminals, personal machines
- **Session caching:** During a CLI session, the password is cached in memory (cleared on exit or `SIGTERM`) to avoid re-prompting for every command
- **Memory safety:** Password is wiped from memory after key derivation using `buffer.fill(0)` (best-effort; JavaScript GC limitations apply)

**Environment-injected encryption** (A2A containers):
- Encryption key: Base64-encoded 32-byte key from `PAPERWALL_WALLET_KEY` environment variable
- **Pro:** Deterministic key derivation (same key across all pod instances); suitable for containerized deployments (K8s, Docker)
- **Con:** Requires managing secrets in deployment environment; no password fallback
- **Use case:** A2A servers in containers, CI/CD automation, managed deployments
- **Key format:** Base64-encoded exactly 32 bytes (e.g., `openssl rand -base64 32`), no whitespace allowed
- **Multi-instance deployment:** All instances with the same `PAPERWALL_WALLET_KEY` can decrypt the same wallet file, enabling shared wallet access across pod replicas

### OS keychain storage

When using `--keychain`, the private key is stored in the operating system's native credential manager:

- **macOS:** Keychain (via Security framework)
- **Linux:** GNOME Keyring or KWallet (via Secret Service D-Bus API)
- **Windows:** Windows Credential Manager

The OS keychain provides its own access control (user login, biometrics, etc.), so no additional encryption mode is applied. The `wallet.json` file still exists but only contains metadata (address, network, `keyStorage: "keychain"`) -- the private key itself is not in the file.

**When to use keychain:**
- Desktop machines where the OS provides strong credential protection
- When you want the key protected by your OS login rather than a separate password
- Machines with biometric authentication (Touch ID, fingerprint readers)

**When NOT to use keychain:**
- Headless servers or containers (no keychain daemon available)
- CI/CD environments (use `PAPERWALL_PRIVATE_KEY` env var instead)
- Shared machines (other users with the same login could access the keychain)

**Availability:** The `@napi-rs/keyring` package is an optional dependency. If the native keychain is unavailable (e.g., no D-Bus on Linux, running in Docker), keychain commands will fail with a descriptive error.

### Security practices

- **Overwrite protection:** `wallet create` and `wallet import` refuse to overwrite an existing wallet unless you pass `--force`, preventing accidental loss of funds.
- **File permissions:** All your files at `~/.paperwall/` are created with `0o600` (owner read/write only). The directory itself is `0o700` (owner only).
- **Budget gates are hard limits.** The agent cannot bypass them -- it declines payments before any signing occurs.
- **EIP-712 signatures** include a random nonce and a 5-minute validity window to prevent replay attacks.
- **A2A access control** uses HMAC-based timing-safe comparison to prevent timing attacks on Bearer tokens.
- **Never commit `PAPERWALL_PRIVATE_KEY` to version control.** Use environment variables or encrypted wallet files in production.
- **Never commit `PAPERWALL_WALLET_KEY` to version control.** Store it in your secrets manager (K8s Secrets, AWS Secrets Manager, etc.).
- **Never import your main wallet.** The agent makes automated payments -- always use a dedicated micropayment wallet.
