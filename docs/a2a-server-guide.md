# A2A Server guide

Paperwall's A2A (Agent-to-Agent) server enables autonomous AI agents to discover and pay for paywalled web content using the [A2A protocol](https://a2a-protocol.org/). It wraps the existing `fetchWithPayment()` engine behind a standard A2A interface -- JSON-RPC 2.0 over HTTP, with structured [AP2 payment receipts](https://ap2-protocol.org/).

The server follows an operator-funded wallet model: you (the operator) fund a wallet with USDC on SKALE, configure spending limits, and start the server. Other AI agents make requests against your wallet's budget.

---

## Table of Contents

- [How it works](#how-it-works)
- [AP2 implementation for x402 micropayments](#ap2-implementation-for-x402-micropayments)
- [Getting started](#getting-started)
- [Getting started (Local)](#getting-started-local)
  - [1. Install the CLI](#1-install-the-cli)
  - [2. Create a wallet](#2-create-a-wallet)
  - [3. Fund the wallet with USDC on SKALE](#3-fund-the-wallet-with-usdc-on-skale)
  - [4. Set spending limits](#4-set-spending-limits)
  - [5. Start the server](#5-start-the-server)
  - [6. (Optional) Set access keys](#6-optional-set-access-keys)
- [Getting started (Docker)](#getting-started-docker)
- [Getting started (Cloud Run)](#getting-started-cloud-run)
- [Configuration](#configuration)
- [Endpoints reference](#endpoints-reference)
  - [`GET /.well-known/agent-card.json`](#get-well-knownagent-cardjson)
  - [`POST /rpc`](#post-rpc)
  - [`GET /receipts`](#get-receipts)
  - [`GET /health`](#get-health)
- [Access control](#access-control)
- [Docker deployment](#docker-deployment)
  - [Docker Compose](#docker-compose)
- [Google Cloud Run deployment](#google-cloud-run-deployment)
  - [Prerequisites](#prerequisites)
  - [1. Create an Artifact Registry repository](#1-create-an-artifact-registry-repository)
  - [2. Build and push the image](#2-build-and-push-the-image)
  - [3. Store secrets in Secret Manager](#3-store-secrets-in-secret-manager)
  - [4. Deploy to Cloud Run](#4-deploy-to-cloud-run)
  - [5. Verify the deployment](#5-verify-the-deployment)
  - [6. Configure a custom domain (optional)](#6-configure-a-custom-domain-optional)
  - [7. Persistent storage for receipts](#7-persistent-storage-for-receipts)
  - [8. Monitoring and logs](#8-monitoring-and-logs)
  - [9. Cost optimization](#9-cost-optimization)
  - [10. Security hardening](#10-security-hardening)
- [Running the demo](#running-the-demo)
- [Integration example](#integration-example)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

---

## How it works

The [A2A protocol](https://a2a-protocol.org/) defines a standard way for AI agents to discover and communicate with each other. Paperwall implements this protocol at version 0.3.0. Here is the typical flow:

1. **Discovery** -- An AI agent fetches `/.well-known/agent-card.json` to learn about the server's capabilities, supported skills, and RPC endpoint URL.

2. **Request** -- The agent sends a `message/send` JSON-RPC request to `/rpc` with the URL to fetch and an optional maximum price.

3. **Orchestration** -- The server's request orchestrator checks budget limits, calls `fetchWithPayment()` to handle the payment flow (HTTP 402, client mode, or server mode), and creates an AP2 receipt.

4. **Response** -- The server returns the fetched content (or a decline reason) along with the structured receipt.

All payments settle on the SKALE network, which has ultra-low fees. This makes sub-cent micropayments economically viable -- nearly the full payment amount goes to the publisher.

---

## AP2 implementation for x402 micropayments

Paperwall is a **reference implementation** of the [AP2 (Agent Payment Protocol)](https://ap2-protocol.org/) for web content micropayments using [x402](https://x402.org/). AP2 defines how AI agents handle payments with accountability and cryptographic evidence; Paperwall implements this for single-URL content purchases with blockchain settlement.

**AP2 concepts in Paperwall's context:**

**Three-stage receipt lifecycle**
Every request through the A2A server produces an AP2 receipt that tracks the payment lifecycle. Each receipt passes through one of three stages with cryptographic evidence:

- **intent** -- The server received the request and built an authorization context. The context includes the current budget limits and how much has been spent. This is the initial stage before payment is attempted.

- **settled** -- Payment completed on-chain and content was delivered. The receipt includes transaction hash (`txHash`), network identifier (CAIP-2 format), payer and payee addresses, amount paid (both raw smallest-unit and human-readable), and block explorer verification URL.

- **declined** -- A budget check failed before payment was attempted. The receipt includes decline reason (`budget_exceeded` or `max_price_exceeded`), which limit was hit (`per_request`, `daily`, `total`, or `max_price`), the limit value that was exceeded, and the requested amount.

Receipts are stored as append-only JSONL at `~/.paperwall/receipts.jsonl`. Each line is a self-contained JSON object, making the file easy to parse, stream, and back up.

**Authorization context with temporal bounds**
Budget limits (per-request, daily, total), current spending, and TTL expiration. Agents see exactly what they're authorized to spend and when authorizations expire (default: 5 minutes).

**Merchant proof of service**
x402 protocol provides cryptographic proof through three tiers:
- **Tier 1 & 2 (client/server mode)**: Content delivered during settlement. The blockchain transaction + content delivery together provide proof of service.
- **Tier 3**: Publishers implement x402's `verify` endpoint, render content, and only settle the transaction if successful. Settlement proves both payment and delivery.

This replaces AP2's Cart Mandate signatures (designed for e-commerce checkout) with x402's content-first approach.

**Intent authorization**
URL-based requests with explicit budget limits. Unlike e-commerce scenarios where users say "buy me a laptop under $500" (requiring natural language understanding), content URLs are unambiguous -- `https://nature.com/article/123` is explicit. Authorization happens via wallet ownership (cryptographic proof) rather than signed natural language intents.

**Payment methods**
Blockchain-native with direct wallet usage. The wallet IS the payment method (EVM address). No tokenization layer needed -- transparency and auditability are inherent in on-chain settlement.

**Payer/payee identification and verification**
EVM addresses captured in receipts. On-chain verification via CAIP-2 network identifiers and block explorer URLs. Every payment is publicly verifiable on the blockchain.

**Decline reasons and accountability**
Structured decline context maps to budget violations: `budget_exceeded` (which limit: per_request, daily, total) or `max_price_exceeded`. Agents know exactly why requests fail and can adjust behavior.

**Agent activity tracking and risk signals**
Receipts include request source (`a2a-rpc`, `cli`, `direct-api`), agent first-seen timestamp, and historical request count. Enables fraud detection (unusual request spikes, new agent sudden high volume) without collecting IP addresses or user agents.

**AP2 concepts not applicable to x402 micropayments:**

- **Cart Mandates**: Designed for multi-item e-commerce checkout. x402 handles single-URL content purchases -- no shopping cart concept.
- **Shipping options**: Relevant for physical goods. Digital content has instant delivery.
- **Tokenized payment methods**: Designed to abstract credit cards, bank accounts, etc. Blockchain wallets are first-class payment instruments with built-in cryptographic proof.

Paperwall demonstrates how AP2 applies to micropayment scenarios distinct from traditional e-commerce. For the full AP2 specification and other use cases, see [ap2-protocol.org/specification](https://ap2-protocol.org/specification/).

---

## Getting started

Choose your deployment method based on your needs.

### Pick your path

**[Local/Standalone](#getting-started-local)** -- Run the server directly on your machine. Best for development, testing, or personal use.

**[Docker](#getting-started-docker)** -- Run in a container with one command. Best for consistent environments and easy deployment.

**[Google Cloud Run](#getting-started-cloud-run)** -- Deploy to a fully managed serverless platform. Best for production with auto-scaling and zero maintenance.

---

## Getting started (Local)

### 1. Install the CLI

Build from source (the package is not yet published to npm):

```bash
git clone https://github.com/kobaru/paperwall.git
cd paperwall
npm install
npm run build
```

After building, the CLI is available at `packages/agent/dist/cli.js`. You can run it directly with `node packages/agent/dist/cli.js` or link it globally:

```bash
npm link --workspace=packages/agent
```

### 2. Create a wallet

```bash
paperwall wallet create
```

This generates an Ethereum keypair, encrypts the private key with machine-bound PBKDF2 + AES-256-GCM (keyed to hostname and user ID), and stores it at `~/.paperwall/wallet.json` with 0o600 permissions. No password is needed -- the wallet auto-decrypts on the same machine.

### 3. Fund the wallet with USDC on SKALE

Get your wallet address:

```bash
paperwall wallet address
```

Transfer USDC to this address on the SKALE network. SKALE has ultra-low fees, so the wallet does not need native tokens for gas.

### 4. Set spending limits

```bash
paperwall budget set --per-request 0.10 --daily 5.00 --total 50.00
```

All three limits are optional. Any limit you set acts as a hard gate -- requests that would exceed the limit are declined automatically.

### 5. Start the server

```bash
paperwall serve --port 4000
```

The server logs its status to stderr:

```
[paperwall] A2A Server started
[paperwall]   URL: http://localhost:4000
[paperwall]   Discovery: http://localhost:4000/.well-known/agent-card.json
[paperwall]   Receipts: http://localhost:4000/receipts
[paperwall]   Wallet: 0x1234...abcd
[paperwall]   Network: eip155:324705682
[paperwall]   Auth TTL: 300s
[paperwall]   Access control: open
```

### 6. (Optional) Set access keys

To require authentication on the `/rpc` and `/receipts` endpoints:

```bash
PAPERWALL_ACCESS_KEYS=key1,key2 paperwall serve --port 4000
```

Clients must include `Authorization: Bearer key1` (or `key2`) in their requests. The agent card endpoint remains public -- this is required by the A2A protocol for discovery.

---

## Getting started (Docker)

Run the A2A server in a container with a single command.

### Prerequisites
- Docker installed
- A private key for your wallet (generate one or use existing)

### Quick start

```bash
# Build the image
docker build -t paperwall packages/agent/

# Run with Docker Compose (recommended)
PAPERWALL_PRIVATE_KEY=0x... docker compose up -d
```

The compose file automatically configures:
- Port mapping (4000)
- Persistent volume for receipts
- Health checks
- Auto-restart policy

**Environment variables:**
```bash
PAPERWALL_PRIVATE_KEY=0x...           # Your wallet private key (required)
PAPERWALL_ACCESS_KEYS=key1,key2       # Bearer tokens for auth (optional)
PAPERWALL_AUTH_TTL=600                # Authorization TTL in seconds (default: 300)
PAPERWALL_NETWORK=eip155:324705682    # Network (default: SKALE testnet)
```

**Verify it's running:**
```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

See **[Docker deployment](#docker-deployment)** for full details including security best practices and volume management.

---

## Getting started (Cloud Run)

Deploy to Google Cloud Run for a fully managed, auto-scaling production server.

### Prerequisites
- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- A private key for your wallet

### Quick start

```bash
# Enable required APIs
gcloud services enable run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Create Artifact Registry repository
gcloud artifacts repositories create paperwall \
  --repository-format=docker \
  --location=us-central1

# Build and push image
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest packages/agent/
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest

# Store private key in Secret Manager
echo -n "0xYOUR_PRIVATE_KEY" | gcloud secrets create paperwall-private-key --data-file=-

# Deploy
gcloud run deploy paperwall-a2a \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=4000 \
  --set-secrets="PAPERWALL_PRIVATE_KEY=paperwall-private-key:latest" \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi
```

**Verify deployment:**
```bash
curl https://YOUR_SERVICE_URL.run.app/health
```

**Cost estimate:** ~$2-5/month for 10K requests with `min-instances=0`.

See **[Google Cloud Run deployment](#google-cloud-run-deployment)** for complete instructions including:
- Secret management best practices
- Custom domain setup
- Persistent storage options
- Monitoring and alerts
- Cost optimization strategies
- Security hardening

---

## Configuration

Config values are resolved with the following precedence (highest to lowest):

| Setting | CLI flag | Environment variable | Config file | Default |
|---------|----------|---------------------|-------------|---------|
| Port | `--port` | `PAPERWALL_PORT` | `server.json` | `4000` |
| Host | `--host` | `PAPERWALL_HOST` | `server.json` | `0.0.0.0` |
| Network | `--network` | `PAPERWALL_NETWORK` | `server.json` | `eip155:324705682` |
| Auth TTL | `--auth-ttl` | `PAPERWALL_AUTH_TTL` | `server.json` | `300` (5 minutes) |
| Access keys | -- | `PAPERWALL_ACCESS_KEYS` (comma-separated) | `server.json` | none (open access) |

The config file is located at `~/.paperwall/server.json`. Example:

```json
{
  "port": 4000,
  "host": "0.0.0.0",
  "network": "eip155:324705682",
  "authTtl": 300,
  "accessKeys": ["my-secret-key-1", "my-secret-key-2"]
}
```

---

## Endpoints reference

### `GET /.well-known/agent-card.json`

**Auth:** Public (no authentication required)

Returns the A2A Agent Card -- a JSON document that describes the server's capabilities. Other agents use this to discover what the server can do.

**Response:**

```json
{
  "name": "Paperwall Agent",
  "description": "Fetches x402-paywalled web content with automatic cryptocurrency micropayments...",
  "protocolVersion": "0.3.0",
  "version": "0.1.0",
  "url": "http://localhost:4000/rpc",
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    {
      "id": "fetch-content",
      "name": "Fetch Paywalled Content",
      "description": "Fetch a URL and automatically handle payment if the content is paywalled...",
      "tags": ["x402", "payment", "fetch", "paywall", "content"]
    }
  ],
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "stateTransitionHistory": true
  }
}
```

---

### `POST /rpc`

**Auth:** Bearer token (when access keys are configured)

The A2A JSON-RPC 2.0 endpoint. The supported method is `message/send`.

**Request body:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "messageId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "user",
      "parts": [
        {
          "kind": "data",
          "data": {
            "url": "https://example.com/article",
            "maxPrice": "0.10",
            "agentId": "my-agent"
          }
        }
      ]
    }
  }
}
```

**Message `data` fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The URL to fetch |
| `maxPrice` | string | No | Maximum USDC to pay for this request (human-readable, e.g. `"0.10"`) |
| `agentId` | string | No | Identifier for the calling agent (included in receipts) |

The executor also accepts a text part containing a URL as a fallback, but structured `data` parts are preferred.

**Success response** (content fetched, payment settled):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "id": "task-id",
    "status": { "state": "completed" },
    "history": [
      {
        "kind": "message",
        "role": "agent",
        "parts": [
          {
            "kind": "data",
            "data": {
              "ok": true,
              "url": "https://example.com/article",
              "content": "<html>...</html>",
              "contentType": "text/html",
              "payment": {
                "mode": "client",
                "amount": "100000",
                "amountFormatted": "0.10",
                "network": "eip155:324705682",
                "txHash": "0xabc123...",
                "payee": "0x..."
              },
              "receipt": {
                "id": "receipt-uuid",
                "ap2Stage": "settled",
                "timestamp": "2026-02-11T14:30:00.000Z"
              }
            }
          },
          {
            "kind": "text",
            "text": "Successfully fetched https://example.com/article (paid 0.10 USDC)"
          }
        ]
      }
    ]
  }
}
```

**Decline response** (budget exceeded):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "id": "task-id",
    "status": { "state": "completed" },
    "history": [
      {
        "kind": "message",
        "role": "agent",
        "parts": [
          {
            "kind": "data",
            "data": {
              "ok": false,
              "url": "https://example.com/article",
              "error": "budget_exceeded",
              "message": "Daily budget exceeded",
              "receipt": {
                "id": "receipt-uuid",
                "ap2Stage": "declined"
              }
            }
          },
          {
            "kind": "text",
            "text": "Failed to fetch https://example.com/article: Daily budget exceeded"
          }
        ]
      }
    ]
  }
}
```

---

### `GET /receipts`

**Auth:** Bearer token (when access keys are configured)

Returns an HTML page displaying all AP2 receipts with summary statistics. The page auto-refreshes every 10 seconds.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `stage` | string | Filter by AP2 stage: `settled`, `declined`, or `intent` |
| `from` | string | Start date filter (`YYYY-MM-DD` format) |
| `to` | string | End date filter (`YYYY-MM-DD` format) |

**Examples:**

```
GET /receipts?stage=settled
GET /receipts?from=2026-02-01&to=2026-02-28
GET /receipts?stage=declined&from=2026-02-01
```

---

### `GET /health`

**Auth:** Public (no authentication required)

Returns a simple health check response.

**Response:**

```json
{ "status": "ok" }
```

---

## Access control

When `PAPERWALL_ACCESS_KEYS` is set (via environment variable or `server.json`), the server requires a Bearer token on protected endpoints.

**Protected endpoints:** `/rpc`, `/receipts`

**Public endpoints:** `/.well-known/agent-card.json`, `/health`

Clients authenticate by including an `Authorization` header:

```
Authorization: Bearer my-secret-key
```

Keys are compared using HMAC-based timing-safe comparison. This prevents timing side-channel attacks that could leak key information through response-time differences. The implementation uses Node.js `crypto.createHmac()` and `crypto.timingSafeEqual()`.

When no access keys are configured, all endpoints are open. This is the default behavior and is suitable for local development. For any public deployment, you should configure access keys.

> **Production note:** The A2A server does not provide TLS termination. For production deployments, place it behind a reverse proxy (nginx, Caddy, or a cloud load balancer) that handles HTTPS. Never expose the server directly over HTTP on the public internet -- Bearer tokens sent over unencrypted connections can be intercepted.

---

## Docker deployment

The agent package includes a multi-stage Dockerfile based on `node:20-slim`.

**Build the image:**

```bash
docker build -t paperwall packages/agent/
```

**Run the server:**

```bash
docker run -p 4000:4000 \
  -e PAPERWALL_PRIVATE_KEY=0x... \
  -e PAPERWALL_ACCESS_KEYS=key1,key2 \
  -v paperwall-data:/app/.paperwall \
  paperwall serve
```

The `PAPERWALL_PRIVATE_KEY` environment variable provides the wallet private key directly, bypassing the encrypted wallet file. This is the recommended approach for containerized deployments.

> **Security warning:** `PAPERWALL_PRIVATE_KEY` is a raw private key with access to your funds. Never commit it to source control, log it, or expose it in CI output. Use Docker secrets, a secrets manager, or encrypted environment variables in production.

Mount a volume at `/app/.paperwall` to persist receipts and budget configuration across container restarts. Without a volume, receipt history is lost when the container stops.

The default `CMD` in the Dockerfile is `serve`, so `paperwall serve` runs automatically. You can override it to run other commands (e.g., `paperwall budget status`).

### Docker Compose

The agent package includes a `docker-compose.yml` for single-command startup. From the `packages/agent/` directory:

```bash
PAPERWALL_PRIVATE_KEY=0x... docker compose up -d
```

With access keys:

```bash
PAPERWALL_PRIVATE_KEY=0x... PAPERWALL_ACCESS_KEYS=key1,key2 docker compose up -d
```

The compose file configures:
- Port mapping from `PAPERWALL_PORT` (default 4000) to the container
- Authorization TTL from `PAPERWALL_AUTH_TTL` (default 300 seconds)
- A `paperwall-data` named volume for persistent receipts and budget data
- A health check against `/health` every 30 seconds
- `unless-stopped` restart policy

To override the network, port, or auth TTL, set the environment variables:

```bash
PAPERWALL_PRIVATE_KEY=0x... PAPERWALL_NETWORK=eip155:1187947933 PAPERWALL_PORT=8080 PAPERWALL_AUTH_TTL=600 docker compose up -d
```

Common operations:

```bash
docker compose logs -f        # Follow logs
docker compose down            # Stop the server
docker compose up -d --build   # Rebuild and restart after code changes
```

---

## Google Cloud Run deployment

Cloud Run is a fully managed platform that runs containers without infrastructure management. It auto-scales from zero to N instances based on traffic and charges per-request. This makes it ideal for A2A servers with variable request patterns.

### Prerequisites

1. **Google Cloud account** with billing enabled
2. **gcloud CLI** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. **Enable required APIs:**
   ```bash
   gcloud services enable run.googleapis.com \
     artifactregistry.googleapis.com \
     secretmanager.googleapis.com
   ```

### 1. Create an Artifact Registry repository

Cloud Run pulls container images from Artifact Registry (or Container Registry). Create a repository in your project's region:

```bash
gcloud artifacts repositories create paperwall \
  --repository-format=docker \
  --location=us-central1 \
  --description="Paperwall A2A server images"
```

Configure Docker to authenticate with Artifact Registry:

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 2. Build and push the image

Build the Docker image from the monorepo root:

```bash
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest \
  packages/agent/
```

Push to Artifact Registry:

```bash
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest
```

> **Tip:** Tag images with commit SHAs or semantic versions for rollback capability: `a2a-server:v1.0.0` or `a2a-server:abc123`.

### 3. Store secrets in Secret Manager

Never pass raw private keys via environment variables in Cloud Run. Use Secret Manager to store sensitive values securely.

**Create the private key secret:**

```bash
echo -n "0xYOUR_PRIVATE_KEY_HERE" | gcloud secrets create paperwall-private-key \
  --data-file=- \
  --replication-policy=automatic
```

**Create the access keys secret:**

```bash
echo -n "key1,key2,key3" | gcloud secrets create paperwall-access-keys \
  --data-file=- \
  --replication-policy=automatic
```

> **Security note:** Secrets are encrypted at rest and access is logged via Cloud Audit Logs. Grant the Cloud Run service account `roles/secretmanager.secretAccessor` on these secrets (this happens automatically when you reference secrets in the next step).

### 4. Deploy to Cloud Run

Deploy the service with secrets mounted as environment variables:

```bash
gcloud run deploy paperwall-a2a \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=4000 \
  --set-env-vars="PAPERWALL_PORT=4000,PAPERWALL_HOST=0.0.0.0,PAPERWALL_NETWORK=eip155:324705682" \
  --set-secrets="PAPERWALL_PRIVATE_KEY=paperwall-private-key:latest,PAPERWALL_ACCESS_KEYS=paperwall-access-keys:latest" \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300s \
  --concurrency=80
```

**Deployment flags explained:**

| Flag | Value | Reason |
|------|-------|--------|
| `--allow-unauthenticated` | N/A | The `.well-known/agent-card.json` and `/health` endpoints must be public for A2A discovery. Protected endpoints (`/rpc`, `/receipts`) use Bearer token auth |
| `--port` | `4000` | Must match the port the server listens on (default: 4000) |
| `--min-instances` | `0` | Scale to zero when idle to minimize costs. Use `1` if you need sub-second response times |
| `--max-instances` | `10` | Cap autoscaling to control costs. Adjust based on expected load |
| `--memory` | `512Mi` | The agent is lightweight. `256Mi` may suffice for low traffic, `1Gi` for high throughput |
| `--cpu` | `1` | One CPU is sufficient. Cloud Run allocates CPU only during request handling by default |
| `--timeout` | `300s` | Fetching paywalled content + on-chain settlement can take 10-30 seconds. Use at least 60s, up to 3600s (1 hour max) |
| `--concurrency` | `80` | How many concurrent requests one instance can handle. Default is 80. Reduce if requests are CPU-intensive |

After deployment, Cloud Run outputs the service URL:

```
Service [paperwall-a2a] revision [paperwall-a2a-00001-xyz] has been deployed and is serving 100% of traffic.
Service URL: https://paperwall-a2a-abc123-uc.a.run.app
```

### 5. Verify the deployment

Test the health endpoint:

```bash
curl https://YOUR_SERVICE_URL.run.app/health
```

Expected response:

```json
{ "status": "ok" }
```

Fetch the agent card (public endpoint):

```bash
curl https://YOUR_SERVICE_URL.run.app/.well-known/agent-card.json | jq
```

Test the RPC endpoint with authentication:

```bash
curl -X POST https://YOUR_SERVICE_URL.run.app/rpc \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer key1" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-123",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "url": "https://example.com",
              "maxPrice": "0.10"
            }
          }
        ]
      }
    }
  }' | jq
```

### 6. Configure a custom domain (optional)

Cloud Run assigns a generated domain (`*.run.app`). To use your own domain:

1. **Verify domain ownership** in Google Cloud Console
2. **Map the domain:**
   ```bash
   gcloud run domain-mappings create \
     --service=paperwall-a2a \
     --domain=paperwall.yourdomain.com \
     --region=us-central1
   ```
3. **Update DNS** with the CNAME records shown in the output

Cloud Run automatically provisions and renews TLS certificates for custom domains.

### 7. Persistent storage for receipts

By default, Cloud Run containers are stateless -- the filesystem is ephemeral and resets between deployments. Receipts stored at `/app/.paperwall/receipts.jsonl` will be lost.

**Option A: Mount a Cloud Storage bucket (FUSE)**

Mount a Cloud Storage bucket as a filesystem using Cloud Run's volume mounts:

1. **Create a bucket:**
   ```bash
   gcloud storage buckets create gs://YOUR_PROJECT_ID-paperwall-data \
     --location=us-central1
   ```

2. **Update the deployment:**
   ```bash
   gcloud run deploy paperwall-a2a \
     --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/paperwall/a2a-server:latest \
     --add-volume=name=data,type=cloud-storage,bucket=YOUR_PROJECT_ID-paperwall-data \
     --add-volume-mount=volume=data,mount-path=/app/.paperwall \
     [... other flags from step 4 ...]
   ```

> **Note:** Cloud Storage FUSE has limitations -- it's eventually consistent and may not be suitable for high-concurrency writes. For append-only JSONL files (receipts), this is acceptable.

**Option B: Use Cloud Firestore or BigQuery**

For production workloads, consider replacing the file-based receipt storage with a managed database:
- **Firestore** -- Document database, good for structured receipts with querying
- **BigQuery** -- Data warehouse, good for analytics on historical receipts

This requires code changes to the agent (`src/server/receipt-store.ts`).

**Option C: Accept ephemeral receipts**

If receipts are only for short-term monitoring and you have external logging (Cloud Logging), you may not need persistent storage. Receipts are logged to stdout/stderr and captured by Cloud Logging.

### 8. Monitoring and logs

Cloud Run integrates with Google Cloud's observability stack by default.

**View logs:**

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=paperwall-a2a" \
  --limit=50 \
  --format=json
```

Or use the Cloud Console: **Cloud Run** → **paperwall-a2a** → **Logs** tab.

**Key metrics to monitor:**
- **Request count** -- Total RPC requests
- **Request latency** -- Time to fetch + settle payments
- **Container instance count** -- Autoscaling behavior
- **Billable time** -- Actual cost (charged per 100ms of CPU + memory usage)
- **Error rate** -- 4xx (client errors) and 5xx (server errors)

Set up alerts in Cloud Monitoring for:
- Error rate > 5%
- P95 latency > 30s
- Budget decline rate > 20%

**Cloud Run dashboard:**

```bash
gcloud run services describe paperwall-a2a --region=us-central1 --format=yaml
```

### 9. Cost optimization

Cloud Run charges are based on:
1. **Request time** -- CPU + memory allocated during request handling
2. **Container instance time** -- Memory allocated while idle (if `min-instances > 0`)
3. **Egress** -- Network traffic to external services (facilitator, blockchain RPC)

**Cost-saving tips:**

| Strategy | Impact |
|----------|--------|
| Set `--min-instances=0` | Scale to zero when idle. No charge for idle time, but first request after idle has ~1s cold start |
| Right-size memory | Start with `512Mi`. Monitor actual usage and reduce to `256Mi` if consistently below 50% |
| Use `--cpu-boost` for cold starts | Allocate more CPU during instance startup to reduce cold start latency (costs slightly more) |
| Enable request coalescing | If multiple agents request the same URL simultaneously, consider caching responses (requires code changes) |
| Batch receipt writes | Write receipts to Cloud Storage in batches instead of per-request (requires code changes) |

**Example monthly cost** (us-central1 pricing as of Feb 2025):
- 10,000 requests/month
- 5s average request duration
- 512Mi memory, 1 CPU
- `min-instances=0`

Estimated: **$2-5/month** (plus egress and blockchain transaction costs)

### 10. Security hardening

**Enable VPC connector (optional):**

If your facilitator or blockchain RPC endpoints are in a private VPC, attach a VPC connector:

```bash
gcloud compute networks vpc-access connectors create paperwall-connector \
  --region=us-central1 \
  --range=10.8.0.0/28

gcloud run deploy paperwall-a2a \
  --vpc-connector=paperwall-connector \
  --vpc-egress=private-ranges-only \
  [... other flags ...]
```

**Limit ingress:**

By default, Cloud Run allows all internet traffic. To restrict to specific sources:

```bash
gcloud run deploy paperwall-a2a \
  --ingress=internal-and-cloud-load-balancing \
  [... other flags ...]
```

Then place Cloud Armor (DDoS protection) or Identity-Aware Proxy in front.

**Rotate secrets:**

Update secrets without redeploying:

```bash
echo -n "NEW_PRIVATE_KEY" | gcloud secrets versions add paperwall-private-key --data-file=-

# Force Cloud Run to pick up the new version
gcloud run services update paperwall-a2a --region=us-central1
```

**Audit access:**

Review who accessed secrets:

```bash
gcloud logging read "protoPayload.serviceName=secretmanager.googleapis.com" \
  --limit=50 \
  --format=json
```

---

## Running the demo

The `demo` command runs an AP2 lifecycle demonstration against a running server. It discovers the agent card, sends multiple fetch requests, and outputs a JSON audit trail.

**Start the server in one terminal:**

```bash
paperwall serve --port 4000
```

**Run the demo in another terminal:**

```bash
paperwall demo --server http://localhost:4000 \
  --articles https://example.com/article-1 https://example.com/article-2 \
  --agent-key key1
```

**Demo options:**

| Option | Description |
|--------|-------------|
| `-s, --server <url>` | Paperwall server URL (required) |
| `-a, --articles <urls...>` | Article URLs to fetch |
| `-k, --agent-key <key>` | Bearer token for authentication |
| `-v, --verbose` | Show content preview on stderr and include plain-text content in JSON output |

The demo writes human-readable progress to stderr and a structured JSON audit trail to stdout.

**stderr output** shows a tree for each article with AP2 lifecycle stages:

```
[1/2] Fetching https://example.com/article-1
  ├── AP2 Intent: requesting $0.05 USDC
  ├── AP2 Authorization: passed (daily $0.25/$5.00)
  ├── AP2 Settlement: $0.05 USDC — tx 0xabc1234567...
  └── AP2 Receipt: r1-uuid-goes... [settled]

[2/2] Fetching https://example.com/article-2
  ├── AP2 Intent: requesting $0.50 USDC
  ├── AP2 Authorization: DENIED — daily ($5.00) exceeded
  └── AP2 Receipt: r2-uuid-goes... [declined]

--- Demo Summary ---
Total requests: 2
Successful: 1
Declined: 1
Total spent: $0.05 USDC
Explorer links:
  https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xabc...
```

With `--verbose`, each settled step also shows payer/payee addresses, a block explorer link, and a 200-character content preview.

**JSON output** (stdout):

```json
{
  "ok": true,
  "summary": {
    "totalRequests": 2,
    "successfulFetches": 1,
    "declinedFetches": 1,
    "totalUsdcSpent": "0.05",
    "explorerLinks": ["https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xabc..."]
  },
  "results": [
    {
      "url": "https://example.com/article-1",
      "outcome": "fetched",
      "payment": {
        "amountFormatted": "0.05",
        "txHash": "0xabc...",
        "network": "eip155:324705682",
        "payer": "0x1111...1111",
        "payee": "0x2222...2222"
      },
      "receipt": { "id": "r1-uuid", "ap2Stage": "settled" },
      "authorization": {
        "perRequestLimit": "0.10",
        "dailyLimit": "5.00",
        "totalLimit": "50.00",
        "dailySpent": "0.25",
        "totalSpent": "1.50",
        "requestedAmount": "0.05"
      },
      "decline": null,
      "verification": {
        "explorerUrl": "https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xabc...",
        "network": "eip155:324705682"
      }
    }
  ]
}
```

With `--verbose`, each result also includes `content` (plain text, HTML stripped) and `contentType`.

---

## Integration example

This example shows a complete flow: discovering the agent, sending a fetch request, and handling the response using plain `fetch()`.

```typescript
// 1. Discover the agent
const card = await fetch('http://localhost:4000/.well-known/agent-card.json')
  .then(r => r.json());

console.log(`Found: ${card.name}`);
console.log(`Protocol: ${card.protocolVersion}`);
console.log(`Skills: ${card.skills.map((s: { name: string }) => s.name).join(', ')}`);
console.log(`RPC endpoint: ${card.url}`);

// 2. Send a fetch request via JSON-RPC
const rpcResponse = await fetch('http://localhost:4000/rpc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer my-secret-key',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        messageId: crypto.randomUUID(),
        role: 'user',
        parts: [
          {
            kind: 'data',
            data: {
              url: 'https://example.com/article',
              maxPrice: '0.10',
              agentId: 'my-integration',
            },
          },
        ],
      },
    },
  }),
});

const rpcResult = await rpcResponse.json();

// 3. Extract the response
const task = rpcResult.result;
const lastMessage = task.history?.at(-1);
const dataPart = lastMessage?.parts?.find((p: { kind: string }) => p.kind === 'data');
const data = dataPart?.data;

if (data?.ok) {
  console.log(`Content length: ${data.content.length}`);
  console.log(`Content type: ${data.contentType}`);

  if (data.payment) {
    console.log(`Paid: ${data.payment.amountFormatted} USDC`);
    console.log(`Tx: ${data.payment.txHash}`);
  } else {
    console.log('Content was free (no payment required)');
  }

  console.log(`Receipt: ${data.receipt.id} [${data.receipt.ap2Stage}]`);
} else {
  console.error(`Failed: ${data?.error} -- ${data?.message}`);
  console.error(`Receipt: ${data?.receipt?.id} [${data?.receipt?.ap2Stage}]`);
}
```

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Server fails to start with "No wallet configured" | No wallet file at `~/.paperwall/wallet.json` | Run `paperwall wallet create` |
| 401 on `/rpc` or `/receipts` | Access keys are configured but request has no `Authorization` header | Add `Authorization: Bearer <key>` header matching one of the configured keys |
| `message/send` returns `"error": "url parameter is required"` | The message parts do not contain a `data` part with a `url` field | Send a `data` part with `{ "url": "https://..." }` (see request format above) |
| Receipt shows `ap2Stage: "declined"` with `budget_exceeded` | A budget limit was hit | Check budget with `paperwall budget status` and increase limits with `budget set` |
| Receipt shows `ap2Stage: "declined"` with `max_price_exceeded` | The content price exceeds the `maxPrice` in the request | Increase the `maxPrice` value in the request data, or omit it to use the per-request budget limit |
| Content returned but no payment in response | The page was not paywalled | This is normal. Free content returns `"payment": null` with an `intent` receipt |
| Port already in use | Another process is listening on the configured port | Use `--port` to specify a different port, or stop the conflicting process |
| Receipts file growing too large | Many requests over time | The JSONL file is append-only. Archive or rotate `~/.paperwall/receipts.jsonl` manually |
| Transaction settled but content is empty | Publisher returned empty content after payment | This is a publisher-side issue. The receipt confirms the payment was made; contact the publisher |

---

## Related documentation

- [How Paperwall works](how-it-works.md) -- Plain-language overview of paywalls and payment flow
- [MCP server guide](mcp-server-guide.md) -- MCP integration for Claude Code, Cursor, Windsurf, Codex, OpenCode, Claude Desktop
- [AI agent setup](ai-agent-setup.md) -- Skill-based setup for Gemini CLI and Claude Code
- [Agent CLI guide](agent-cli-guide.md) -- Full CLI reference (wallet, budget, fetch, history commands)
- [Architecture deep dive](architecture.md) -- Full system architecture, payment flows, and security model
- [Developer guide](developer-guide.md) -- Build, test, and contribute to Paperwall
