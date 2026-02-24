# Paperwall Roadmap

This document outlines development priorities for Paperwall, organized by timeline.

---

## What Already Works

**Version:** 0.1.0 (Testnet)
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

✅ **Payment Flow**
- Gasless USDC transfers via SKALE
- EIP-3009 TransferWithAuthorization
- Real on-chain settlement
- Sub-$0.01 viable payments
- Ultra-low fees (SKALE network)

✅ **Agent CLI + A2A Server**
- Headless CLI for programmatic payments
- A2A (Agent-to-Agent) server mode (JSON-RPC 2.0, protocol v0.3.0)
- Budget controls (per-request, daily, total limits)
- AP2 receipt lifecycle tracking
- Docker deployment support
- File-based storage at `~/.paperwall/`

✅ **Demo Site**
- Sample news blog with Paperwall integration
- Ad removal on payment
- End-to-end working flow (3 demo articles)

✅ **Test Suite**
- 300+ unit and integration tests across all packages
- Integration tests cover cross-package payment flows
- Vitest framework with mocking patterns

### Current Limitations

⚠️ **Chrome only** - No Firefox, Safari, or Edge support yet
⚠️ **Manual install** - Not on Chrome Web Store
⚠️ **SKALE testnet only** - Use test funds, not real money
⚠️ **USDC only** - No support for ETH or other tokens
⚠️ **Fixed pricing** - No dynamic pricing or time-based access
⚠️ **Client-side trust** - Honor system for ad removal (Tier 1 mode only)

---

## Now (Immediate Priorities)

**Goal:** Production-ready for early adopter publishers

### 1. Production Deployment
- **SKALE Mainnet support** - Real USDC payments
- **Chrome Web Store submission** - One-click install for users
- **npm package publication** - `@paperwall/sdk` on npmjs.com
- **CDN distribution** - unpkg/jsdelivr auto-hosting

### 2. Enhanced Security (Tier 2/3)
- **Facilitator-signed receipts** - SDK verifies payment authenticity
- **Server-side verification option** - For publishers needing stronger guarantees
- **Site key system** - Public credentials safe for client-side use

### 3. Publisher Analytics (MVP)
- **Kobaru Console integration** - View payment history, revenue, top articles
- **CSV export** - Transaction logs for accounting
- **Real-time dashboard** - See payments as they happen

### 4. Extension UI Enhancements
- **Settings tab** - Centralized configuration interface
- **Import/export private keys** - Backup and restore wallet credentials
- **About section** - GitHub link, version info, license details
- **History tab** - Full payment history view with search/filter
- **Stats/analytics tab** - Spending trends, top sites, monthly totals

### 5. NPM Package Publication
- **`@kobaru/paperwall` on npm** - One-command install via `npm install -g @kobaru/paperwall`
- **Zero-build installation** - Eliminates need to clone repo and run `npm run build`
- **Easier CI/CD integration** - Dependencies handled by npm, not git
- **Semantic versioning** - Clear version history and upgrade path

---

## Next (3-6 Months)

**Goal:** Multi-browser support and advanced user controls

### 1. Multi-Browser Support
- **Firefox extension** (Manifest V3)
- **Edge support** (Chromium-based, low effort)
- Safari extension (V3, higher effort)

### 2. Auto-Approval Budgets
- **Per-site budgets** - "Auto-pay up to $1/month on example.com"
- **Daily spending limits** - "Max $5/day across all sites"
- **Total budget cap** - "Stop at $50 lifetime"
- **User controls** - Enable/disable per site

### 3. Additional Networks
- **Base (Coinbase L2)** - Alternative to SKALE
- **Solana** - Explore non-EVM option (research phase)

### 4. Dynamic Pricing
- **Content-based pricing** - Different prices per article type
- **Time-decay pricing** - New content expensive, old content cheap
- **User-based pricing** - First article free, subsequent paid
- **Promotional pricing** - Publishers can run sales

### 5. Active Ad Removal (Optional)
- **DOM-based ad detection** - Extension can identify and hide ad elements
- **Publisher opt-in** - SDK signals which elements to remove
- **Privacy-safe** - No tracking, just removal

### 6. Delayed Settlement (Optimistic UX)
- **Publisher opt-in** - Honor system for instant content access
- **Remove wait latency** - Show content/remove ads immediately, settle payment later
- **Async confirmation** - Payment confirms in background while reader enjoys content
- **Retry logic** - Automatic retry if initial settlement fails
- **Fallback protection** - Revert to synchronous mode if payment repeatedly fails
- **Publisher risk controls** - Per-reader trust limits, blacklist support

---

## Later (6+ Months)

**Goal:** Mainstream-ready platform with fiat on-ramps and mobile support

### 1. Time-Based Access Models
- **30-minute access** - Read for 30 minutes for $0.05
- **24-hour access** - Full site access for $0.25
- **Weekly passes** - $1 for unlimited weekly access
- **Lifetime access** - Pay once, read forever

### 2. Fiat On-Ramp
- **Credit card to USDC** - Integrate MoonPay or similar
- **No crypto knowledge required** - Fund wallet with Visa/Mastercard
- **Instant top-up** - $5-$50 minimum

### 3. Mobile Support
- **Mobile browser extensions** - iOS Safari, Android Chrome
- **Progressive Web App (PWA)** - Wallet as standalone app
- **Deep linking** - Open articles in-app

### 4. External Wallet Support
- **Coinbase Wallet** - Connect instead of embedded key
- **MetaMask** - Use existing wallet
- **WalletConnect** - Any EVM wallet

### 5. Publisher Platform Integrations
- **WordPress plugin** - One-click Paperwall setup
- **Squarespace/Wix integration** - No-code setup
- **API access** - Programmatic payment tracking
- **Webhook notifications** - Real-time payment alerts

### 6. AI-Powered Pricing
- **Suggested pricing** - ML model recommends optimal price
- **Demand prediction** - Forecast revenue by price point
- **A/B testing** - Automated price experiments

### 7. Content Discovery
- **Paperwall directory** - Browse all participating publishers
- **Reader recommendations** - "Based on your payments, you might like..."
- **Content collections** - Curated bundles across publishers

### 8. Creator Tools
- **Substack integration** - Micropayments for newsletter creators
- **Medium integration** - Unlock partner program articles
- **YouTube integration** - Pay to skip ads

### 9. Advanced Payment Models
- **Pay-what-you-want** - Reader chooses price
- **Tips/donations** - Support creators beyond content price
- **Revenue sharing** - Split payments across contributors

### 10. Open Facilitator Network
- **Self-hosted facilitators** - Publishers run their own
- **Multi-facilitator support** - SDK tries multiple facilitators
- **Facilitator marketplace** - Compete on fees/speed

### 11. Advanced Analytics
- **Reader cohort analysis** - Understand payment patterns
- **Content performance** - Which articles earn most
- **Churn prediction** - Identify at-risk readers

### 12. Desktop Apps
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

- **When will X ship?** See target dates above (subject to change)
- **Can I help build X?** Yes! Open an issue to coordinate
- **Why isn't X on the roadmap?** Propose it on GitHub
- **I need X for my business.** Email partnerships@kobaru.io for custom development

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to get involved.
