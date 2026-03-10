# Publisher guide

Add micropayments to your website so readers can pay small amounts to access your content -- no subscriptions, no ads. This guide walks you through every step.

> **Tip:** Want to skip the manual setup? Generate your script tag with our setup wizard at [paperwall.app/setup](https://www.paperwall.app/setup).

---

## What is Paperwall?

Paperwall lets your readers pay tiny amounts of money (as little as one cent) to read your articles. Instead of showing ads or requiring a monthly subscription, you set a per-article price. Readers who have the Paperwall browser extension installed see your price, click "Pay," and the content unlocks.

**How readers experience it:**

1. A reader visits your article
2. They see a small badge in the corner that says "Paperwall"
3. They click the Paperwall icon in their browser toolbar
4. They see the price (for example, "$0.01 USDC") and click "Approve Payment"
5. The payment happens instantly, and they can read your content

Payments use USDC, a digital dollar (1 USDC = 1 US dollar) on supported blockchain networks including SKALE and Base. These networks have very low transaction fees, which means virtually every cent you charge goes to you. You can accept payments on one or more networks -- Paperwall handles the details.

---

## Before you start

You need two things:

1. **An EVM wallet address** -- This is where you receive payments. If you don't have one, you can create one using a wallet app like [MetaMask](https://metamask.io), [Rainbow](https://rainbow.me), or [Coinbase Wallet](https://www.coinbase.com/wallet). Your wallet address looks like this: `0x1234...abcd` (a long string starting with `0x`).

2. **Access to your website's HTML** -- You need to be able to add a `<script>` tag to your pages. If you use WordPress, Squarespace, or a similar platform, look for a "Custom HTML" or "Code injection" option in your settings.

---

## Supported networks

Paperwall supports four blockchain networks. Each network has its own USDC token contract:

| Network | ID (for `data-network`) | USDC Address | Environment |
|---------|------------------------|-------------|-------------|
| SKALE Testnet | `eip155:324705682` | `0x2e08028E3C4c2356572E096d8EF835cD5C6030bD` | Test |
| Base Sepolia | `eip155:84532` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Test |
| SKALE Mainnet | `eip155:1187947933` | `0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20` | Production |
| Base Mainnet | `eip155:8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Production |

**About SKALE on Base:** Paperwall uses [SKALE on Base](https://docs.skale.space/get-started/quick-start/skale-on-base), not SKALE Calypso or Europa. This is a dedicated SKALE chain bridged through Base, with very low gas fees that settle to Ethereum via Base.

**Testnet vs. mainnet:** Testnet networks use play money and are perfect for trying things out. Mainnet networks use real USDC. We recommend starting with a testnet (SKALE Testnet or Base Sepolia) to verify your setup before switching to mainnet.

You can accept payments on a single network (the simplest setup) or on multiple networks at once, giving readers more options. Both approaches are shown in Step 1 below.

---

## Step 1: Add the Paperwall script to your page

Copy this code and paste it just before the closing `</body>` tag on any page you want to paywall:

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_WALLET_ADDRESS"
  data-price="10000"
  data-network="eip155:324705682"
  data-asset="0x2e08028E3C4c2356572E096d8EF835cD5C6030bD"
></script>
```

**Replace `YOUR_WALLET_ADDRESS`** with your actual EVM wallet address (the long `0x...` string from your wallet app).

Here is what each part means:

| Attribute | What it does | Example |
|-----------|-------------|---------|
| `src` | Loads the Paperwall code from a public server | Keep as-is |
| `data-facilitator-url` | The payment processing server | Keep as-is |
| `data-pay-to` | Your wallet address where payments are sent | `0x1a2b3c...` (your address) |
| `data-price` | How much to charge, in USDC micro-units | `10000` = $0.01 |
| `data-network` | Which blockchain network to use | Keep as-is (SKALE testnet) |

**Additional attributes** (for advanced use):

| Attribute | What it does | Default |
|-----------|-------------|---------|
| `data-asset` | Token contract address on the target network | SKALE testnet USDC address |
| `data-accepts` | JSON array of networks to accept payments on (mutually exclusive with `data-network`) | -- |
| `data-mode` | Payment mode: `"client"` (extension calls facilitator) or `"server"` (your server calls facilitator) | `"client"` |
| `data-payment-url` | Your server endpoint for server-mode payments (required when `data-mode="server"`) | -- |
| `data-site-key` | Optional public credential for facilitator authentication | -- |
| `data-optimistic` | Whether to unlock content before settlement confirms: `"true"` or `"false"` | `"true"` |

When `data-optimistic="true"` (the default), the reader gets instant content access after payment signing, without waiting for blockchain confirmation. Settlement happens in the background. If settlement fails (rare), the `onPaymentError` callback fires. This is recommended for micropayments where speed matters more than guaranteed settlement.

Set `data-optimistic="false"` if you need confirmed settlement before unlocking content.

For details on client vs server mode and choosing the right trust level for your content, see [Understanding payment tiers](#understanding-payment-tiers).

### Accepting payments on multiple networks

If you want to give readers a choice of networks, use `data-accepts` instead of `data-network`. This attribute takes a JSON array listing the networks you accept:

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_WALLET_ADDRESS"
  data-price="10000"
  data-accepts='[{"network":"eip155:1187947933"},{"network":"eip155:8453"}]'
></script>
```

Each entry in the array needs a `network` value (required). You can optionally include `asset` (token contract address) and `payTo` (wallet address) per network. If you leave out `asset`, Paperwall uses the default USDC address for that network automatically. If you leave out `payTo`, it inherits from the top-level `data-pay-to`.

This is useful if you want to receive payments at a different wallet address on a specific network:

```html
data-accepts='[{"network":"eip155:1187947933"},{"network":"eip155:8453","payTo":"0xDifferentAddress..."}]'
```

> **Important:** `data-network` and `data-accepts` are mutually exclusive. Use one or the other, not both.

The reader's client (browser extension or agent) automatically picks the best network from your list. The selection works like this:

1. Filter to the networks you advertised
2. Check the reader's USDC balance on each
3. Pick the highest-priority network where the reader has enough funds

**Priority order:** SKALE Testnet → Base Sepolia → SKALE Mainnet → Base Mainnet.

- **Testnets first:** During development and testing, testnets are preferred to avoid accidentally spending real money. If a reader has funds on both testnet and mainnet, testnet wins.
- **SKALE before Base within each tier:** SKALE has lower per-transaction fees than Base. All else equal, the cheaper network is preferred.
- **Priority is a tiebreaker, not a veto:** If the reader only has enough funds on Base Mainnet, that network is used -- regardless of priority.

---

## Step 2: Set your price

The `data-price` value is in **micro-units** (the smallest unit of USDC). USDC has 6 decimal places, so:

| You want to charge | Set `data-price` to |
|--------------------|--------------------|
| $0.01 (one cent) | `10000` |
| $0.05 (five cents) | `50000` |
| $0.10 (ten cents) | `100000` |
| $0.25 (quarter) | `250000` |
| $0.50 (fifty cents) | `500000` |
| $1.00 (one dollar) | `1000000` |

**Our recommendation:** Start low. Most readers are willing to pay $0.01 to $0.05 per article. A one-cent price point means a reader with $5 in their wallet can read 500 of your articles.

> **Why micro-units?** USDC represents dollars with 6 decimal places of precision, similar to how 100 cents make a dollar. This format avoids rounding errors. The Paperwall extension converts this number to a readable dollar amount for the reader automatically.

---

## Step 3: Verify it works

After adding the script tag, open your page in a browser:

1. **Look for the badge.** You should see a small dark badge in the bottom-right corner of your page that says "Paperwall." This badge tells readers (and you) that the SDK loaded successfully.

2. **Check the page source.** Right-click the page, select "View Page Source," and search for `x402-payment-required`. You should find a `<meta>` tag in the `<head>` with this name. The Paperwall SDK automatically creates this tag when it loads. This is the signal that tells the browser extension a payment is required.

3. **Test with the extension.** If you have the Paperwall browser extension installed, visit your page. You should see a purple `$` badge on the extension icon, indicating it detected your paywall.

If you don't see the badge, check your browser's developer console (press F12) for error messages. Common issues are covered in the troubleshooting section below.

---

## Complete example

Here is a minimal HTML page with Paperwall integrated:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>My Article</title>
</head>
<body>

  <h1>The Future of Web Monetization</h1>
  <p>This is premium content powered by Paperwall micropayments...</p>

  <!-- Paperwall SDK: loads last, right before </body> -->
  <script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
    data-facilitator-url="https://gateway.kobaru.io"
    data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
    data-price="10000"
    data-network="eip155:324705682"
  ></script>

</body>
</html>
```

### Multi-network example

This example accepts payments on both SKALE Mainnet and Base Mainnet, giving readers more options:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>My Article</title>
</head>
<body>

  <h1>The Future of Web Monetization</h1>
  <p>This is premium content powered by Paperwall micropayments...</p>

  <!-- Paperwall SDK: accepts payments on multiple networks -->
  <script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
    data-facilitator-url="https://gateway.kobaru.io"
    data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
    data-price="10000"
    data-accepts='[{"network":"eip155:1187947933"},{"network":"eip155:8453"}]'
  ></script>

</body>
</html>
```

---

## Advanced: using the JavaScript API

If you need more control, you can initialize Paperwall with JavaScript instead of data attributes. This lets you react to payment events -- for example, hiding ads after a successful payment.

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"></script>
<script>
  Paperwall.init({
    facilitatorUrl: 'https://gateway.kobaru.io',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    price: '10000',
    network: 'eip155:324705682',
    onPaymentSuccess: function (receipt) {
      // The reader has paid! Do something, like removing ads.
      console.log('Payment confirmed:', receipt.txHash);
      document.querySelectorAll('.ad-banner').forEach(function (ad) {
        ad.style.display = 'none';
      });
    },
    onPaymentError: function (error) {
      // Payment failed or was rejected by the reader.
      console.warn('Payment error:', error.code, error.message);
    },
    onOptimisticAccess: function (info) {
      // Called immediately when optimistic settlement is enabled (default).
      // Content should be unlocked now -- settlement is in progress.
      console.log('Optimistic access granted, settling in background...');
      document.querySelectorAll('.ad-banner').forEach(function (ad) {
        ad.style.display = 'none';
      });
    }
  });
</script>
```

**Multi-network example** using the `accepts` array:

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"></script>
<script>
  Paperwall.init({
    facilitatorUrl: 'https://gateway.kobaru.io',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    price: '10000',
    accepts: [
      { network: 'eip155:1187947933' },
      { network: 'eip155:8453', payTo: '0xDifferentAddress...' }
    ],
    onPaymentSuccess: function (receipt) {
      console.log('Payment confirmed on network:', receipt.network);
      console.log('Transaction:', receipt.txHash);
    },
    onPaymentError: function (error) {
      console.warn('Payment error:', error.code, error.message);
    }
  });
</script>
```

When using `accepts`, the reader's client automatically selects the best network from your list based on the reader's available balance. The `network` and `accepts` options are mutually exclusive -- use one or the other.

**`onPaymentSuccess` callback** receives a receipt object with:

| Field | Description | Example |
|-------|-------------|---------|
| `txHash` | The blockchain transaction identifier | `0xabc123...` |
| `network` | Which network the payment settled on | `eip155:324705682` |
| `amount` | Amount paid in micro-units | `10000` |
| `from` | The reader's wallet address | `0x9876...` |
| `to` | Your wallet address | `0x1234...` |
| `settledAt` | When the payment was confirmed (ISO 8601) | `2026-02-11T14:30:00Z` |

> **Note:** The `network` field reflects whichever network the reader's client selected for payment. If you use `data-accepts` with multiple networks, this value tells you which network was actually used.

**`onOptimisticAccess` callback** receives an info object with:

| Field | Description | Example |
|-------|-------------|---------|
| `network` | Which network the payment is settling on | `eip155:324705682` |
| `amount` | Amount being paid in micro-units | `10000` |

This callback fires immediately after the reader approves payment, before blockchain confirmation. Use it to unlock content instantly. The `onPaymentSuccess` callback will fire later when settlement confirms, or `onPaymentError` if settlement fails. If you don't provide `onOptimisticAccess`, the SDK falls back to waiting for `onPaymentSuccess`.

**`onPaymentError` callback** receives an error object with:

| Field | Description |
|-------|-------------|
| `code` | Machine-readable error code (see table below) |
| `message` | Human-readable description of what went wrong |

Error codes you might see:

| Code | What it means |
|------|---------------|
| `MISSING_EXTENSION` | Reader does not have the Paperwall extension installed |
| `USER_REJECTED` | Reader clicked "Reject" on the payment prompt |
| `INSUFFICIENT_FUNDS` | Reader's wallet does not have enough USDC |
| `NETWORK_ERROR` | Could not reach the payment network |
| `FACILITATOR_ERROR` | The facilitator service returned an error (e.g., invalid request, auth failure) |
| `TIMEOUT` | Payment took too long (over 2 minutes) |
| `UNKNOWN` | An unexpected error occurred |

---

## How you get paid

When a reader pays, the USDC goes through the following path:

1. The reader's extension signs a payment authorization (the reader's private key never leaves their device)
2. The authorization is sent to the **facilitator service**, which submits it to the selected blockchain network
3. The USDC is transferred directly from the reader's wallet address to **your** wallet address
4. The transaction is confirmed on the blockchain

There is no intermediary holding your funds. Payments go directly to the wallet address you specified in `data-pay-to`. The network used depends on what you advertised (via `data-network` or `data-accepts`) and what the reader's client selected. You can check your balance using any EVM wallet that supports the relevant network (SKALE, Base, etc.).

> **Note:** The facilitator service handles settlement logistics but never holds your funds. It submits the reader's signed authorization to the blockchain, which transfers USDC directly between wallets.

---

## Setting different prices per page

You can set a different price on each page by changing the `data-price` attribute. For example:

- Short blog posts: `data-price="10000"` ($0.01)
- In-depth articles: `data-price="50000"` ($0.05)
- Premium reports: `data-price="100000"` ($0.10)

Each page's script tag operates independently.

---

## Content gating strategies

Paperwall is **non-blocking by default** -- if a reader doesn't have the extension, they see your page normally. You can choose how aggressively to gate content based on your payment tier:

**Soft gate (Tier 1 & 2):** Show full content with ads. After payment, hide ads using the `onPaymentSuccess` callback. Non-paying readers still see content but with ads. This approach mirrors the ad-blocker dynamic -- pay a penny to remove ads.

```javascript
Paperwall.init({
  // ...config...
  onPaymentSuccess: function () {
    document.querySelectorAll('.ad-banner').forEach(function (ad) {
      ad.style.display = 'none';
    });
  }
});
```

**Partial gate (Tier 1 & 2):** Show a preview (first paragraph or summary) to everyone. After payment, reveal the full article. Use CSS to hide paywalled content initially, then show it in `onPaymentSuccess`.

```html
<div class="preview">First paragraph visible to everyone...</div>
<div class="premium-content" style="display: none;">
  Full article content here...
</div>
<script>
  Paperwall.init({
    // ...config...
    onPaymentSuccess: function () {
      document.querySelector('.premium-content').style.display = 'block';
    }
  });
</script>
```

**Hard gate (Tier 3 only):** Content is never sent to the browser until your server verifies payment. This is the most secure approach but requires a backend endpoint. Your server receives the payment signature, verifies it with the facilitator, and only then renders the content.

> **Important:** Client-side gating (soft and partial) can be bypassed by a technical reader inspecting the page source. For $0.01-$0.25 micropayments, this is an acceptable tradeoff (equivalent to ad-blocker bypass). For high-value content ($5+), use Tier 3 server mode. See [Understanding payment tiers](#understanding-payment-tiers) for details.

---

## Understanding payment tiers

Paperwall serves publishers at different trust levels. A $0.01 page view has different security requirements than a $120/year subscription. The architecture supports three progressive trust tiers -- **you can start simple and upgrade later without refactoring your integration**.

### Tier comparison

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TIER 1: CLIENT MODE  (MVP)                                            │
│  Publisher effort: One <script> tag                                     │
│  Trust model: Client-side — SDK trusts extension's payment result      │
│  Who calls facilitator: Extension (service worker)                     │
│  Best for: Micropayments ($0.01/page) where alternative is ads         │
│  Limitation: Susceptible to forged results (equivalent to ad-blocker)  │
│  x402 compatible: Yes, any facilitator                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  TIER 2: CLIENT MODE + SIGNED RECEIPTS  (Phase 1)                      │
│  Publisher effort: One <script> tag (same as Tier 1)                   │
│  Trust model: Facilitator-signed receipt verified by SDK               │
│  Who calls facilitator: Extension (service worker)                     │
│  Best for: Medium-value content where publisher needs payment proof    │
│  Improvement: SDK verifies receipt signature — malicious extension     │
│    can't forge a payment because it lacks facilitator's private key    │
│  x402 compatible: Yes, any facilitator that supports signed receipts   │
├─────────────────────────────────────────────────────────────────────────┤
│  TIER 3: SERVER MODE  (Phase 1+)                                       │
│  Publisher effort: Script tag + backend endpoint                       │
│  Trust model: Server-side — publisher's server calls verify/settle     │
│  Who calls facilitator: Publisher's server (secret API key)            │
│  Best for: Hard paywalls, subscriptions, high-value access             │
│  Improvement: Full server-side control, standard x402 flow             │
│  x402 compatible: Yes, this IS standard x402                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Client mode (default)

**What it is:** The Paperwall extension handles the entire payment flow. When a reader approves a payment, the extension calls the facilitator service, settles the payment on-chain, and notifies your page's SDK that payment succeeded. Your page then responds by hiding ads or revealing content.

**Security trade-off:** A technically sophisticated reader could modify their browser extension to send fake "payment succeeded" messages to your page. This is equivalent to installing an ad-blocker -- they're bypassing your monetization, but they can't steal your funds (the payment either happens or it doesn't).

**When to use Tier 1:**
- You're currently showing ads and losing revenue to ad-blockers
- Your content is worth $0.01 to $0.10 per page
- You want to experiment with micropayments without backend changes
- You accept that some technical users might bypass the paywall (just like ad-blockers)

**Implementation:** Use the basic script tag shown in Step 1. No additional configuration needed.

### Tier 2: Client mode with signed receipts

**What it is:** Same flow as Tier 1, but the facilitator cryptographically signs each payment receipt. The SDK on your page verifies the signature using the facilitator's public key. A malicious extension cannot forge a valid receipt because it doesn't have the facilitator's private key.

**Security trade-off:** The extension can still block payments (by not forwarding the receipt), but it cannot fake a payment. The worst case is the same as a reader choosing not to pay -- no harm to you.

**What this prevents:**
- ❌ Malicious extension forging receipts (prevented by signature verification)
- ❌ Malicious extension redirecting payments to a different address (signature includes your address)
- ❌ Malicious extension claiming a $0.50 payment when only $0.01 was paid (signature includes amount)

**What this doesn't prevent:**
- ⚠️ Technical readers inspecting your page source and extracting content (content is still sent to browser)
- ⚠️ Extension blocking payment entirely (but they also don't see your content)

**When to use Tier 2:**
- Your content is worth $0.25 to $5 per page
- You need cryptographic proof of payment for your records
- You want better security than Tier 1 without running a backend

**Implementation:** Use the same script tag as Tier 1. The SDK automatically verifies signed receipts when the facilitator provides them. No code changes required on your end.

**How signature verification works:**
1. Extension sends payment authorization to facilitator
2. Facilitator settles payment on-chain
3. Facilitator signs a receipt: `sign(txHash, payTo, amount, network, timestamp)`
4. Extension forwards signed receipt to SDK
5. SDK fetches facilitator's public key from `{facilitatorUrl}/.well-known/x402-public-key` (cached)
6. SDK verifies signature, `payTo` matches your address, `amount` matches your price
7. If verification passes, SDK triggers `onPaymentSuccess`

### Tier 3: Server mode

**What it is:** The extension collects the reader's payment signature, but instead of calling the facilitator directly, it returns the signature to your page. Your page sends the signature to your backend server. Your server verifies and settles the payment with the facilitator using a secret API key. Your server controls whether to reveal the content.

**Security trade-off:** None. This is the standard x402 server-side flow. The reader's browser never sees the content until your server confirms payment.

**What this prevents:**
- ✅ All client-side bypasses (content gating is server-enforced)
- ✅ Forged payments (your server verifies with facilitator before releasing content)
- ✅ Source code inspection (content not sent until payment verified)

**When to use Tier 3:**
- Your content is worth $5+ per page
- You're implementing a hard paywall (no preview)
- You need server-side audit logs and access control
- You need to integrate payments with your existing subscription or CMS system

**Implementation:**

1. Add `data-mode="server"` and `data-payment-url` to your script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
  data-price="50000"
  data-network="eip155:324705682"
  data-mode="server"
  data-payment-url="https://yoursite.com/api/paperwall-payment"
></script>
```

Or with multiple networks:

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
  data-price="50000"
  data-accepts='[{"network":"eip155:1187947933"},{"network":"eip155:8453"}]'
  data-mode="server"
  data-payment-url="https://yoursite.com/api/paperwall-payment"
></script>
```

2. Create a backend endpoint (`/api/paperwall-payment`) that:
   - Receives the payment signature from your frontend
   - Calls the facilitator's `/verify` endpoint to check the signature is valid
   - Calls the facilitator's `/settle` endpoint to process the payment on-chain
   - Returns success/failure to your frontend
   - Logs the transaction for your records

3. Your server responds with success, and your page renders the content.

**Example server endpoint (Node.js/Express):**

```javascript
app.post('/api/paperwall-payment', async (req, res) => {
  const { signature, reader, amount, nonce, validAfter, validBefore, network } = req.body;

  try {
    // Step 1: Verify the signature with facilitator
    // The `network` comes from the reader's client, which selected it
    // from the networks you advertised via data-network or data-accepts.
    const verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FACILITATOR_API_KEY}`
      },
      body: JSON.stringify({
        signature,
        from: reader,
        to: process.env.PUBLISHER_ADDRESS,
        amount,
        nonce,
        validAfter,
        validBefore,
        network
      })
    });

    if (!verifyResponse.ok) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Step 2: Settle the payment on-chain
    const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FACILITATOR_API_KEY}`
      },
      body: JSON.stringify({
        signature,
        from: reader,
        to: process.env.PUBLISHER_ADDRESS,
        amount,
        nonce,
        validAfter,
        validBefore,
        network
      })
    });

    const settlement = await settleResponse.json();

    // Step 3: Log the transaction in your database
    await logPayment({
      txHash: settlement.txHash,
      reader,
      amount,
      timestamp: new Date().toISOString()
    });

    // Step 4: Return success to frontend
    res.json({
      success: true,
      txHash: settlement.txHash
    });
  } catch (error) {
    console.error('Payment processing failed:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});
```

### How the extension works across tiers

The Paperwall extension provides the same user experience in all three tiers:
1. Detects your paywall signal
2. Shows payment prompt to reader
3. Signs EIP-712 authorization using reader's wallet
4. Handles payment flow (Tier 1 & 2) or returns signature to SDK (Tier 3)
5. Updates UI, history, and balance

**The extension is always the reader's wallet interface.** The tier determines who verifies and settles the payment.

### Choosing your tier

| If your content is... | Start with... | Upgrade to... |
|-----------------------|---------------|---------------|
| Ad-supported blog posts ($0.01-$0.05) | Tier 1 | Tier 2 when you need audit trail |
| In-depth articles ($0.10-$1.00) | Tier 2 | Tier 3 if bypasses become a problem |
| Premium reports ($5-$20) | Tier 3 | -- |
| Subscription access ($10+/month) | Tier 3 | -- |

**Key insight:** You can start with Tier 1 today using just a `<script>` tag, then upgrade to Tier 2 (no code change) or Tier 3 (add backend endpoint) later when your revenue justifies the complexity. Each tier adds security without breaking the previous tier's integration.

---

## Troubleshooting

### The Paperwall badge doesn't appear

- **Check the script tag placement.** It should be inside `<body>`, ideally just before `</body>`.
- **Check the browser console.** Press F12, open the Console tab, and look for errors mentioning "Paperwall" or "x402."
- **Check your wallet address.** It must be exactly 42 characters: `0x` followed by 40 hexadecimal characters (0-9 and a-f). Example: `0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B`.
- **Check the price format.** The price must be a whole number (no decimals, no dollar sign). Use `10000`, not `0.01` or `$0.01`.

### I added the script but readers can't pay

- Make sure readers have the Paperwall browser extension installed.
- Check that the `data-facilitator-url` is correct: `https://gateway.kobaru.io`.
- Check that `data-network` uses a supported network ID (see [Supported networks](#supported-networks)) or that `data-accepts` contains valid network entries. Remember that `data-network` and `data-accepts` are mutually exclusive -- use one or the other.

### I can't find my payments

- Use a blockchain explorer for the relevant network to look up your wallet address. If you accept payments on multiple networks (via `data-accepts`), payments may appear on different networks depending on which one the reader's client selected.
- Payments appear as USDC token transfers. Check the explorer for each network you advertise.

---

## Frequently asked questions

**How much does Paperwall cost me as a publisher?**
Nothing. There are no setup fees, no monthly fees, and no percentage cuts. All supported networks (SKALE and Base) have very low gas fees, so readers pay virtually exactly what you charge and you receive nearly that amount. Fees vary slightly by network but are minimal on all of them.

**What if a reader doesn't have the extension?**
They see your page normally, without any paywall. Paperwall is non-blocking by default -- the SDK emits a signal, but if no extension is listening, nothing happens. You can add custom logic (using the JavaScript API) to show a message or gate content for non-paying readers.

**Can I use this with WordPress?**
Yes. Add the script tag using a "Custom HTML" block in the page editor, or use your theme's "Code injection" or "Footer scripts" setting to add it site-wide.

**Is it secure?**
The reader's private key never leaves their device. Payments are signed locally and settled on a public blockchain. The Paperwall SDK runs in the browser and does not collect personal data.

**What happens if the facilitator service goes down?**
Payments cannot be processed while the facilitator is unavailable. The reader's funds remain in their wallet. No money is lost.

**Can readers pay from a phone?**
Paperwall supports Chrome, Firefox, and Edge browsers on desktop. Firefox Android is also supported. Full mobile support for other browsers is planned for the future.
