# Paperwall Integration Tests

Comprehensive integration tests that verify all 5 components work together correctly.

## Components Tested

1. **SDK** (`packages/sdk`) - Publisher-facing JavaScript SDK
2. **Extension** (`packages/extension`) - Chrome browser extension
3. **Agent CLI** (`packages/agent`) - Command-line tool
4. **A2A Server** - Agent-to-Agent protocol server
5. **Demo** (`demo/`) - Demo website with paywalled content

## Test Structure

```
test/integration/
├── setup.ts                    # Shared test environment setup
├── 01-sdk-extension.test.ts    # SDK ↔ Extension communication
├── 02-agent-cli-demo.test.ts   # Agent CLI ↔ Demo website
├── 03-a2a-server.test.ts       # A2A Server functionality
├── 04-extension-payment-flow.test.ts  # Extension payment lifecycle
├── 05-end-to-end.test.ts       # All 5 components together
├── vitest.config.ts            # Test configuration
└── README.md                   # This file
```

## Running Tests

### All Integration Tests

```bash
npm run test:integration
```

### Specific Test Suite

```bash
npx vitest run test/integration/01-sdk-extension.test.ts
```

### Watch Mode

```bash
npx vitest test/integration/
```

### With Coverage

```bash
npx vitest run --coverage test/integration/
```

## Prerequisites

Before running integration tests:

1. **Build all packages:**
   ```bash
   npm run build
   ```

2. **Set environment variables:**
   ```bash
   export TEST_FACILITATOR_URL=https://gateway.kobaru.io
   ```

3. **Optional: Start local facilitator** (for offline testing)
   ```bash
   # In separate terminal
   cd ../gateway
   npm start
   ```

## Test Scenarios

### 01: SDK ↔ Extension

- ✅ SDK emits x402-payment-required meta tag
- ✅ SDK sends postMessage events
- ✅ SDK responds to PAPERWALL_PING
- ✅ SDK handles PAPERWALL_PAYMENT_RESULT
- ✅ SDK validates configuration
- ✅ SDK renders badge

### 02: Agent CLI ↔ Demo

- ✅ Creates wallet with encryption
- ✅ Sets and enforces budget limits
- ✅ Fetches free content
- ✅ Detects payment requirements
- ✅ Processes payments
- ✅ Records payment history
- ✅ Handles 402 responses

### 03: A2A Server

- ✅ Exposes agent card at /.well-known/agent-card.json
- ✅ Health check endpoint
- ✅ Bearer token authentication
- ✅ JSON-RPC 2.0 message/send
- ✅ Receipt tracking and viewing
- ✅ Date/stage filtering
- ✅ Security headers
- ✅ Timing-safe key comparison

### 04: Extension Payment Flow

- ✅ Wallet creation with password strength
- ✅ Payment signal detection
- ✅ Origin validation
- ✅ Balance fetching and caching
- ✅ EIP-712 signing
- ✅ Facilitator communication
- ✅ History recording with limits
- ✅ SSRF protection
- ✅ Concurrent payment prevention

### 05: End-to-End

- ✅ SDK → Extension → Facilitator flow
- ✅ Agent CLI fetches paywalled content
- ✅ A2A server processes requests
- ✅ Receipt creation
- ✅ Consistent facilitator usage
- ✅ Uniform payment format
- ✅ Health checks
- ✅ Budget enforcement across components
- ✅ History consistency
- ✅ Error handling

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_FACILITATOR_URL` | Facilitator service URL | `https://gateway.kobaru.io` |
| `PAPERWALL_DATA_DIR` | Test wallet directory | Auto-generated temp dir |
| `PAPERWALL_ACCESS_KEYS` | A2A server test keys | `test-key-123` |

## Mocking

Integration tests use **minimal mocking**. They test real HTTP requests, real crypto operations, and real file I/O. Mocks are only used for:

- Chrome extension APIs (not available in Node.js)
- Blockchain RPC calls (to avoid testnet dependencies)
- Long-running operations (wallet encryption with reduced iterations)

## CI/CD Integration

To run in CI:

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npm run test:integration
        env:
          TEST_FACILITATOR_URL: https://gateway.kobaru.io
```

## Troubleshooting

### Port conflicts

Tests run sequentially (`singleFork: true`) to avoid port conflicts. If you still see errors:

```bash
# Kill processes on test ports
lsof -ti:8080 | xargs kill -9
lsof -ti:4000 | xargs kill -9
```

### Build failures

Ensure all packages are built before running tests:

```bash
npm run build --workspaces
```

### Timeout errors

Integration tests have 30s timeout. Increase if needed:

```bash
VITEST_TEST_TIMEOUT=60000 npx vitest run test/integration/
```

### Facilitator unavailable

Tests will skip payment flows if facilitator is unreachable. To test offline:

1. Start local facilitator
2. Set `TEST_FACILITATOR_URL=http://localhost:3000`

## Adding New Tests

1. Create test file: `test/integration/XX-feature.test.ts`
2. Import `setup.ts` helpers
3. Use `describe` and `it` blocks
4. Add to this README

Example:

```typescript
import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from './setup';

describe('New Feature Integration', () => {
  it('does something end-to-end', async () => {
    const env = await setupTestEnvironment();

    // Your test here

    await env.cleanup();
  });
});
```

## Coverage Goals

- **Unit tests**: 80%+ per package
- **Integration tests**: 90%+ critical paths
- **E2E tests**: 100% happy paths + major error cases

Current coverage: Run `npm run test:integration -- --coverage` to see.
