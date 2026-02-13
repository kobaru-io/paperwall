# Paperwall Testing Strategy

Comprehensive testing across all 5 components to ensure system reliability.

## Testing Pyramid

```
                    ▲
                   ╱ ╲
                  ╱ E2E╲           6 tests (end-to-end scenarios)
                 ╱━━━━━━━╲
                ╱         ╲
               ╱Integration╲       60+ tests (component interactions)
              ╱━━━━━━━━━━━━━╲
             ╱               ╲
            ╱   Unit Tests    ╲    300+ tests (individual functions)
           ╱━━━━━━━━━━━━━━━━━━━╲
          ╱                     ╲
         ╱_______________________╲
```

## Test Structure

```
test/
├── integration/                      # Integration tests (NEW)
│   ├── setup.ts                      # Shared test environment
│   ├── 01-sdk-extension.test.ts      # SDK ↔ Extension
│   ├── 02-agent-cli-demo.test.ts     # Agent CLI ↔ Demo
│   ├── 03-a2a-server.test.ts         # A2A Server
│   ├── 04-extension-payment-flow.test.ts  # Extension flow
│   ├── 05-end-to-end.test.ts         # All 5 components
│   ├── 06-realistic-user-flow.test.ts     # User scenarios
│   ├── package.json                  # Integration test config
│   ├── vitest.config.ts              # Vitest settings
│   └── README.md                     # Integration test docs
│
packages/
├── sdk/__tests__/                    # SDK unit tests
│   ├── signal.test.ts
│   ├── badge.test.ts
│   ├── messaging.test.ts
│   ├── config.test.ts
│   └── index.test.ts
│
├── extension/__tests__/              # Extension unit tests
│   ├── key-manager.test.ts
│   ├── signer.test.ts
│   ├── facilitator.test.ts
│   ├── balance.test.ts
│   ├── detector.test.ts
│   ├── bridge.test.ts
│   ├── payment-flow.test.ts
│   ├── message-router.test.ts
│   └── history.test.ts
│
└── agent/src/                        # Agent unit tests
    ├── wallet.test.ts
    ├── budget.test.ts
    ├── signer.test.ts
    ├── facilitator.test.ts
    ├── payment-engine.test.ts
    ├── cli.test.ts
    ├── balance.test.ts
    ├── history.test.ts
    └── (more...)
```

## Component Test Coverage

### 1. SDK (`packages/sdk`)

**Unit Tests (5 files, ~40 tests)**
- ✅ Config parsing and validation
- ✅ Signal emission (x402 meta tag)
- ✅ Badge rendering and styling
- ✅ postMessage communication
- ✅ Extension detection (ping/pong)

**Integration Tests**
- ✅ SDK → Extension messaging
- ✅ Payment result handling
- ✅ Error propagation

### 2. Extension (`packages/extension`)

**Unit Tests (9 files, ~80 tests)**
- ✅ Wallet creation and encryption
- ✅ EIP-712 signature generation
- ✅ Payment flow orchestration
- ✅ Facilitator API calls
- ✅ Balance checking and caching
- ✅ History tracking (1000 record limit)
- ✅ Content script detection
- ✅ Bridge origin validation
- ✅ Message routing

**Integration Tests**
- ✅ Complete payment lifecycle
- ✅ SSRF protection
- ✅ Concurrent payment prevention
- ✅ Password strength enforcement

### 3. Agent CLI (`packages/agent`)

**Unit Tests (13 files, ~120 tests)**
- ✅ Wallet management
- ✅ Budget enforcement (BigInt arithmetic)
- ✅ Payment engine (3 modes)
- ✅ CLI commands
- ✅ HTTP 402 handling
- ✅ Signer and facilitator clients
- ✅ History tracking (JSONL)
- ✅ Network configuration

**Integration Tests**
- ✅ Fetch from demo site
- ✅ Budget limits respected
- ✅ History recording
- ✅ Error handling (exit codes)

### 4. A2A Server (`packages/agent/src/server`)

**Unit Tests (included in agent tests)**
- ✅ Agent card generation
- ✅ JSON-RPC 2.0 handling
- ✅ Receipt management (JSONL)
- ✅ Access control (timing-safe)
- ✅ Config resolution

**Integration Tests**
- ✅ Agent card discovery
- ✅ RPC endpoint authentication
- ✅ Receipt viewer with filters
- ✅ AP2 lifecycle (intent → settled)
- ✅ Security headers

### 5. Demo (`demo/`)

**Integration Tests Only**
- ✅ SDK initialization
- ✅ Payment signal emission
- ✅ Agent CLI fetching
- ✅ End-to-end flow

## Running Tests

### All Tests

```bash
# Unit + Integration
npm run test:all

# Just unit tests
npm run test:unit

# Just integration tests
npm run test:integration
```

### By Component

```bash
# SDK unit tests
npm test --workspace=@paperwall/sdk

# Extension unit tests
npm test --workspace=@paperwall/extension

# Agent unit tests
npm test --workspace=@paperwall/agent

# Integration tests
npm test --workspace=@paperwall/integration-tests
```

### Specific Test Files

```bash
# SDK ↔ Extension integration
npx vitest run test/integration/01-sdk-extension.test.ts

# End-to-end flow
npx vitest run test/integration/05-end-to-end.test.ts

# Realistic user scenarios
npx vitest run test/integration/06-realistic-user-flow.test.ts
```

### Watch Mode

```bash
# Watch all tests
npm run test:watch

# Watch integration tests
npm run test:integration -- --watch

# Watch specific file
npx vitest test/integration/01-sdk-extension.test.ts
```

### Coverage

```bash
# Generate coverage report
npm run test:all -- --coverage

# Integration tests coverage
npm run test:integration -- --coverage

# View HTML report
open coverage/index.html
```

## Integration Test Scenarios

### 01: SDK ↔ Extension
Tests SDK signal emission and extension detection via postMessage and meta tags.

**Key Tests:**
- Meta tag creation with base64-encoded config
- postMessage event firing
- Ping/pong extension detection
- Payment result handling
- Badge rendering
- Config validation

### 02: Agent CLI ↔ Demo
Tests agent CLI fetching content from demo website with budget enforcement.

**Key Tests:**
- Wallet creation
- Budget setting and enforcement
- Free content fetching
- Payment requirement detection
- History tracking
- Exit code handling (0, 1, 2, 3)

### 03: A2A Server
Tests A2A protocol server endpoints and authentication.

**Key Tests:**
- Agent card discovery (public endpoint)
- Health check
- Bearer token authentication
- JSON-RPC 2.0 message/send
- Receipt tracking and filtering
- Security headers (X-Frame-Options, CSP)
- Timing-safe key comparison

### 04: Extension Payment Flow
Tests complete extension payment lifecycle with mocked Chrome APIs.

**Key Tests:**
- Wallet encryption/decryption
- Payment detection
- Origin validation
- Balance checking and caching (30s TTL)
- EIP-712 signing
- Facilitator /supported and /settle calls
- History recording (1000 limit)
- SSRF protection
- Concurrent payment prevention

### 05: End-to-End (Optional, requires .env.test)
Tests all 5 components working together with real testnet credentials.

**When to run:**
- Before shipping to production
- During integration test phase (not CI by default)
- When validating against real facilitator

**Prerequisites:**
- `.env.test` with `PAPERWALL_PRIVATE_KEY` and `TEST_PAY_TO`
- Testnet USDC funded in reader wallet (minimum $0.01)
- `npm run build` executed first

**Key Tests:**
- SDK → Extension → Facilitator flow
- Agent CLI fetches demo content
- A2A server processes requests
- Receipt creation for all payments
- Consistent facilitator usage
- Uniform payment format (EIP-3009)
- Budget enforcement across components
- Error handling consistency

**Automatic skip:**
Tests skip automatically if `.env.test` credentials are missing or invalid — no failures, just skip with message "Skipping E2E: missing .env.test credentials".

### 06: Realistic User Flow
Simulates actual user journeys from publisher integration to reader payment.

**Key Tests:**
- Publisher adds SDK script tag
- Reader visits paywalled page
- Extension detects and prompts
- Reader approves payment
- Content unlocked
- AI agent discovers A2A server
- AI agent fetches via RPC
- Receipt tracking
- Error scenarios (insufficient balance, budget exceeded, facilitator down)
- Security validation (address, price, network, URL, origin)

## Test Environment

### Prerequisites

```bash
# Install dependencies
npm install

# Build all packages
npm run build
```

### Environment Variables

#### For Unit & Mocked Integration Tests (always run)

No env vars needed — tests use mocks.

#### For E2E Tests (Integration Test 05, optional)

E2E tests require real testnet credentials in `.env.test` at the project root. **This file is gitignored and should never be committed.**

**Setup:**

1. **Copy the template:**
   ```bash
   cp .env.test.example .env.test
   ```

2. **Edit `.env.test` with real testnet credentials:**
   ```bash
   # Reader/client wallet private key (signs payments)
   # ⚠️  TESTNET-ONLY key with small USDC balance on SKALE testnet
   PAPERWALL_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

   # Publisher wallet address (receives payments)
   TEST_PAY_TO=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7

   # Facilitator URL (default: SKALE testnet gateway)
   TEST_FACILITATOR_URL=https://gateway.kobaru.io

   # CAIP-2 network identifier (default: SKALE testnet)
   TEST_NETWORK=eip155:324705682

   # Price in smallest units (USDC has 6 decimals)
   # 1 = 0.000001 USDC — run unlimited tests with minimal cost
   # Common values:
   #   1      = 0.000001 USDC (unlimited free tests)
   #  10000   = 0.01 USDC (1 penny per test)
   # 100000   = 0.1 USDC (10 cents per test)
   TEST_PRICE=1

   # A2A server access key for test authentication
   TEST_ACCESS_KEY=your-test-key-here
   ```

3. **Fund the reader wallet with testnet USDC:**
   - Get the address derived from `PAPERWALL_PRIVATE_KEY` (tests will print it)
   - Get testnet ETH from a SKALE testnet faucet
   - Bridge USDC to that address (via SKALE Bridge or faucet)
   - Minimum: $0.01 USDC (costs almost nothing on SKALE, gas fee is ~$0)

4. **Run E2E tests:**
   ```bash
   npm run test:integration
   ```
   - Tests will skip automatically if `.env.test` is missing or has placeholder values
   - No real USDC is spent unless tests actually trigger payments

**Environment Variable Reference:**

| Variable | Purpose | Example |
|----------|---------|---------|
| `PAPERWALL_PRIVATE_KEY` | Reader's private key (signs payments) | `0xac09...` |
| `TEST_PAY_TO` | Publisher's wallet address (receives USDC) | `0x742d...` |
| `TEST_FACILITATOR_URL` | x402 facilitator service URL | `https://gateway.kobaru.io` |
| `TEST_NETWORK` | Blockchain network (CAIP-2 format) | `eip155:324705682` |
| `TEST_PRICE` | Price in smallest units (6 decimals) | `1` = 0.000001 USDC |
| `TEST_ACCESS_KEY` | Bearer token for A2A server auth | `test-key-xyz` |

**How it works:**
- `.env.test` is loaded at test import time by `test/integration/setup.ts` (zero dependencies, plain fs + string parsing)
- Explicit env vars always take precedence (can override `.env.test` with `export PAPERWALL_PRIVATE_KEY=...`)
- Tests skip gracefully if credentials are missing/invalid — no failure, just skip

**Cost example:**
- At `TEST_PRICE=1` (0.000001 USDC per test):
  - 1 test run = ~0.000001 USDC
  - 1,000 test runs = ~0.001 USDC
  - 1,000,000 test runs = ~$1 USDC
  - SKALE testnet gas = $0 (always)

### Mock vs Real Services

| Component | Integration Tests | Mocking Strategy |
|-----------|-------------------|------------------|
| SDK | Real JSDOM, real bundle | No mocks |
| Extension | Mock Chrome APIs | Full Chrome API mocks |
| Agent CLI | Real file I/O, real crypto | Mock blockchain RPC |
| A2A Server | Real Express server | Mock wallet operations |
| Facilitator | Real HTTP (if available) | Skip tests if unavailable |
| Demo | Real HTTP server | Python SimpleHTTPServer |

## CI/CD Integration

### GitHub Actions Workflow

`.github/workflows/integration-tests.yml` runs:

1. **Build** all packages
2. **Unit tests** across all workspaces
3. **Integration tests** with test facilitator
4. **E2E tests** with demo server running
5. **Coverage upload** to Codecov

**Matrix testing:**
- Node.js 18.x and 20.x
- Ubuntu latest

## Coverage Goals

| Layer | Target | Current |
|-------|--------|---------|
| Unit Tests | 80%+ | Run `npm run test:unit -- --coverage` |
| Integration Tests | 90% critical paths | Run `npm run test:integration -- --coverage` |
| E2E Tests | 100% happy paths | Run `npx vitest run test/integration/05-end-to-end.test.ts` |

## Adding New Tests

### Unit Test

```typescript
// packages/sdk/__tests__/new-feature.test.ts
import { describe, it, expect } from 'vitest';
import { newFeature } from '../src/new-feature';

describe('newFeature', () => {
  it('does something', () => {
    const result = newFeature('input');
    expect(result).toBe('expected');
  });
});
```

### Integration Test

```typescript
// test/integration/07-new-integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment } from './setup';

describe('New Integration', () => {
  let env;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('tests component interaction', async () => {
    // Your test here
  });
});
```

## Troubleshooting

### Tests timing out

Increase timeout in `vitest.config.ts`:

```typescript
testTimeout: 60000, // 60 seconds
```

### Port conflicts

Tests use:
- 8080 (demo server)
- 4000 (A2A server)

Kill processes:

```bash
lsof -ti:8080 | xargs kill -9
lsof -ti:4000 | xargs kill -9
```

### Build errors

Ensure packages are built:

```bash
npm run build --workspaces
```

### Chrome API mocks missing

Add to test file:

```typescript
beforeEach(() => {
  (global as any).chrome = {
    storage: { local: {}, session: {} },
    runtime: { sendMessage: vi.fn() },
    // ...
  };
});
```

## Performance

- **Unit tests**: ~5-10 seconds (300+ tests)
- **Integration tests**: ~30-60 seconds (60+ tests)
- **E2E tests**: ~10-20 seconds (6 tests)
- **Total**: ~1-2 minutes for full suite

Parallel execution disabled (`singleFork: true`) to avoid port conflicts.

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [JSDOM Documentation](https://github.com/jsdom/jsdom)
- [Testing Best Practices](https://testingjavascript.com/)
- [Integration Test Patterns](https://martinfowler.com/articles/integration-contract-test.html)
