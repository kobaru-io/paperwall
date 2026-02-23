# Paperwall Agent CLI Reference

Complete command reference for `paperwall`.

## fetch

Fetches a URL and automatically handles x402 payment if required.

```bash
paperwall fetch <url> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<url>` | Yes | The URL to fetch |

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--max-price <amount>` | - | Maximum USDC to pay (e.g., "0.05" for 5 cents). Required if no budget is configured. |
| `--no-optimistic` | - | Disable optimistic settlement. By default, the agent returns content immediately after signing, while settlement continues in the background. Use this flag to wait for on-chain confirmation before returning. |
| `--timeout <ms>` | 30000 | Request timeout in milliseconds |

### Payment Detection Priority

1. **HTTP 402** -- handled by `@x402/fetch` library
2. **HTTP 200 + `<meta>` `mode="client"`** -- agent calls facilitator directly
3. **HTTP 200 + `<meta>` `mode="server"`** -- agent signs and POSTs to publisher
4. **HTTP 200 + no meta** -- returns content as-is (no payment needed)

### Success Response

```json
{
  "ok": true,
  "url": "https://example.com/premium-article",
  "statusCode": 200,
  "contentType": "text/html",
  "content": "<html>...full article content...</html>",
  "payment": {
    "mode": "client",
    "amount": "50000",
    "amountFormatted": "0.05",
    "asset": "USDC",
    "network": "eip155:324705682",
    "txHash": "0xabc123...",
    "payTo": "0x1234...publisher",
    "payer": "0x5678...your-wallet",
    "status": "confirmed"
  }
}
```

If no payment was required, `payment` will be `null`.

### Error Response

```json
{
  "ok": false,
  "error": "budget_exceeded",
  "message": "Payment of 0.50 USDC exceeds daily limit of 5.00 USDC (spent: 4.80)"
}
```

---

## wallet

Manage the encrypted wallet stored at `~/.paperwall/wallet.json`.

### wallet create

Create a new wallet (one-time setup). Uses machine-bound encryption -- the wallet auto-decrypts on the same machine but is useless if copied elsewhere.

```bash
paperwall wallet create
```

### wallet import

Import an existing private key. The key is encrypted with machine-bound encryption and stored in `wallet.json` -- the original plaintext key is not kept.

**Warning:** Never import your main wallet. Always use a dedicated wallet funded with only the amount you intend to spend on micropayments.

```bash
paperwall wallet import --key 0x<private-key-hex>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--key <hex>` | Yes | Private key as 0x-prefixed hex (64 hex chars) |
| `--network <caip2>` | No | Network (default: `eip155:324705682`) |

### wallet balance

Check USDC balance on SKALE network.

```bash
paperwall wallet balance
```

Response:
```json
{
  "ok": true,
  "address": "0x1234...abcd",
  "balance": "1500000",
  "balanceFormatted": "1.50",
  "asset": "USDC",
  "network": "eip155:324705682"
}
```

### wallet address

Get the wallet's Ethereum address.

```bash
paperwall wallet address
```

Response:
```json
{
  "ok": true,
  "address": "0x1234...abcd"
}
```

---

## budget

Manage spending limits. Budget limits are **hard gates** -- payments exceeding limits fail with exit code 2.

### budget set

```bash
paperwall budget set [options]
```

| Flag | Description |
|------|-------------|
| `--per-request <amount>` | Maximum USDC per single request |
| `--daily <amount>` | Maximum USDC per day |
| `--total <amount>` | Maximum USDC total spend |

Example:
```bash
paperwall budget set --per-request 0.10 --daily 5.00 --total 50.00
```

### budget status

```bash
paperwall budget status
```

Response:
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

Budget arithmetic uses BigInt internally for precision.

---

## history

View payment history.

```bash
paperwall history [--last <count>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--last <count>` | 10 | Number of recent payments to show |

Response:
```json
{
  "ok": true,
  "payments": [
    {
      "ts": "2026-02-11T10:30:00.000Z",
      "url": "https://example.com/article",
      "amount": "10000",
      "amountFormatted": "0.01",
      "asset": "USDC",
      "network": "eip155:324705682",
      "txHash": "0xdef456...",
      "mode": "client"
    }
  ],
  "total": {
    "count": 1,
    "amount": "10000",
    "amountFormatted": "0.01"
  }
}
```

---

## serve

Start an A2A (Agent-to-Agent) protocol server.

```bash
paperwall serve [options]
```

### Options

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `-p, --port <number>` | `PAPERWALL_PORT` | 4000 | Listening port |
| `-H, --host <string>` | `PAPERWALL_HOST` | 0.0.0.0 | Listening interface |
| `-n, --network <caip2>` | `PAPERWALL_NETWORK` | eip155:324705682 | Blockchain network |

### Config Resolution

Precedence: CLI flag > env var > `~/.paperwall/server.json` > default.

### Access Control

Set `PAPERWALL_ACCESS_KEYS` env var (comma-separated):

```bash
PAPERWALL_ACCESS_KEYS=key1,key2 paperwall serve
```

Uses HMAC-based timing-safe comparison for token validation.

### Endpoints

| Path | Auth | Description |
|------|------|-------------|
| `/.well-known/agent-card.json` | Public | A2A agent discovery (protocol v0.3.0) |
| `/rpc` | Bearer token | A2A JSON-RPC 2.0 endpoint |
| `/receipts` | Bearer token | HTML receipt viewer with filtering |
| `/health` | Public | Health check (`{"status":"ok"}`) |

### Example: Discover and Call

```bash
# Discover agent
curl http://localhost:4000/.well-known/agent-card.json

# Send authenticated RPC request
curl -X POST http://localhost:4000/rpc \
  -H "Authorization: Bearer key1" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "msg-1",
        "role": "user",
        "parts": [{
          "kind": "data",
          "data": {
            "url": "https://example.com/article",
            "maxPrice": "0.10"
          }
        }]
      }
    }
  }'
```

### Receipt Viewer

Filter receipts via query params:
- `?stage=settled` -- filter by AP2 stage (intent, settled, declined)
- `?from=2026-01-01` -- filter from date
- `?to=2026-02-01` -- filter to date

Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict CSP.

---

## demo

Run an AP2 lifecycle demo against a running A2A server.

```bash
paperwall demo --server <url> [options]
```

### Options

| Flag | Description |
|------|-------------|
| `-s, --server <url>` | Paperwall server URL (required) |
| `-a, --articles <urls...>` | Article URLs to fetch |
| `-k, --agent-key <key>` | Agent authentication key (Bearer token) |
| `-v, --verbose` | Show content preview on stderr and include plain-text content in JSON output |

### Output

- **stderr**: Human-readable progress with AP2 stage tree showing intent (requested amount), authorization context (daily spent/limit), settlement (amount + tx hash), and receipt stage. With `--verbose`, each settled step also shows payer/payee addresses, block explorer URL, and a 200-character plain-text content preview. Summary includes total USDC spent and explorer links.
- **stdout**: JSON audit trail with summary (`totalUsdcSpent`, `explorerLinks` as full URLs) and per-request results. Each result includes `authorization` (limits, spent amounts), `decline` (reason, limit, value), and `verification` (explorer URL) fields -- all null when not applicable. With `--verbose`, each result also includes `content` (plain text, HTML stripped) and `contentType` fields.

---

## Exit Codes

| Code | Meaning | Recommended Action |
|------|---------|-------------------|
| 0 | Success | Parse stdout JSON, use `content` field |
| 1 | Operational error | Check `message` in JSON response. Network failure, invalid args, insufficient balance, etc. |
| 2 | Payment declined | **Do NOT retry.** Content exceeds budget or max-price. Skip URL, ask user to increase budget, or find free alternatives. |
| 3 | No wallet configured | Run `paperwall wallet create` first |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PAPERWALL_PRIVATE_KEY` | Private key as 0x-prefixed hex (for automation/CI, bypasses wallet file) |
| `PAPERWALL_PORT` | A2A server port (default: 4000) |
| `PAPERWALL_HOST` | A2A server bind address (default: 0.0.0.0) |
| `PAPERWALL_NETWORK` | CAIP-2 network ID (default: `eip155:324705682` = SKALE Base Sepolia testnet) |
| `PAPERWALL_ACCESS_KEYS` | Comma-separated Bearer tokens for A2A server authentication |
| `PAPERWALL_OPTIMISTIC` | Set to `"false"` to disable optimistic settlement globally (default: `"true"`) |

---

## File Storage

All data stored at `~/.paperwall/` with `0o600` permissions:

| File | Description |
|------|-------------|
| `wallet.json` | Machine-bound encrypted wallet (PBKDF2 600k iterations + AES-256-GCM, keyed to hostname+uid) |
| `history.jsonl` | Payment history (append-only) |
| `budget.json` | Budget configuration and spend tracking |
| `receipts.jsonl` | AP2 receipt lifecycle (intent, settled, declined) |
| `server.json` | Server configuration defaults |

---

## SKALE Network

### Testnet (SKALE Base Sepolia)

- Chain ID: `eip155:324705682`
- USDC Contract: `0x2e08028E3C4c2356572E096d8EF835cD5C6030bD`
- Token: Bridged USDC (SKALE Bridge), 6 decimals
- Gas: Ultra-low

### Mainnet

- Chain ID: `eip155:1187947933`
- Gas: Ultra-low
- Asset: USDC (6 decimals)

---

## Docker

```bash
# Build
docker build -t paperwall packages/agent/

# Run server
docker run -p 4000:4000 \
  -e PAPERWALL_PRIVATE_KEY=0x... \
  -e PAPERWALL_ACCESS_KEYS=key1,key2 \
  paperwall serve
```

Multi-stage build with `node:20-slim`. Data stored at `/app/.paperwall/` inside the container (mount a volume to persist receipts).

---

## Example: Agent Workflow (Python)

```python
import subprocess
import json

# 1. Check budget first
result = subprocess.run(
    ["paperwall", "budget", "status"],
    capture_output=True, text=True
)
status = json.loads(result.stdout)

if float(status["remaining"]["daily"]) < 0.10:
    print("Insufficient budget remaining")
    exit(0)

# 2. Fetch paywalled content
result = subprocess.run(
    ["paperwall", "fetch", "https://example.com/article", "--max-price", "0.05"],
    capture_output=True, text=True
)

if result.returncode == 2:
    print("Content too expensive, skipping")
    exit(0)

response = json.loads(result.stdout)
if response["ok"]:
    content = response["content"]
    # Process the content...
```

## Example: Agent Workflow (TypeScript)

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function fetchPaywalledContent(url: string, maxPrice: string) {
  try {
    const { stdout } = await execAsync(
      `paperwall fetch "${url}" --max-price ${maxPrice}`
    );
    const result = JSON.parse(stdout);
    if (result.ok) {
      if (result.payment) {
        console.error(`Paid ${result.payment.amountFormatted} USDC`);
      }
      return result.content;
    } else {
      throw new Error(result.message);
    }
  } catch (error: any) {
    if (error.code === 2) {
      console.error('Content too expensive, skipping');
      return null;
    }
    throw error;
  }
}
```

---

## Troubleshooting

| Error | Exit Code | Solution |
|-------|-----------|----------|
| "No wallet configured" | 3 | Run `wallet create` |
| "Budget exceeded" | 2 | Increase limits with `budget set` or use higher `--max-price` |
| "Insufficient balance" | 1 | Fund wallet with USDC on SKALE network |
| "Failed to start server" | 1 | Check port availability, wallet exists, and env vars |
| 401 on `/rpc` or `/receipts` | - | Add `Authorization: Bearer <key>` header matching `PAPERWALL_ACCESS_KEYS` |
| Network errors | 1 | Check internet connection and SKALE RPC availability |

## Architecture

```
src/
├── cli.ts                       # Commander.js CLI entry point
├── payment-engine.ts            # Core x402 payment logic (fetchWithPayment)
├── wallet.ts                    # Encrypted wallet management
├── budget.ts                    # Budget enforcement (BigInt arithmetic)
├── history.ts                   # Payment history tracking
├── server/
│   ├── index.ts                 # Express server + A2A protocol
│   ├── executor.ts              # AgentExecutor (A2A SDK interface)
│   ├── request-orchestrator.ts  # fetchWithPayment + AP2 receipts
│   ├── receipt-manager.ts       # JSONL storage, explorer URLs
│   ├── receipt-viewer.ts        # HTML receipt dashboard
│   ├── access-gate.ts           # Bearer token auth (HMAC timing-safe)
│   ├── agent-card.ts            # A2A Agent Card (protocol v0.3.0)
│   ├── config.ts                # Config resolution (CLI > env > file)
│   ├── demo-client.ts           # AP2 lifecycle demo runner
│   └── types.ts                 # Receipt, ServerConfig interfaces
└── ...
```
