# Paperwall Demo

A demonstration news website showcasing Paperwall micropayments for ad-free browsing.

## Quick Start

### 1. Build the SDK

Before running the demo, you must build the Paperwall SDK:

```bash
# From the repository root
npm run build
```

This creates the SDK bundle at `packages/sdk/dist/index.iife.js` which is loaded by the demo pages.

### 2. Start the Demo Server

**Option A: Using npm script (from repo root)**

```bash
npm run demo
```

**Option B: Direct node command**

```bash
# From repo root
node demo/server.js

# Or specify a custom port
node demo/server.js 3000
```

**Option C: From the demo directory**

```bash
cd demo
node server.js
```

### 3. Access the Demo

Open your browser to:

```
http://localhost:8080
```

You'll see "The Daily Paper" homepage with three sample articles.

## Demo Structure

```
demo/
├── server.js           # Node.js HTTP server
├── index.html          # Homepage with article grid
├── articles/           # Sample paywalled articles
│   ├── article-1.html  # "The Rise of Micropayments" ($0.01)
│   ├── article-2.html  # "Zero-Gas Transactions" ($0.01)
│   └── article-3.html  # "The Ad-Free Web" ($0.01)
└── css/
    └── style.css       # Site styles
```

## How It Works

### Publisher Integration (Demo Articles)

Each article page includes two script tags:

1. **Paperwall SDK** with payment configuration:

```html
<script src="../../packages/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"
  data-price="10000"
  data-network="eip155:324705682"
></script>
```

**Configuration breakdown:**
- `data-pay-to`: **Publisher's wallet address** (where you want to receive payments)
- `data-price`: Price in USDC micro-units (10000 = $0.01, since USDC has 6 decimals)
- `data-network`: CAIP-2 chain ID for SKALE Base Sepolia testnet (`eip155:324705682`)

2. **Ad removal logic** that listens for payment success:

```html
<script>
  window.addEventListener('message', function (event) {
    if (event.data.type === 'PAPERWALL_PAYMENT_RESULT' && event.data.success) {
      // Hide ads and show thank-you banner
      document.querySelectorAll('.paperwall-ad').forEach(ad => {
        ad.setAttribute('aria-hidden', 'true');
      });
      document.getElementById('thankyou-banner').style.display = 'block';
    }
  });
</script>
```

### Reader Experience

**Without Paperwall Extension:**
- Articles display normally with ads visible
- No payment is triggered

**With Paperwall Extension:**
- SDK emits payment signal detected by extension
- Extension shows popup: "Pay $0.01 USDC to remove ads?"
- User approves → payment settles on SKALE → ads removed
- User declines → ads remain, no charge

## Testing with the Agent CLI

You can also fetch paywalled content using the Paperwall agent CLI:

### 1. Create a Test Wallet

```bash
paperwall wallet create
```

### 2. Set Budget Limits

```bash
paperwall budget set --per-request 0.10 --daily 5.00 --total 50.00
```

### 3. Fetch a Paywalled Article

```bash
paperwall fetch http://localhost:8080/articles/article-1.html --max-price 0.05
```

**Output:**

```json
{
  "ok": true,
  "content": "<!DOCTYPE html>...",
  "payment": {
    "mode": "client",
    "amountFormatted": "0.01",
    "txHash": "0xabc123...",
    "network": "eip155:324705682",
    "token": "0x2e08028E3C4c2356572E096d8EF835cD5C6030bD"
  }
}
```

### 4. View Payment History

```bash
paperwall history
```

## Testing with the A2A Server

The agent can also run as an A2A (Agent-to-Agent) server:

### 1. Start the A2A Server

```bash
PAPERWALL_ACCESS_KEYS=demo-key-123 paperwall serve --port 4000
```

### 2. Discover the Agent Card

```bash
curl http://localhost:4000/.well-known/agent-card.json
```

**Response:**

```json
{
  "name": "Paperwall Agent",
  "protocolVersion": "0.3.0",
  "capabilities": ["message/send"],
  "description": "x402 micropayment agent for paywalled web content"
}
```

### 3. Send JSON-RPC Request

```bash
curl -X POST http://localhost:4000/rpc \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "msg-001",
        "role": "user",
        "parts": [{
          "kind": "data",
          "data": {
            "url": "http://localhost:8080/articles/article-1.html",
            "maxPrice": "0.10",
            "agentId": "demo-agent"
          }
        }]
      }
    }
  }'
```

### 4. View Receipts

Open the receipt viewer in your browser:

```
http://localhost:4000/receipts?stage=settled
```

## Server Features

The demo server (`server.js`) includes:

- **Static file serving** with proper MIME types
- **CORS headers** for cross-origin requests
- **Directory traversal protection** for security
- **Request logging** with timestamps and duration
- **Graceful shutdown** (Ctrl+C or SIGTERM)
- **Custom port support** via CLI arg or `PORT` env var

## Troubleshooting

### SDK not loading

**Error:** `Failed to load resource: the server responded with a status of 404`

**Solution:** Run `npm run build` from the repo root to create the SDK bundle.

### Port already in use

**Error:** `EADDRINUSE: address already in use :::8080`

**Solution:** Use a different port:

```bash
node demo/server.js 3000
```

### Agent fetch fails with "budget exceeded"

**Error:** Exit code 2, "Budget exceeded"

**Solution:** Increase budget limits:

```bash
paperwall budget set --per-request 0.50 --daily 10.00
```

### No wallet configured

**Error:** Exit code 3, "No wallet configured"

**Solution:** Create a wallet first:

```bash
paperwall wallet create
```

## Network Configuration

The demo uses SKALE Base Sepolia testnet:

| Parameter | Value |
|-----------|-------|
| **Chain ID (CAIP-2)** | `eip155:324705682` |
| **Network Name** | SKALE Base Sepolia Testnet |
| **USDC Contract** | `0x2e08028E3C4c2356572E096d8EF835cD5C6030bD` |
| **Token Name** | Bridged USDC (SKALE Bridge) |
| **Token Symbol** | USDC |
| **Decimals** | 6 |
| **Gas Fees** | Ultra-low (SKALE has ultra-low fees) |
| **Facilitator** | `https://gateway.kobaru.io` |
| **Demo Publisher Wallet** | `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7` |

**Important:** The USDC contract address (`0x2e08028E3C4c2356572E096d8EF835cD5C6030bD`) is configured at the facilitator level. Publishers only need to specify their own wallet address in the `data-pay-to` attribute.

**Price encoding:** USDC has 6 decimals, so:
- `data-price="10000"` = $0.01 USDC (10,000 micro-USDC)
- `data-price="100000"` = $0.10 USDC (100,000 micro-USDC)
- `data-price="1000000"` = $1.00 USDC (1,000,000 micro-USDC)

To use mainnet, update the `data-network` attribute:

```html
<script src="..." data-network="eip155:1187947933"></script>
```

## Integration Guide

Want to add Paperwall to your own site? Here's the minimal integration:

### 1. Include the SDK

```html
<script src="https://unpkg.com/@paperwall/sdk@latest/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_WALLET_ADDRESS"
  data-price="10000"
  data-network="eip155:324705682"
></script>
```

Replace `YOUR_WALLET_ADDRESS` with your own Ethereum wallet address where you want to receive USDC payments.

### 2. Listen for Payment Success

```html
<script>
  window.addEventListener('message', (event) => {
    if (event.data.type === 'PAPERWALL_PAYMENT_RESULT' && event.data.success) {
      // Remove ads, unlock content, show thank-you message, etc.
    }
  });
</script>
```

That's it! The SDK handles all payment logic automatically.

## Further Reading

- [Paperwall Architecture](../docs/architecture.md)
- [Developer Guide](../docs/developer-guide.md)
- [Agent CLI Reference](../packages/agent/CLAUDE.md)
- [A2A Server Guide](../docs/a2a-server-guide.md)

## Support

For issues or questions:

- GitHub Issues: https://github.com/kobaru/paperwall/issues
- Documentation: https://github.com/kobaru/paperwall/tree/main/docs
