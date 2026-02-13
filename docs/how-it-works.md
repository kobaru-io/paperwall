# How Paperwall works

Paperwall lets you pay tiny amounts -- as low as one cent -- to read articles online. No subscriptions, no ads, no accounts. You load a few dollars into a digital wallet, and when you visit a paywalled page, Paperwall handles the payment for you. Think of it like tossing a coin into a jar at the newsstand.

Publishers set prices (usually between $0.01 and $0.10 per article), and you choose whether to pay. The money goes directly to the publisher using cryptocurrency (USDC on the SKALE network), which keeps fees near zero -- almost the full amount reaches the publisher.

---

## Three ways publishers can set up paywalls

Paperwall supports three different paywall types. You do not need to know which one a publisher uses -- Paperwall detects it automatically and handles the payment. But if you are curious, here is how they work:

### 1. HTTP 402 -- "Payment Required"

The most straightforward type. When you visit the page, the server responds with HTTP status code 402 ("Payment Required") and includes payment details in the response headers. Paperwall signs the payment, sends it with the request, and the server returns the full content.

This uses the [x402 protocol](https://www.x402.org/), an open standard for HTTP-native payments.

### 2. Client mode -- payment info in the page

The publisher serves the page with a hidden `<meta>` tag that contains the price and the publisher's wallet address. Paperwall reads this tag, sends the payment directly to a facilitator service (which submits it to the blockchain), and the publisher's server delivers the full content.

### 3. Server mode -- publisher handles payment

Similar to client mode, but instead of paying through a facilitator, Paperwall signs a payment authorization and sends it to the publisher's own server. The publisher verifies and submits the payment themselves.

---

## How a payment works, step by step

Here is what happens behind the scenes when you pay for an article:

1. **You visit a page.** Paperwall (the browser extension or the CLI agent) fetches the page and detects a paywall.

2. **Paperwall checks your budget.** Before doing anything, it verifies the price fits within your spending limits (per-request cap, daily cap, lifetime cap). If the price exceeds any limit, the payment is declined.

3. **You sign a payment authorization.** Paperwall creates an EIP-712 typed-data message (a standard Ethereum signature format) that authorizes transferring the exact amount from your wallet to the publisher. This signature includes a random nonce and a 5-minute expiration to prevent replay attacks.

4. **The payment settles on-chain.** A facilitator service takes your signed authorization and submits it to the SKALE blockchain. The USDC moves from your wallet to the publisher's wallet. This is a real blockchain transaction with a verifiable transaction hash.

5. **You get the content.** Paperwall receives the full article and displays it to you.

The whole process takes a few seconds. On the SKALE network, transaction fees are ultra-low, so a one-cent payment actually delivers close to one cent to the publisher.

---

## Payment detection priority

When Paperwall fetches a page, it checks for paywalls in this order:

| Priority | What it looks for | What happens |
|----------|-------------------|--------------|
| 1 | HTTP 402 response | Signs payment and retries the request |
| 2 | `<meta>` tag with `mode="client"` | Pays through the facilitator service |
| 3 | `<meta>` tag with `mode="server"` | Signs and sends payment to the publisher's server |
| 4 | No paywall signal | Returns the content as-is (free) |

If multiple signals are present, the higher-priority one wins.

---

## Next steps

- **Browser users:** Install the Chrome extension with the [user guide](user-guide.md)
- **AI agent users:** Set up Claude Code or Gemini CLI with the [AI agent setup guide](ai-agent-setup.md)
- **CLI users:** Learn all commands in the [agent CLI guide](agent-cli-guide.md)
- **Server operators:** Run the A2A server with the [A2A server guide](a2a-server-guide.md)
- **Publishers:** Add Paperwall to your site with the [publisher guide](publisher-guide.md)
