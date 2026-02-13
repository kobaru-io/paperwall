# Agent CLI guide

The Paperwall Agent CLI is a command-line tool that lets AI agents (and humans) pay for access to paywalled web content using cryptocurrency micropayments. It works headlessly -- no browser required.

> **New here?** Read [How Paperwall works](how-it-works.md) for a plain-language overview.
> **Setting up an AI agent?** See the [AI agent setup guide](ai-agent-setup.md) for Claude Code and Gemini CLI.
> **Running a server?** See the [A2A server guide](a2a-server-guide.md) for the Agent-to-Agent protocol server.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [From source](#from-source-current-method)
  - [With npx](#with-npx-once-published)
  - [With Docker](#with-docker)
- [Quick start](#quick-start)
- [Wallet commands](#wallet-commands)
  - [Create a wallet](#create-a-wallet)
  - [Import an existing key](#import-an-existing-key)
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

### From source (current method)

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
npm link --workspace=@paperwall/agent
paperwall --help
```

### With npx (once published)

```bash
npx @paperwall/agent --help
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

All wallet data lives at `~/.paperwall/wallet.json` with `0o600` permissions (owner read/write only).

The private key is encrypted with PBKDF2 (600,000 iterations) + AES-256-GCM. The encryption key derives from the machine's hostname and user ID. No password is needed -- the wallet auto-decrypts on the same machine for the same user.

### Create a wallet

```bash
paperwall wallet create [--network <caip2>] [--force]
```

Generates a fresh private key dedicated to micropayments. The key is encrypted with machine-bound encryption and stored locally.

**Options:**
- `--network <caip2>` -- Default blockchain network in CAIP-2 format (default: `eip155:324705682`, SKALE testnet)
- `--force` -- Overwrite an existing wallet (without this flag, the command refuses to overwrite)

**Output:**
```json
{
  "ok": true,
  "address": "0xAbCd...1234",
  "network": "eip155:324705682",
  "storagePath": "/home/you/.paperwall/wallet.json"
}
```

Save your address -- you need it to fund the wallet.

### Import an existing key

```bash
paperwall wallet import --key <hex> [--network <caip2>] [--force]
```

Imports an existing private key and encrypts it with machine-bound encryption. The plaintext key is not stored -- only the encrypted form is persisted.

**Warning:** Never import your main wallet. This agent makes automated payments on your behalf -- AI assistants can trigger transactions without manual approval. Always use a dedicated wallet funded with only the amount you intend to spend on micropayments.

**Options:**
- `--key <hex>` -- Private key as hex (with or without `0x` prefix, 64 hex characters). Required.
- `--network <caip2>` -- Default blockchain network (default: `eip155:324705682`)
- `--force` -- Overwrite an existing wallet

**Output:** Same format as `wallet create`.

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
| `PAPERWALL_NETWORK` | Blockchain network as CAIP-2 ID (default: `eip155:324705682`) |

Server-specific variables (`PAPERWALL_PORT`, `PAPERWALL_HOST`, `PAPERWALL_ACCESS_KEYS`) are documented in the [A2A server guide](a2a-server-guide.md#configuration).

### Key resolution priority

When the agent needs your private key (for `fetch` or `serve`), it tries these sources in order:

1. `PAPERWALL_PRIVATE_KEY` environment variable -- direct key, no wallet file needed
2. Machine-bound encrypted wallet file at `~/.paperwall/wallet.json` -- auto-decrypts on the same machine for the same user

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
| `wallet.json` | `0o600` | JSON | Machine-bound encrypted private key, address, network |
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

- **Machine-bound encryption:** Your wallet private key is encrypted with PBKDF2 (600,000 iterations) + AES-256-GCM. The encryption key derives from the machine's hostname and user ID -- the wallet auto-decrypts on the same machine but is useless if copied elsewhere.
- **Overwrite protection:** `wallet create` and `wallet import` refuse to overwrite an existing wallet unless you pass `--force`, preventing accidental loss of funds.
- **File permissions:** All your files at `~/.paperwall/` are created with `0o600` (owner read/write only).
- **Budget gates are hard limits.** The agent cannot bypass them -- it declines payments before any signing occurs.
- **EIP-712 signatures** include a random nonce and a 5-minute validity window to prevent replay attacks.
- **A2A access control** uses HMAC-based timing-safe comparison to prevent timing attacks on Bearer tokens.
- **Never commit `PAPERWALL_PRIVATE_KEY` to version control.** Use environment variables or encrypted wallet files.
- **Never import your main wallet.** The agent makes automated payments -- always use a dedicated micropayment wallet.
