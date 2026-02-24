# Paperwall Roadmap

This document outlines development priorities for Paperwall, organized by timeline.

---

## What Already Works

**Version:** 0.2.0 (Testnet)
**Status:** Fully functional on SKALE testnet
**Date:** February 2026

✅ **Publisher SDK**

- Single `<script>` tag integration
- Fixed pricing per page view
- Payment callbacks for ad removal
- x402 v2 protocol compliant

✅ **Chrome Extension**

- Wallet creation and management
- Password-encrypted private keys (PBKDF2 + AES-256-GCM)
- USDC balance display (SKALE testnet)
- EIP-712 payment signing
- Payment history tracking (1000 record cap)
- Settings tab, about section, history tab, stats tab
- Import/export private keys
- Chrome Web Store submission (pending approval)

✅ **Payment Flow**

- Gasless USDC transfers via SKALE
- EIP-3009 TransferWithAuthorization
- Real on-chain settlement
- Sub-$0.01 viable payments
- Ultra-low fees (SKALE network)
- Optimistic (delayed) settlement for instant UX

✅ **Agent CLI + A2A Server**

- Headless CLI for programmatic payments
- A2A (Agent-to-Agent) server mode (JSON-RPC 2.0, protocol v0.3.0)
- Budget controls (per-request, daily, total limits)
- AP2 receipt lifecycle tracking
- Docker deployment support
- File-based storage at `~/.paperwall/`
- Published on npm as `@kobaru/paperwall`
- MCP server mode for AI assistants

✅ **Website + Publisher Tools**

- Paperwall website live
- Script tag generator for publishers
- Demo news blog with Paperwall integration
- Ad removal on payment
- End-to-end working flow (3 demo articles)

### Current Limitations

⚠️ **Chrome only** - No Firefox, Safari, or Edge support yet
⚠️ **SKALE testnet only** - Use test funds, not real money
⚠️ **USDC only** - No support for ETH or other tokens
⚠️ **Fixed pricing** - No dynamic pricing or time-based access
⚠️ **Client-side trust** - Honor system for ad removal (Tier 1 mode only)

---

## Now (Immediate Priorities)

**Goal:** Production-ready for early adopter publishers

### 1. Production Deployment

- **SKALE Mainnet support** - Real USDC payments
- **CDN distribution** - unpkg/jsdelivr auto-hosting
- **Chrome Web Store approval** - Get extension published and linked from website

### 2. Kobaru Console Integration

- **Public key registration** - Publishers register their public key on Kobaru Console
- **Improved dashboard** - Better integration with existing real-time dashboard

---

## Next

**Goal:** Enhanced browser extension capabilities

### 1. Auto-Approval Budgets

- **Allow/deny lists** - Control which sites can auto-pay
- **Per-site budgets** - "Auto-pay up to $1/month on example.com"
- **Daily spending limits** - "Max $5/day across all sites"
- **Total budget cap** - "Stop at $50 lifetime"

### 2. Additional Networks

- **Base (Coinbase L2)** - Alternative to SKALE

### 3. Multi-Browser Support

- **Edge support** (Chromium-based, low effort)
- **Firefox extension** (Manifest V3)

---

## Later

**Goal:** Mainstream-ready platform with fiat on-ramps and mobile support

### 1. Publisher Platform Integrations

- **WordPress plugin** - One-click Paperwall setup
- **Squarespace/Wix integration** - No-code setup
- **API access** - Programmatic payment tracking
- **Webhook notifications** - Real-time payment alerts

### 2. Payment Verification (Tier 2/3)

- **Facilitator-signed receipts** - SDK verifies payment on the client side
- **Server-side verification** - Publishers verify payments on their backend
- **Site key system** - Public credentials safe for client-side use

### 3. Fiat On-Ramp

- **Credit card to USDC** - Integrate external on-ramp service
- **No crypto knowledge required** - Fund wallet with Pix, credit card, or other local methods
- **Instant top-up** - $5-$50 max

### 4. Flexible Pricing

- **Multiple price tiers** - Publishers provide multiple prices, extension/CLI selects appropriate one
- **Time-decay pricing** - New content expensive, old content cheap (via multi-price support)
- **User-based pricing** - First article free, subsequent paid

### 5. Active Ad Removal (Optional)

For publishers who want to offer ad-free experiences with Paperwall but lack the development resources to implement ad removal logic on their own. The extension handles it on their behalf — always opt-in, never automatic.

- **Publisher opt-in** - SDK signals which elements to remove
- **DOM-based removal** - Extension hides designated ad elements after payment
- **Privacy-safe** - No tracking, just removal

### 6. Time-Based Access Models

- **30-minute access** - Read for 30 minutes for $0.05
- **24-hour access** - Full site access for $0.25
- **Weekly passes** - $1 for unlimited weekly access
- **Lifetime access** - Pay once, read forever

### 7. Advanced Payment Models

- **Pay-what-you-want** - Reader chooses price
- **Tips/donations** - Support creators beyond content price
- **Revenue sharing** - Split payments across contributors

---

## Under Consideration

These are ideas we're exploring but haven't committed to.

### Safari Extension

- Safari extension (Manifest V3, higher effort)

### External Wallet Support

- **Coinbase Wallet** - Connect instead of embedded key
- **MetaMask** - Use existing wallet
- **WalletConnect** - Any EVM wallet

### Other Tokens

- Support for ETH, DAI, or other stablecoins beyond USDC

### Solana Network

- Explore non-EVM option

### Mobile Support

- **Mobile browser extensions** - iOS Safari, Android Chrome
- **Progressive Web App (PWA)** - Wallet as standalone app
- **Deep linking** - Open articles in-app

### AI-Powered Pricing

- **Suggested pricing** - ML model recommends optimal price
- **Demand prediction** - Forecast revenue by price point
- **A/B testing** - Automated price experiments

### Content Discovery

- **Paperwall directory** - Browse all participating publishers
- **Reader recommendations** - "Based on your payments, you might like..."
- **Content collections** - Curated bundles across publishers

### Advanced Analytics

- **Reader cohort analysis** - Understand payment patterns
- **Content performance** - Which articles earn most
- **Churn prediction** - Identify at-risk readers

### Desktop Apps

- **Native wallet** - Mac/Windows/Linux standalone applications

---

## Development Principles

### 1. Open Source First

Every feature ships with:

- Public code on GitHub
- Documentation updates
- Test coverage
- Clear licensing (GPL-3.0)

### 2. Privacy by Default

- No tracking pixels
- No user profiling
- No data sales
- Minimal data collection

### 3. Publisher Control

- Publishers own the reader relationship
- No platform lock-in
- Facilitator-agnostic protocol
- Freedom to self-host

### 4. Reader Autonomy

- Budget controls
- Spending visibility
- Easy uninstall
- Data export

### 5. Protocol Compatibility

- x402 v2 standard compliance
- Interoperable with other x402 tools
- Open to competing facilitators
- No proprietary lock-in

---

## What Won't Change

### Core Commitments (Permanent)

**Free for publishers:**

- No setup fees
- No monthly fees
- No percentage cuts
- No hidden costs

**Gasless for readers:**

- Readers pay exactly the listed price
- No gas surprises

**Open source:**

- GPL-3.0 forever
- Public development
- Community contributions welcome

**Privacy-focused:**

- No surveillance capitalism
- No ad tracking replacement
- Minimal data collection

---

## How to Influence the Roadmap

We prioritize features based on:

1. **User requests** - What publishers and readers ask for
2. **Protocol standards** - x402 evolution
3. **Technical feasibility** - What's possible given constraints
4. **Economic viability** - What sustains the project

### Ways to Contribute

**Feedback:**

- Open GitHub issues for feature requests
- Comment on existing proposals
- Share usage data (opt-in)

**Development:**

- Submit pull requests for new features
- Fix bugs in the codebase
- Improve documentation

**Adoption:**

- Integrate Paperwall on your site
- Tell other publishers
- Share success stories

**Research:**

- Test pricing strategies
- Report on reader behavior
- Analyze conversion rates

---

## Questions?

- **When will X ship?** See priority sections above (subject to change)
- **Can I help build X?** Yes! Open an issue to coordinate
- **Why isn't X on the roadmap?** Propose it on GitHub
- **I need X for my business.** Email support@kobaru.io for custom development

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to get involved.
