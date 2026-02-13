# Contributing to Paperwall

Thank you for your interest in contributing to Paperwall. This document explains how to set up your development environment, find issues to work on, and submit pull requests.

---

## Getting started

1. **Read the [developer guide](docs/developer-guide.md)** for a thorough walkthrough of the architecture, code structure, and build system.

2. **Set up your environment:**

   ```bash
   git clone https://github.com/kobaru/paperwall.git
   cd paperwall
   npm install
   npm run build
   npm test
   ```

   All tests should pass. If they don't, check that you're running Node.js 18+ (`node --version`).

3. **Load the extension** for manual testing: see the [development setup instructions](docs/developer-guide.md#loading-the-extension-for-development).

---

## Finding issues to work on

- **Good first issues:** Look for issues labeled `good-first-issue` on the [GitHub Issues page](https://github.com/kobaru/paperwall/issues). These are scoped, well-defined tasks suitable for new contributors.

- **Backlog:** Issues labeled `low-priority` are non-urgent improvements that are welcome contributions.

- **Feature requests:** If you want to build something new, open an issue first to discuss the approach. This prevents wasted effort if the feature doesn't fit the project direction.

---

## Development workflow

### 1. Fork and branch

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/paperwall.git
cd paperwall
git remote add upstream https://github.com/kobaru/paperwall.git
git checkout -b your-feature-branch
```

### 2. Make your changes

- Write your code following the conventions described below
- Add or update tests to cover your changes
- Make sure the demo site still works if you changed the SDK or extension

### 3. Verify everything passes

```bash
npm test          # All tests must pass
npm run lint      # Type checking must pass
npm run build     # All packages must build
```

### 4. Commit your changes

Use clear, descriptive commit messages. We prefer [conventional commits](https://www.conventionalcommits.org/):

```
feat(sdk): add support for multiple payment offers
fix(extension): prevent concurrent payments on same tab
docs: update publisher guide with server mode example
test(agent): add budget edge case coverage
refactor(extension): extract balance cache to separate module
```

The format is: `type(scope): description`

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `chore` | Build system, tooling, or dependency updates |

### 5. Submit a pull request

Push your branch and open a PR against `main`:

```bash
git push origin your-feature-branch
```

In your PR description:
- **What** the change does and **why**
- Link to the issue it addresses (if any)
- How to test the change
- Screenshots for UI changes (extension popup)

---

## Code style

### TypeScript

- **Strict mode** -- all packages have strict TypeScript enabled
- **Explicit types** -- prefer explicit return types on exported functions
- **No `any`** -- avoid `any` where possible; use `unknown` and narrow instead
- **Readonly** -- use `readonly` on interface properties and function parameters where appropriate

### Naming conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `payment-engine.ts` |
| Functions | camelCase | `fetchBalance()` |
| Classes | PascalCase | `FacilitatorError` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_UNLOCK_ATTEMPTS` |
| Interfaces | PascalCase | `PaymentRecord` |
| Type parameters | Single uppercase letter or PascalCase | `T`, `SendResponse` |

### Code organization

- Keep files focused on a single responsibility
- Co-locate tests with source files (agent) or in `__tests__/` directories (SDK, extension)
- Use section comments for logical groupings within a file:

```typescript
// -- Types -----------------------------------------------

// -- Public API ------------------------------------------

// -- Internal Helpers ------------------------------------
```

---

## Testing guidelines

### Write tests for

- All exported functions
- Error paths and edge cases
- Security-sensitive operations (wallet encryption, signing, origin validation)
- Message handling (all message types in the router)

### Test patterns

- Use `vi.fn()` for mocking functions
- Use `vi.spyOn()` when you need to verify calls on real objects
- Reset mocks between tests with `beforeEach(() => { vi.resetAllMocks(); })`
- Test both success and failure paths

### What to test

| Package | Focus areas |
|---------|-------------|
| SDK | Config validation (reject invalid addresses, URLs, prices), signal emission, messaging timeouts |
| Extension | Message router authorization, payment flow orchestration, brute-force lockout, SSRF protection, balance caching |
| Agent | Budget enforcement, payment mode detection (402 vs client vs server), CLI argument parsing, exit codes |

---

## Pull request checklist

Before submitting your PR, verify:

- [ ] `npm test` passes with no failures
- [ ] `npm run lint` reports no type errors
- [ ] `npm run build` completes successfully
- [ ] New code has corresponding tests
- [ ] Commit messages follow the conventional format
- [ ] PR description explains the change and links to any related issues
- [ ] No secrets, API keys, or private keys in the code
- [ ] No unrelated changes (keep PRs focused)

---

## Security issues

If you discover a security vulnerability, **do not open a public issue**. Instead:

1. Go to the [GitHub Security Advisories page](https://github.com/kobaru/paperwall/security/advisories) for the repository
2. Click "Report a vulnerability"
3. Describe the issue with steps to reproduce

We take security seriously and will respond promptly.

---

## Tech stack rationale

Understanding why we chose specific technologies helps you make consistent decisions when contributing.

### TypeScript 5.9.3

**Why TypeScript:**
- Type safety prevents entire classes of bugs (null checks, type mismatches)
- Better IDE support (autocomplete, refactoring)
- Self-documenting code (types as inline documentation)
- Required by viem 2.x

**Why 5.9.3:**
- Matches Kobaru gateway version for consistency
- Required by tsup 8.x and viem 2.x

### viem 2.43.5

**Why viem over ethers:**
- **Tree-shakeable** - smaller bundles (20-40 KB vs 150 KB for ethers)
- **TypeScript-first** - better type inference
- **Modular** - import only what you need
- **Modern** - uses native BigInt (no custom BigNumber class)
- **Matches Kobaru** - consistency across the ecosystem

**Why 2.43.5:**
- Latest stable at project start
- Matches Kobaru gateway dependency

### tsup 8.4.0 (SDK bundler)

**Why tsup:**
- Zero-config TypeScript bundler
- Outputs ESM + CJS + IIFE in one command
- Tree-shaking built-in
- Type declarations generated automatically
- Fast (esbuild under the hood)

**Why not Rollup/Webpack:**
- Overkill for a simple SDK
- More configuration needed
- Slower builds

### esbuild 0.25.4 (Extension bundler)

**Why esbuild:**
- **Fast** - 10-100x faster than Webpack
- Supports ESM (service worker), IIFE (content script, popup)
- No framework-specific config needed
- Used by tsup internally

**Why not Webpack:**
- Slower builds
- More complex configuration
- Not needed for vanilla TypeScript

### Vitest 3.x

**Why Vitest:**
- **Fast** - native ESM support, parallel execution
- Vite-compatible (if we add a dev server later)
- Jest-compatible API (easy migration path)
- Built-in TypeScript support
- Matches Kobaru console (consistency)

**Why not Jest:**
- Slower (requires Babel transpilation)
- No native ESM support (needs experimental flags)
- More configuration overhead

### Zod 3.x

**Why Zod:**
- **Runtime validation** - ensures data from postMessage/HTTP is correct shape
- TypeScript integration - infer types from schemas
- Clear error messages for debugging
- Matches x402 ecosystem standard (3.x, not 4.x for compatibility)
- Transitive dependency via `@x402/fetch` and related packages

**Why 3.x not 4.x:**
- x402 reference implementation uses Zod 3.x
- 4.x has breaking changes, ecosystem hasn't upgraded yet

### Chrome Extension Manifest V3

**Why Manifest V3:**
- **Required** for new Chrome Web Store submissions (as of 2023)
- Service workers replace persistent background pages (more resource-efficient)
- Modern security model

**Why not Manifest V2:**
- Deprecated, will be removed from Chrome
- Not accepted on Chrome Web Store for new extensions

### SKALE Network

**Why SKALE:**
- **Ultra-low fees** - makes $0.01 payments economically viable
- EVM-compatible - same tooling as Ethereum (viem, contracts)
- Fast blocks (~1 second) - quick payment confirmation
- USDC support - stablecoin avoids price volatility
- **Hackathon partner** - aligns with project goals

**Why not Ethereum mainnet:**
- Gas fees ($1-50) make micropayments impossible

**Why not Optimism/Arbitrum:**
- Still have gas fees ($0.01-$0.50) - too high for $0.01 payments
- SKALE is specifically designed for ultra-low fees

**Why not Solana:**
- Non-EVM - different tooling, wallet ecosystem
- May explore in Phase 2

### EIP-3009 TransferWithAuthorization

**Why this over standard ERC-20 transfer:**
- **Gasless** - reader signs, facilitator submits (reader pays $0 gas)
- Standard ERC-20 requires reader to pay gas
- Supported by USDC contract on SKALE

### npm Workspaces

**Why npm workspaces:**
- Built into npm 7+ (no extra tools)
- Simple monorepo management
- Shared dependencies hoist to root
- Consistent lockfile

**Why not Lerna/Nx:**
- Overkill for 3 packages
- Extra complexity with minimal benefit

### GPL-3.0-or-later

**Why GPL-3.0:**
- **Copyleft** - modifications must be shared (prevents proprietary forks)
- Compatible with x402 ecosystem
- Encourages open collaboration

**Why not MIT/Apache:**
- Want to ensure improvements benefit everyone
- Prevent vendor lock-in via proprietary forks

---

## Minimum requirements

These are the minimum versions needed to build and run Paperwall:

| Component | Minimum Version | Why |
|-----------|-----------------|-----|
| Node.js | 18+ | Required for build tools (tsup 8, esbuild 0.25) |
| npm | 9+ | Included with Node.js 18+ |
| Chrome | 120+ | Stable Manifest V3, ESM service workers |
| TypeScript | 5.0+ | Required by tsup 8, viem 2 |

If you're having build issues, check your versions:

```bash
node --version   # Should be v18.0.0 or higher
npm --version    # Should be 9.0.0 or higher
tsc --version    # Should be 5.0.0 or higher
```

---

## Questions?

If you have questions about contributing, open a GitHub Discussion or comment on the issue you're working on. We are happy to help.
