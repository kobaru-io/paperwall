---
name: paperwall
description: >-
  CLI tool for paying and accessing x402-paywalled web content with cryptocurrency
  micropayments. Use when encountering paywalled articles, HTTP 402 responses,
  x402-payment-required meta tags, or when the user wants to access paid content.
  Also runs an A2A (Agent-to-Agent) server for multi-agent payment workflows.
compatibility: Requires Node.js 20+, npm, and internet access for SKALE RPC.
metadata:
  author: kobaru
  version: "1.0"
---

# Paperwall Agent

`paperwall` is a CLI tool and A2A server that enables AI agents to pay for
access to x402-paywalled web content using USDC micropayments on the SKALE network.

## When to Use

- User asks to access paywalled or premium content
- HTTP 402 Payment Required responses
- Pages with `<meta name="x402-payment-required">` tags
- Running an A2A service so other agents can pay for content

**Always check budget before fetching expensive content.**

## Core Commands

### Fetch Content

```bash
paperwall fetch <url> --max-price <amount> [--timeout <ms>]
```

Fetches a URL and handles x402 payment automatically. Output is JSON on stdout.

```bash
paperwall fetch https://example.com/article --max-price 0.10
```

```json
{
  "ok": true,
  "url": "https://example.com/article",
  "statusCode": 200,
  "contentType": "text/html",
  "content": "<html>...full article...</html>",
  "payment": {
    "mode": "client",
    "amount": "50000",
    "amountFormatted": "0.05",
    "asset": "USDC",
    "network": "eip155:324705682",
    "txHash": "0xabc123..."
  }
}
```

If no payment was required, `payment` is `null`.

### Wallet

```bash
paperwall wallet balance                   # Check USDC balance
paperwall wallet address                   # Get wallet address
paperwall wallet create                    # One-time setup (machine-bound encryption)
paperwall wallet import --key 0x<hex>      # Import existing private key
```

### Budget

```bash
paperwall budget set --per-request 0.10 --daily 5.00 --total 50.00
paperwall budget status     # Check remaining budget
```

### History

```bash
paperwall history [--last N]  # View payment history
```

### A2A Server

```bash
paperwall serve [--port 4000] [--host 0.0.0.0] [--network eip155:324705682]
```

Starts an A2A protocol server. Other agents discover it via
`/.well-known/agent-card.json` and call `/rpc` with JSON-RPC 2.0.

Access control: set `PAPERWALL_ACCESS_KEYS=key1,key2` env var.

### Demo

```bash
paperwall demo --server <url> [--articles <urls...>] [--agent-key <key>] [--verbose]
```

Runs an AP2 lifecycle demo against a running A2A server. Shows authorization context (budget limits, spent amounts), settlement details (amount, tx hash), and decline reasons for each request. Summary includes total USDC spent and explorer links. With `--verbose`, also shows payer/payee addresses, block explorer URLs, and content previews.

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Process result |
| 1 | Operational error | Check error message |
| 2 | Payment declined | **Do NOT retry.** Skip URL or ask user to increase budget |
| 3 | No wallet | Run `wallet create` first |

## Output Format

- **stdout**: Valid JSON only. Always parse and check the `ok` field.
- **stderr**: Human-readable logs. Do not use for programmatic decisions.

Error example:
```json
{
  "ok": false,
  "error": "budget_exceeded",
  "message": "Payment of 0.50 USDC exceeds daily limit of 5.00 USDC (spent: 4.80)"
}
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PAPERWALL_PRIVATE_KEY` | Private key as 0x-prefixed hex (automation/CI) |
| `PAPERWALL_PORT` | A2A server port (default: 4000) |
| `PAPERWALL_HOST` | A2A server bind address (default: 0.0.0.0) |
| `PAPERWALL_NETWORK` | CAIP-2 network ID (default: `eip155:324705682`) |
| `PAPERWALL_ACCESS_KEYS` | Comma-separated Bearer tokens for server auth |

## Recommended Workflow

1. Check budget: `paperwall budget status`
2. If budget allows, fetch: `paperwall fetch <url> --max-price <amount>`
3. If exit code 2: skip the URL, inform the user, or suggest increasing budget
4. Parse stdout JSON and use `content` field

## Quick Troubleshooting

| Error | Solution |
|-------|----------|
| "No wallet configured" (exit 3) | Run `wallet create` |
| "Budget exceeded" (exit 2) | Increase limits with `budget set` |
| "Insufficient balance" | Fund wallet with USDC on SKALE |

See [cli-reference.md](references/cli-reference.md) for full command details,
all flags, complete JSON schemas, payment modes, and Docker usage.
