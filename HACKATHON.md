# Paperwall -- Hackathon Submission

**SF Agentic Commerce x402 Hackathon | SKALE Labs**

**Tracks:** Overall Best Agentic App | Best Integration of AP2

---

## One-liner

Paperwall is a complete micropayment toolkit that lets both humans and AI agents pay for web content -- as little as $0.01 -- using x402 and SKALE's ultra-low-fee infrastructure, with a single `<script>` tag on the publisher side.

---

## The Problem Nobody Has Solved

The web has a $300 billion monetization problem. Advertising is failing:

- Publishers earn **$0.001-$0.005 per page view** from display ads
- **40%+ of users** run ad-blockers -- publishers earn zero from them
- **AI agents** (crawlers, LLMs, automated workflows) don't see ads at all -- publishers earn nothing from the fastest-growing segment of web traffic

Subscriptions don't scale. Users won't pay $10/month for 2 articles. And agents can't sign up for subscriptions.

Micropayments were proposed in 1996 (HTTP 402 was reserved for this exact purpose), but they never worked because credit card minimums ($0.30 per transaction) make $0.01 payments impossible.

**What changed:** SKALE Network's ultra-low fees + the x402 protocol + EIP-3009 gasless signatures. For the first time, sub-cent payments are economically viable.

---

## What Paperwall Does

Paperwall is a **production-grade, open-source toolkit** with three packages that serve the full ecosystem:

### For Publishers: One Script Tag

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0xYOUR_ADDRESS"
  data-price="10000"
  data-network="eip155:324705682"
></script>
```

That's it. No backend. No database. No webhooks. Static sites, WordPress blogs, Hugo pages -- any publisher can add micropayments in under 60 seconds. The SDK emits an x402-compliant `<meta>` signal that both the browser extension and agent CLI can detect.

### For Human Readers: Chrome Extension

A Chrome MV3 extension that acts as a lightweight USDC wallet. Install, set a password, deposit $5, and start reading. At $0.01 per article, $5 covers 500 articles. One click to pay. Ads disappear. Content unlocks.

### For AI Agents: Skill + CLI + A2A Server

AI agents like Claude Code and Gemini CLI can install Paperwall as a native skill with a single command:

```bash
bash packages/agent/install.sh claude   # or: gemini
```

The installer builds the CLI, installs the skill, sets up a wallet (machine-bound encryption -- no password needed), and configures a budget. After that, the AI agent automatically pays for paywalled content when prompted:

```
"Read this paywalled article: https://example.com/premium-article"
```

For programmatic access and multi-agent workflows:

```bash
# CLI: fetch paywalled content with automatic payment
paperwall fetch https://example.com/article --max-price 0.10

# A2A Server: expose payment capability to other agents
paperwall serve --port 4000
```

The agent implements the same payment flow as the extension, but headless. Other AI agents discover it via the A2A protocol (v0.3.0), send JSON-RPC requests, and get paywalled content with structured AP2 receipts.

---

## Why Paperwall is Novel

### 1. First system to serve both humans AND agents with the same payment protocol

Every other micropayment project targets either humans or machines. Paperwall uses a single x402 signal format that both the browser extension and the CLI agent can detect and pay. Same publisher integration, same facilitator, same on-chain settlement -- two completely different UX paths converging on one protocol.

This matters because the web's traffic is splitting. Humans browse with browsers. Agents fetch with HTTP clients. Content creators need to monetize both. Paperwall is the only system where a publisher adds one line of code and both audiences can pay.

### 2. Progressive trust tiers -- no infrastructure required to start

Traditional x402 implementations (server mode) require the publisher to run a backend that calls the facilitator. This is a non-starter for the vast majority of web publishers who use static sites, WordPress.com, or Substack.

Paperwall inverts the model: the **reader's extension** calls the facilitator directly (Tier 1). The publisher needs zero backend infrastructure. This is a deliberate architectural decision -- the security tradeoff (client-side trust) is proportional to the value being protected ($0.01 articles). Publishers can upgrade to signed receipts (Tier 2) or full server-side verification (Tier 3) as their content value grows, without changing their integration.

No other x402 implementation offers this progressive adoption path.

### 3. The agent has real economic reasoning -- not just payment execution

The Paperwall agent doesn't blindly pay. It implements a three-tier budget enforcement system with BigInt arithmetic:

- **Per-request limit:** "Never pay more than $0.10 for a single article"
- **Daily limit:** "Stop at $5.00/day across all sites"
- **Lifetime limit:** "Hard cap at $50.00 total"

Budget checks are **hard gates**, not advisory. If any limit is exceeded, the payment is declined (exit code 2) and the agent never retries. This is exactly the kind of "cost reasoning, tradeoffs, and pruning behavior" that judges are looking for.

### 4. Complete AP2 receipt lifecycle with audit trail

Every request through the A2A server produces a structured receipt that tracks the full AP2 lifecycle:

- **Intent** -- request received, authorization context captured (budget limits, amounts already spent)
- **Settled** -- payment completed on-chain, with txHash, network, payer, payee, and block explorer verification URL
- **Declined** -- budget check failed, with reason code, which limit was hit, and the limit value

Receipts are stored as append-only JSONL and viewable through an HTML dashboard at `/receipts`. This provides the "clear evidence of what the agent did and why" that the judging criteria explicitly call out.

### 5. Native AI agent integration -- not just an API

Most agentic payment projects require manual HTTP calls or custom code. Paperwall ships as an **installable skill** for Claude Code and Gemini CLI. One command (`bash install.sh claude`) and the AI agent can pay for content autonomously -- no manual curl, no code changes, no API wrappers.

The skill file teaches the agent when to invoke the CLI, how to interpret exit codes (0=success, 2=don't retry), and how to parse structured JSON output. This is zero-friction agent onboarding.

### 6. Multi-mode payment detection

The agent handles three distinct payment signals with graceful fallback:

1. **HTTP 402** -- Standard x402 flow via `@x402/fetch` library
2. **Meta tag (client mode)** -- Agent calls facilitator directly (replicates extension behavior)
3. **Meta tag (server mode)** -- Agent signs and POSTs to publisher's endpoint

This means Paperwall works with any x402-compliant server (not just Paperwall publishers), while also supporting its own zero-infrastructure client mode.

---

## Technical Execution

### Architecture at a Glance

```
Publisher Website              Chrome Extension              Agent CLI / A2A Server
  SDK (IIFE, ~5KB)             Content Script                Commander.js CLI
    |                            |        |                     |
    emits <meta> signal -->    detector  bridge              payment-engine
    postMessage bridge -->       |          |                    |
                                 +--chrome.runtime--+          +-- HTTP 402 (@x402/fetch)
                                 |                  |          +-- client mode (facilitator)
                                 v                  v          +-- server mode (publisher)
                            service worker    popup UI              |
                              |                                budget enforcement (BigInt)
                              +-- key-manager (PBKDF2+AES)         |
                              +-- signer (EIP-712)             signer (EIP-712)
                              +-- facilitator client               |
                              +-- balance (eth_call)           A2A Server (Express)
                              +-- history                        +-- AgentExecutor
                                                                 +-- receipt-manager
                                                                 +-- receipt-viewer
                                                                 +-- access-gate (HMAC)
                                                                 +-- agent-card (v0.3.0)
                                                                 +-- agent-registry

                              AI Agent Integration
                                install.sh --> builds CLI, installs skill, wallet + budget
                                SKILL.md  --> teaches Claude Code / Gemini CLI
```

### Code Quality Signals

| Metric                | Value                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test files            | 41 unit + 6 integration                                                                                                                                                          |
| Test count            | 560+ across all packages                                                                                                                                                         |
| TypeScript strictness | `strict: true`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`                                                                                                 |
| Zero `any`            | `unknown` + type narrowing throughout                                                                                                                                            |
| Security              | PBKDF2 600k iterations + AES-256-GCM, SSRF protection, timing-safe auth, brute-force lockout                                                                                     |
| Documentation         | 12 guides (6,200+ lines total): architecture, A2A server, developer, agent CLI, AI agent setup, publisher, user, FAQ, pricing economics, design decisions, roadmap, how-it-works |

### Payment Cryptography

- **EIP-712** typed data signing for `TransferWithAuthorization` (EIP-3009)
- **Random 32-byte nonce** per transaction (replay protection)
- **5-minute validity window** (prevents stale signatures)
- **USDC stablecoin** on SKALE (ultra-low fees, dollar-denominated)
- **Facilitator submits on-chain** -- reader signs, never broadcasts directly

### Security Posture

| Area                    | Implementation                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Wallet encryption       | PBKDF2 (600k iterations, SHA-256) + AES-256-GCM, 32-byte salt, 12-byte IV          |
| Key storage (extension) | `chrome.storage.session` with `TRUSTED_CONTEXTS` -- only service worker can access |
| Key storage (agent)     | `~/.paperwall/wallet.json` with `0o600` file permissions                           |
| Facilitator SSRF        | HTTPS-only, private IP blocklist (10.x, 172.x, 192.168.x, link-local, IPv6)        |
| Brute-force protection  | 5-attempt lockout, 5-minute cooldown                                               |
| A2A access control      | HMAC-based timing-safe Bearer token comparison                                     |
| Receipt viewer          | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict CSP             |
| HTML output             | `escapeHtml()` on all user-supplied values                                         |
| Password requirements   | 12+ characters, 3-of-4 character categories                                        |

---

## The Agentic Commerce Story

Paperwall demonstrates a complete agentic commerce workflow -- from skill installation to autonomous payment:

```
0. Human runs: bash install.sh claude (one-time setup)
1. Agent receives task: "Research topic X"
2. Agent invokes Paperwall skill → fetches articles from the web
3. Some articles return HTTP 402 or contain x402 meta tags
4. Agent checks budget: "Can I afford $0.01 for this article?"
5. Budget allows → Agent signs EIP-712 authorization
6. Facilitator settles payment on SKALE (ultra-low fees)
7. Agent receives content + AP2 receipt
8. Agent uses content to complete the task
9. All payments logged with txHash, payer, payee, amount
10. Human can review spending at /receipts dashboard
```

This is the "discover -> decide -> pay/settle -> outcome" flow that the judging criteria describe, with real on-chain settlement and real audit trails. The skill system means step 0 happens once and the agent handles steps 1-10 autonomously from that point forward.

### Agent-to-Agent Discovery

The A2A server exposes a standard agent card at `/.well-known/agent-card.json`:

```json
{
  "name": "Paperwall Agent",
  "description": "Fetches x402-paywalled web content with automatic cryptocurrency micropayments.",
  "protocolVersion": "0.3.0",
  "skills": [{
    "id": "fetch-content",
    "name": "Fetch Paywalled Content",
    "tags": ["x402", "payment", "fetch", "paywall", "content"]
  }],
  "capabilities": { "stateTransitionHistory": true }
}
```

Other agents can discover this card, send a JSON-RPC `message/send` request with a URL and max price, and receive the content along with a structured receipt -- all without any prior arrangement or API key exchange (beyond Bearer auth).

---

## SKALE Integration

Paperwall is deeply built on SKALE's unique properties:

| SKALE Feature         | How Paperwall Uses It                                              |
| --------------------- | ------------------------------------------------------------------ |
| **Zero gas fees**     | Makes $0.01 payments viable (100% of payment goes to publisher)    |
| **EVM compatibility** | Standard USDC contract, `transferWithAuthorization` (EIP-3009)     |
| **Fast finality**     | Payments settle in seconds, not minutes                            |
| **Testnet + Mainnet** | Both networks configured (`eip155:324705682`, `eip155:1187947933`) |

Without SKALE's ultra-low fees, Paperwall's entire economic thesis collapses. A $0.01 payment on Ethereum mainnet would cost $1-50 in gas. On Optimism/Arbitrum, $0.01-0.50. On SKALE, nearly negligible. This is the fundamental enabler.

---

## Google Integration

Paperwall integrates with three Google technologies:

| Google Technology                | How Paperwall Uses It                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Gemini CLI**                   | Installable skill (`bash install.sh gemini`) -- Gemini can autonomously pay for paywalled content                             |
| **A2A Protocol (v0.3.0)**        | A2A server built on `@a2a-js/sdk` with agent card discovery, JSON-RPC 2.0, and task lifecycle                                 |
| **AP2 (Agent Payment Protocol)** | Full receipt lifecycle (intent → authorization → settled/declined) with structured audit trail                                |
| **Cloud Run**                    | Docker image (`node:20-slim`, multi-stage build) deploys directly to Cloud Run -- `docker build -t paperwall packages/agent/` |

---

## x402 Protocol Compliance

Paperwall implements x402 at multiple levels:

1. **Signal emission** -- SDK emits `<meta name="x402-payment-required">` with base64-encoded JSON payload (x402 v2 format)
2. **HTTP 402 handling** -- Agent uses `@x402/fetch` with `ExactEvmScheme` for standard 402 challenge-response
3. **Payment payload** -- x402 v2 compliant: `{ x402Version: 2, resource, accepted, payload }`
4. **Facilitator API** -- `GET /supported` for capabilities, `POST /settle` for settlement, `POST /verify` for verification

The SDK and agent share the same signal format, so any x402-aware client can interact with Paperwall-enabled pages.

---

## Demo

### Demo Site: "The Daily Paper"

A realistic news site with 3 articles, each priced at $0.01 USDC. Articles display ads. When a reader pays via the extension, ads are removed and a "Thank you" banner appears.

### Agent Demo Command

```bash
paperwall demo --server http://localhost:4000 \
  --articles https://example.com/article-1 https://example.com/article-2 \
  --agent-key my-key --verbose
```

Outputs a step-by-step AP2 lifecycle trace:

```
[1/4] https://example.com/article-1
  |-- Intent: requesting content...
  |-- Authorization: budget check passed
  |-- Settlement: tx 0xabc123... on eip155:324705682
  \-- Receipt: 7f3a8b2c... [settled]

[2/4] https://example.com/article-2
  |-- Intent: requesting content...
  |-- Authorization: DENIED (budget_exceeded)
  \-- Receipt: 9d4e5f6a... [declined]
```

JSON audit trail to stdout:

```json
{
  "ok": true,
  "summary": {
    "totalRequests": 4,
    "successfulFetches": 2,
    "declinedFetches": 1,
    "explorerLinks": ["0xabc123...", "0xdef456..."]
  },
  "results": [...]
}
```

### Failure Modes (AP2 Declined Flow)

Paperwall handles failures as first-class AP2 events, not error strings:

```bash
# Set a very low budget to trigger decline
paperwall budget set --per-request 0.001 --daily 0.001

# Try to fetch -- declined with structured receipt
paperwall fetch https://example.com/article --max-price 0.10
# Exit code: 2 (payment declined -- do NOT retry)
```

```json
{
  "ok": false,
  "error": "budget_exceeded",
  "message": "Payment of 0.01 USDC exceeds per-request limit of 0.001 USDC"
}
```

The corresponding AP2 receipt captures the full context:

```json
{
  "ap2Stage": "declined",
  "url": "https://example.com/article",
  "authorization": {
    "budgetLimits": { "perRequest": "0.001", "daily": "0.001" },
    "alreadySpent": { "daily": "0.000", "total": "0.000" }
  },
  "decline": {
    "reason": "per_request",
    "requestedAmount": "0.01",
    "limit": "0.001"
  }
}
```

This is the "failure mode with a receipt" that the AP2 judging criteria call out. Every decline is logged, structured, and auditable -- not just an error message.

---

## Why Paperwall Stands Out

1. **Real utility.** This solves a $300B problem -- web content monetization -- for both humans and AI agents. Not a toy demo. A working system with 560+ tests, 12 docs (6,200+ lines), and production security.

2. **Complete agentic workflow.** Discover (meta tag / 402 detection) -> Decide (budget enforcement with per-request, daily, lifetime limits) -> Pay (EIP-712 signature, on-chain settlement) -> Outcome (content delivery + AP2 receipt). End-to-end, deterministic, auditable.

3. **Zero-friction adoption for everyone.** Publishers add one `<script>` tag -- no backend, no database, no API keys. AI agents run one installer command (`bash install.sh claude`) -- no code changes, no API wrappers. Both sides get up and running in under 60 seconds.

4. **Built on SKALE's unique advantage.** Ultra-low fees aren't a nice-to-have -- they're the fundamental enabler. A $0.01 payment with minimal fees means ~100% of the value transfers. No other network makes this viable.

5. **Trust and safety are first-class.** Budget hard gates (not advisory), HMAC timing-safe auth, PBKDF2 600k + AES-256-GCM wallet encryption, SSRF protection, brute-force lockout, structured decline reasons. This is what production agent commerce looks like.

6. **Audit trail is comprehensive.** AP2 receipt lifecycle (intent/settled/declined), JSONL storage, HTML receipt viewer, block explorer verification URLs, authorization context captured at request time. Every payment is traceable and explainable.

7. **Open source and protocol-native.** GPL-3.0, x402 v2 compliant, facilitator-agnostic, A2A protocol v0.3.0. No vendor lock-in. Other teams can build on this.

---

## Team

**Kobaru Team** -- [kobaru.io](https://www.kobaru.io)

**Fabricio Gava** -- Engineering Lead
[LinkedIn](https://www.linkedin.com/in/fabriciogava/)

**Amanda Pestilo** -- UX Lead
[LinkedIn](https://www.linkedin.com/in/amandapestilo/)

---

## Links

- **Repository:** [github.com/kobaru/paperwall](https://github.com/kobaru/paperwall)
- **Architecture:** [docs/architecture.md](docs/architecture.md)
- **Developer Guide:** [docs/developer-guide.md](docs/developer-guide.md)
- **A2A Server Guide:** [docs/a2a-server-guide.md](docs/a2a-server-guide.md)
- **AI Agent Setup:** [docs/ai-agent-setup.md](docs/ai-agent-setup.md)
- **Agent CLI Reference:** [packages/agent/CLAUDE.md](packages/agent/CLAUDE.md)

---

## Quick Start

```bash
git clone https://github.com/kobaru/paperwall.git
cd paperwall
npm install
npm run build
npm test        # 560+ tests
```

### Give your AI agent payment superpowers

```bash
# Install the Paperwall skill for Claude Code (or Gemini CLI)
bash packages/agent/install.sh claude

# Then just prompt your agent:
# "Read this paywalled article: https://example.com/premium-article"
```

### Run the A2A server

```bash
# Start the A2A server
PAPERWALL_PRIVATE_KEY=0x... PAPERWALL_ACCESS_KEYS=demo-key paperwall serve

# Discover the agent
curl http://localhost:4000/.well-known/agent-card.json

# Fetch paywalled content via A2A
curl -X POST http://localhost:4000/rpc \
  -H "Authorization: Bearer demo-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","messageId":"demo","role":"user","parts":[{"kind":"data","data":{"url":"https://example.com/article","maxPrice":"0.10"}}]}}}'
```

### Or use Docker

```bash
docker build -t paperwall packages/agent/
docker run -p 4000:4000 \
  -e PAPERWALL_PRIVATE_KEY=0x... \
  -e PAPERWALL_ACCESS_KEYS=demo-key \
  paperwall serve
```

---
