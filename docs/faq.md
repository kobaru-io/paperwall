# Frequently Asked Questions

Common questions about Paperwall from publishers, readers, and developers.

---

## For Publishers

### How much does Paperwall cost me?

**Zero.** There are no setup fees, no monthly fees, and no percentage cuts. SKALE network has ultra-low gas fees, so readers pay nearly exactly what you charge and you receive nearly that amount.

The only cost is your time integrating the SDK (5-10 minutes).

### What if a reader doesn't have the extension installed?

They see your page normally, without any paywall or interruption. Paperwall is **non-blocking by default** — the SDK emits a signal, but if no extension is listening, nothing happens.

You can detect extension presence using the SDK's ping function:

```javascript
const hasExtension = await Paperwall.sendPing();
if (!hasExtension) {
  // Show a message: "Install Paperwall for ad-free reading"
}
```

`sendPing()` posts a `PAPERWALL_PING` message and resolves to `true` if the extension responds with `PAPERWALL_PONG` within 2 seconds. If the extension is not installed, it resolves to `false`.

### Can I use Paperwall with WordPress?

**Yes.** Add the script tag using:
- Custom HTML block in the page editor
- Theme's "Code injection" setting
- "Footer scripts" in site settings

A dedicated WordPress plugin is planned for Phase 1 (Q2 2026).

### Can I use Paperwall with Squarespace/Wix?

**Yes.** Both platforms support custom code injection:
- **Squarespace:** Settings → Advanced → Code Injection → Footer
- **Wix:** Settings → Custom Code → Add Code → Body End

### How do I verify a payment actually happened?

**MVP (Client Mode - Tier 1):** The extension calls the facilitator and notifies your SDK via callback. This is an honor system (equivalent to ad-blocker bypass).

**Phase 1 (Tier 2):** The facilitator will return a cryptographically signed receipt. Your SDK verifies the signature, ensuring the extension can't forge payments.

**Phase 1 (Tier 3):** Your server calls the facilitator with a secret API key. Full server-side verification.

See [Payment Tiers](#payment-tiers-explained) below for details.

### What prevents someone from forging a payment?

In **Tier 1** (MVP), nothing — it's an honor system like ad-removal. A malicious reader could modify the extension to fake success.

However:
- This is equivalent to ad-blockers (readers already bypass ads for free)
- Most readers are honest (same as donations)
- **Tier 2** (Phase 1) adds signed receipts that can't be forged
- **Tier 3** (Phase 1) adds full server-side verification

For $0.01 payments, Tier 1 is sufficient. For high-value content ($1+), wait for Tier 2/3.

### Can readers pay from their phone?

**Firefox for Android (version 142+) is supported.** Readers can install the Paperwall extension from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/paperwall-app/) on their Android device.

iOS Safari and Android Chrome are not yet supported.

### What if the facilitator service goes down?

Payments cannot be processed while the facilitator is unavailable. The reader's funds remain in their wallet. No money is lost.

Paperwall is **facilitator-agnostic** — you can switch to any x402-compatible facilitator by changing the `facilitatorUrl` in your config.

### How do I track my revenue?

**MVP:** Check your wallet address on the SKALE block explorer. Payments appear as USDC token transfers.

**Phase 1:** Kobaru Console will show a publisher dashboard with payment history, revenue graphs, and CSV export.

### Can I set different prices for different articles?

**Yes.** Each page's script tag operates independently. Change the `data-price` attribute per page:

```html
<!-- Short post: $0.01 -->
<script data-price="10000" ...></script>

<!-- In-depth article: $0.05 -->
<script data-price="50000" ...></script>
```

### Is this legal? Do I need licenses?

Paperwall is just a payment system, like Stripe or PayPal. The legal relationship is between you (publisher) and your readers. You're responsible for:
- **Content licensing** - Ensure you have rights to paywall the content
- **Tax compliance** - Report payment income per your jurisdiction
- **Terms of service** - Clarify refund policy, access terms

Paperwall provides the technical plumbing, not legal advice. Consult a lawyer for your specific situation.

### Can I offer refunds?

**Not automatically.** Blockchain transactions are irreversible. If you want to offer refunds, you'd need to:
1. Track payments via Kobaru Console
2. Manually send USDC back to the reader's address

A better approach: offer free access for a period instead of refunds.

### What about bots or automated scrapers?

The SDK requires:
1. Extension presence (detectable via ping/pong)
2. EIP-712 signature (requires private key)
3. USDC balance (costs real money)

This makes automated scraping expensive. For high-volume bots, Tier 3 (server-side verification) can add rate limiting and IP blocking.

---

## For Readers

### How much does the extension cost?

**Free.** The extension is open source and costs nothing to install or use.

You pay only for the content you choose to unlock (typically $0.01-$0.10 per article).

### Do I need cryptocurrency knowledge?

**For MVP:** Somewhat. You need to:
- Fund your wallet with USDC on SKALE (requires finding a faucet for testnet, or using an exchange for mainnet)
- Understand wallet addresses

**For Phase 2:** No. We'll integrate a fiat on-ramp (MoonPay or similar) so you can fund your wallet with a credit card.

### Is my money safe?

Your private key is:
- **Encrypted** with PBKDF2 (600,000 iterations) + AES-256-GCM
- **Stored locally** on your computer (never sent to servers)
- **Password-protected** (you choose the password)
- **Cleared on browser close** (decrypted key in session storage only)

You approve every payment. If you enable auto-pay for a site, Paperwall approves payments automatically but only within your configured budget limits.

If you forget your password, there's no recovery. Your funds are permanently inaccessible. **Write down your password.**

### What if I lose my password?

You cannot recover your wallet. The funds are permanently inaccessible.

If your wallet has little or no funds, you can:
1. Remove the extension
2. Reinstall it
3. Create a new wallet with a new password

### Can I export my wallet to use elsewhere?

**Not in MVP.** The extension generates a private key for Paperwall use only.

**Phase 2** will support:
- Exporting private key (encrypted JSON)
- Importing into MetaMask or Coinbase Wallet
- Connecting external wallets instead of embedded keys

### Which networks are supported?

Paperwall supports four networks:

| Network | CAIP-2 | Use |
|---------|--------|-----|
| SKALE Testnet | `eip155:324705682` | Testing (free testnet USDC) |
| Base Sepolia | `eip155:84532` | Testing (free testnet USDC) |
| SKALE Mainnet | `eip155:1187947933` | Production |
| Base Mainnet | `eip155:8453` | Production |

You can hold USDC on any or all of these networks. The extension and agent will use whichever one the publisher accepts and you have funds on.

### How does the extension choose which network to use?

When a publisher accepts multiple networks, the extension checks your balance on each supported network and selects the best one automatically. The priority order (used as a tiebreaker when you have funds on multiple networks) is: SKALE Testnet → Base Sepolia → SKALE Mainnet → Base Mainnet.

SKALE Testnet is prioritized because it has the lowest fees. If you have a zero balance on all networks, the extension will show you which networks the publisher accepts so you know where to add funds.

### What does the TEST badge mean in the extension?

A **TEST** badge appears in the payment history next to transactions that were settled on a testnet (SKALE Testnet or Base Sepolia). It's a reminder that testnet USDC has no real monetary value. Payments on mainnet networks (SKALE Mainnet, Base Mainnet) do not show the badge.

### How do I get USDC on a supported network?

**Testnet (for development and testing):**
- **SKALE Testnet:** Visit the SKALE testnet faucet (see SKALE documentation for the current URL). Paste your Paperwall wallet address and request free testnet USDC.
- **Base Sepolia:** Use the Coinbase or Alchemy Base Sepolia faucet. Paste your Paperwall wallet address.

**Mainnet (for real payments):**
1. Buy USDC on an exchange (Coinbase, Kraken, Binance)
2. Withdraw to the desired network (select "SKALE" or "Base" as the destination)
3. Send to your Paperwall wallet address

**Phase 2 (Fiat On-Ramp):**
1. Click "Add Funds" in Paperwall extension
2. Enter credit card details
3. MoonPay converts USD → USDC automatically

### Does Paperwall track what I read?

**No.** Paperwall does not collect, store, or sell your browsing data.

The only data stored:
- Your wallet address and encrypted private key (locally, on your device)
- Your payment history (locally, on your device)
- Transaction records (on SKALE blockchain, public but pseudonymous)

Publishers see your wallet address when you pay (like a credit card number), but it's not linked to your name or email.

### Can I use Paperwall with an ad blocker?

**Yes.** Paperwall is compatible with uBlock Origin, AdGuard, and other ad blockers.

In fact, **that's the point** — pay a penny to remove ads instead of seeing them.

### What if a site charges too much?

Click "Reject" instead of "Approve". You won't be charged.

Both the extension and the agent CLI support budget controls. In the extension, open the **Budget tab** to set per-site limits, daily caps, and monthly caps. See the [Auto-Pay FAQ](#for-readers-auto-pay) for details.

### Can I get a refund if I accidentally paid?

**No.** Blockchain transactions are irreversible. Once you click "Approve," the payment is final.

Be careful before approving. The extension shows:
- Site name
- Exact price
- Network being used (with TEST badge for testnet)

If you're unsure, click "Reject."

---

## For readers: auto-pay

### How does auto-pay work?

When you visit a site with Paperwall, you can click **"Pay & Auto-approve"** instead of "Pay once." This adds the site to your trusted list. The next time that site requests a payment within your budget limits, Paperwall approves it automatically without showing a prompt.

Auto-pay only works within your spending limits. If a payment would exceed any of your budgets, Paperwall pauses auto-pay and shows you a prompt instead.

### How do I control spending limits?

Open the **Budget tab** in the Paperwall popup. You can set three types of limits:

- **Daily limit** -- the most you can spend across all sites in 24 hours (default: $2.00)
- **Monthly limit** -- the most you can spend across all sites in a calendar month (default: $20.00)
- **Per-site limit** -- the most any single site can charge you per month (default: $0.50)

You can also edit the budget for individual trusted sites by clicking on them in the Budget tab.

### Can I block specific sites?

**Yes.** When a payment prompt appears, click **"Block this site"** and Paperwall will never ask you about that site again. You can also manage your blocked sites in the **Budget tab** under the denylist section, where you can unblock sites at any time.

### What happens when my budget runs out?

Paperwall pauses auto-pay for the rest of the budget period. You will still see a payment prompt with an alert banner explaining why auto-pay is paused (for example, "Daily budget exceeded"). You can choose to pay manually or wait until the budget resets.

Daily budgets reset after 24 hours. Monthly budgets reset at the start of each calendar month (UTC).

### Is auto-pay safe? What if a payment fails?

**Yes, auto-pay is safe.** Your spending is always capped by your daily, monthly, and per-site limits. Paperwall checks all limits before every auto-payment.

If a payment fails after the budget was charged, Paperwall automatically refunds the amount back to your budget. Your actual wallet balance is not affected by failed payments -- only successful on-chain transactions move real money.

---

## For Developers

### Is Paperwall open source?

**Yes.** Licensed under [GPL-3.0-or-later](../LICENSE). All code is on [GitHub](https://github.com/kobaru/paperwall).

### Can I contribute?

**Yes!** See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

We welcome:
- Bug fixes
- New features
- Documentation improvements
- Test coverage
- Security reviews

### What's the tech stack?

- **Language:** TypeScript 5.9.3
- **EVM Library:** viem 2.43.5
- **Build (SDK):** tsup 8.4.0 (ESM + CJS + IIFE)
- **Build (Extension):** esbuild 0.25.4
- **Testing:** Vitest 3.x

See [Developer Guide](developer-guide.md) for full details.

### Can I self-host a facilitator?

**Phase 1+.** The x402 protocol supports self-hosted facilitators, but Paperwall MVP relies on Kobaru's facilitator for simplicity.

Once we document the facilitator API and provide a reference implementation, you can run your own.

### Does Paperwall work with other x402 tools?

**Yes.** Paperwall implements the [x402 v2 protocol](https://x402.org) and is interoperable with:
- Other x402 browser extensions
- Other x402 facilitators
- Other x402 SDKs

If another tool speaks x402 v2, it should work with Paperwall-enabled sites.

### How do I test Paperwall locally?

```bash
git clone https://github.com/kobaru/paperwall.git
cd paperwall
npm install
npm run build
npm test
```

Load the extension:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/dist-chrome`

Serve the demo site:
```bash
npx serve demo/
```

Visit `http://localhost:3000` to test the full flow.

### Can I build a competing extension?

**Yes.** The GPL-3.0 license allows forking and modification. You can:
- Build a competing extension
- Modify Paperwall's code
- Release under GPL-3.0 or compatible license

The only requirement: share your improvements (copyleft).

### Where do I report security issues?

**Privately.** Open a GitHub Security Advisory instead of a public issue:

https://github.com/kobaru/paperwall/security/advisories/new

Do not publicly disclose vulnerabilities until they're patched.

---

## Payment Tiers Explained

Paperwall supports three integration tiers with progressive trust guarantees. All tiers use the **same SDK and extension** — what changes is the verification mode.

### Tier 1: Client Mode (MVP - Available Now)

**How it works:**
1. Reader's extension detects your page
2. Reader clicks "Approve Payment"
3. Extension signs the payment and calls the facilitator
4. Facilitator settles on-chain (real USDC transfer)
5. Extension notifies your SDK → `onPaymentSuccess()` fires
6. Your page hides ads

**Trust model:** **Client-side trust (honor system)**

**Who calls the facilitator:** Reader's extension

**Publisher setup:**
```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_WALLET_ADDRESS"
  data-price="10000"
  data-accepts='[{"network":"eip155:324705682","token":"0x2e08028E3C4c2356572E096d8EF835cD5C6030bD"},{"network":"eip155:84532","token":"0x036CbD53842c5426634e7929541eC2318f3dCF7e"}]'
></script>
```

**Pros:**
- **Dead simple** - Single script tag, no server changes
- **Fast** - No extra verification round-trip
- **Works with any x402 facilitator**

**Cons:**
- **Can be bypassed** - Malicious reader could modify extension to fake success
- **Same risk as ad-blockers** - Reader could see ad-free without paying

**Best for:**
- Micropayments ($0.01-$0.10) where bypass risk equals ad-blocker risk
- Complementing ads (not replacing subscriptions)
- Publishers who want zero backend work

**Example use case:** News site charges $0.01 per article. If someone bypasses payment, it's equivalent to them using uBlock Origin (which already happens). Most readers are honest.

---

### Tier 2: Client Mode + Signed Receipts (Phase 1 - Coming Q2 2026)

**How it works:**
1. Same as Tier 1, but...
2. Facilitator returns a **cryptographically signed receipt**
3. Extension forwards receipt to your SDK
4. **SDK verifies the signature** using facilitator's public key
5. If signature valid and `payTo` matches config → `onPaymentSuccess()`
6. If signature invalid or `payTo` mismatch → **reject, no ad removal**

**Trust model:** **Facilitator-signed receipts**

**Who calls the facilitator:** Reader's extension (same as Tier 1)

**Publisher setup:**
```html
<!-- Same script tag, same config - SDK auto-detects signed receipts -->
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_WALLET_ADDRESS"
  data-price="10000"
  data-accepts='[{"network":"eip155:324705682","token":"0x2e08028E3C4c2356572E096d8EF835cD5C6030bD"},{"network":"eip155:84532","token":"0x036CbD53842c5426634e7929541eC2318f3dCF7e"}]'
></script>
```

**Pros:**
- **No backend required** - Still a single script tag
- **Cannot be forged** - Malicious extension can't fake facilitator's signature
- **Fast** - Same latency as Tier 1 (signature is returned with settlement)

**Cons:**
- **Still client-side** - Attacker could block receipt forwarding (but can't forge it)
- **Requires facilitator support** - Not all x402 facilitators may sign receipts

**Best for:**
- Medium-value content ($0.25-$1.00)
- Publishers who want stronger guarantees without backend work
- Platforms where forged receipts would cause trust issues

**Example use case:** Premium blog charges $0.50 per in-depth article. The signed receipt proves payment happened, preventing "pay once, share the callback result" attacks.

**How it prevents forgery:**
1. Reader's extension creates fake success message
2. SDK checks: "Does this receipt have facilitator's signature?"
3. Signature verification fails (attacker doesn't have facilitator's private key)
4. SDK rejects → ads stay visible
5. Attack failed

---

### Tier 3: Server Mode (Phase 1+ - Coming Q2 2026)

**How it works:**
1. Reader's extension detects your page
2. Reader clicks "Approve Payment"
3. Extension signs the payment **but does NOT call facilitator**
4. Extension returns **just the signature** to your SDK
5. Your SDK forwards signature to **your server**
6. **Your server** calls facilitator with **secret API key**
7. Facilitator verifies signature and settles on-chain
8. Your server returns result to your SDK
9. SDK fires `onPaymentSuccess()` and notifies extension (for UI update)

**Trust model:** **Full server-side verification**

**Who calls the facilitator:** **Your server** (not reader's extension)

**Publisher setup:**

**Frontend (same script tag, but with `data-mode="server"`):**
```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_WALLET_ADDRESS"
  data-price="10000"
  data-accepts='[{"network":"eip155:1187947933","token":"0x2e08028E3C4c2356572E096d8EF835cD5C6030bD"},{"network":"eip155:8453","token":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}]'
  data-mode="server"
  data-payment-url="https://yoursite.com/api/verify-payment"
></script>
```

**Backend (your server endpoint):**
```javascript
// POST /api/verify-payment
app.post('/api/verify-payment', async (req, res) => {
  const { signature, authorization } = req.body;

  // Call facilitator with YOUR secret API key
  const result = await fetch('https://gateway.kobaru.io/verify', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer kbr_live_YOUR_SECRET_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      paymentPayload: { signature, authorization },
      paymentRequirements: { /* ... */ }
    })
  });

  const verified = await result.json();

  if (verified.isValid) {
    // Call /settle to execute payment
    const settled = await fetch('https://gateway.kobaru.io/settle', { /* ... */ });
    return res.json({ success: true, receipt: settled });
  } else {
    return res.json({ success: false, error: 'Invalid signature' });
  }
});
```

**Pros:**
- **Full server control** - You decide what happens after payment
- **Cannot be bypassed** - Payment verification happens on your server
- **Secret API key** - Reader never sees your credentials
- **Rate limiting** - You can block abusive requests
- **Custom logic** - Grant access, unlock content server-side

**Cons:**
- **Requires backend** - Can't use with static sites
- **Extra latency** - One more network hop (SDK → your server → facilitator)
- **More complexity** - You maintain the verification endpoint

**Best for:**
- High-value content ($1+, subscriptions)
- Hard paywalls (no content visible without payment)
- Publishers with existing backends
- Cases where server-side access control is required (e.g., API keys, downloads)

**Example use case:** SaaS company charges $5 for a premium API key. Payment verification happens server-side. Only after settlement does the server generate and return the API key. No client-side trust involved.

---

### Which Tier Should I Use?

| Content Type | Recommended Tier | Why |
|-------------|------------------|-----|
| News articles ($0.01-$0.05) | **Tier 1** | Equivalent to ad-blocker risk, dead simple |
| Blog posts ($0.05-$0.25) | **Tier 1 or 2** | Tier 2 if you want signed receipts for peace of mind |
| Premium analysis ($0.25-$1) | **Tier 2** | Signed receipts prevent forgery |
| Subscriptions / API access ($1+) | **Tier 3** | Server-side control required |
| Static sites (no backend) | **Tier 1 or 2** | Can't use Tier 3 without a server |
| WordPress / CMS | **Tier 1 or 2** | Tier 3 possible with custom plugin |

**All tiers use the same SDK and extension.** You can upgrade from Tier 1 → Tier 2 → Tier 3 by changing a few config options. No code rewrite needed.

---

## Still Have Questions?

- **Technical questions:** Open an issue on [GitHub](https://github.com/kobaru/paperwall/issues)
- **Business inquiries:** Email partnerships@kobaru.io
- **Security concerns:** Use [GitHub Security Advisories](https://github.com/kobaru/paperwall/security/advisories/new)
- **General support:** Check the [documentation](../README.md) or ask on GitHub Discussions
