# Paperwall Demo Video Script

3-minute demo for the SF Agentic Commerce x402 Hackathon.
Record each section independently, stitch in kdenlive.

---

## Pre-Recording Setup

Run these commands before you start recording any section.

```bash
# 1. Build everything
npm run build

# 2. Ensure wallet exists and is funded (~$5 USDC on SKALE testnet)
paperwall wallet address    # get address to fund
paperwall wallet balance    # confirm funds arrived

# 3. Set a tight daily budget so Section 5 triggers a decline on the 4th article
paperwall budget set --per-request 0.10 --daily 0.03 --total 10.00

# 4. Clear history for a clean demo (optional)
rm -f ~/.paperwall/history.jsonl ~/.paperwall/receipts.jsonl

# 5. Verify demo server works
node demo/server.js
# Open http://localhost:8080 in browser, confirm articles load, then Ctrl+C

# 6. Verify agent server works
paperwall serve --port 4000
# Ctrl+C after confirming startup

# 7. Load the extension in Chrome
# chrome://extensions → Developer mode → Load unpacked → packages/extension/dist/
```

### Terminal settings

- Font size: 18pt
- Theme: dark background, light text
- Maximize the terminal window
- Use two terminal tabs (one for servers, one for commands)

### Browser settings

- Hide bookmarks bar for cleaner recording
- Pin the Paperwall extension icon to the toolbar
- Close unrelated tabs
- Have the GitHub repo open in a tab (you'll scroll through it in Section 1)

---

## Section 1: Problem + Solution (~30s)

**Recording type:** screen recording — browser on GitHub repo

### Actions

1. Open the repo on GitHub: `https://github.com/kobaru/paperwall`
2. The README renders with logo, tagline, and "The problem" section visible
3. Slowly scroll through **"The problem"** section while narrating (4 bullet points + "What changed")
4. Scroll to the **"How it works"** mermaid diagram — pause on it
5. Scroll to the **"Project structure"** section — pause briefly to show the 3 packages

### Voiceover

> "The web runs on ads — and it's broken."

*(scroll to "The problem" section — the 4-point cycle is visible)*

> "Publishers earn fractions of a cent per view, readers install ad blockers, publishers retaliate, and nobody wins. Meanwhile, AI agents are browsing too — they can't see ads at all, so publishers earn nothing from agent traffic."

*(scroll to "What changed" — SKALE, x402, Kobaru facilitator)*

> "Three things changed: SKALE network made sub-cent transactions viable. The x402 protocol standardized web payments. And we built Paperwall on top of both."

*(scroll to the mermaid sequence diagram)*

> "Three components: a publisher SDK — one script tag. A Chrome extension for human readers. A CLI agent with an A2A server for AI agents. All settling on-chain through the same facilitator."

*(scroll to project structure)*

> "Let me show you each one."

### Cut point

---

## Section 2: Publisher Integration (~15s)

**Recording type:** screen recording — browser on GitHub repo, then code

### Actions

1. Still on the GitHub README, scroll to the **"Quick start → For publishers"** section
2. Show the script tag code block — it's right there in the README
3. Optionally switch to the actual file in the repo: `demo/articles/article-1.html` (lines 232-238)

### What the README shows

```html
<script src="https://cdn.jsdelivr.net/npm/@paperwall/sdk/dist/index.iife.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="YOUR_EVM_ADDRESS"
  data-price="10000"
  data-network="eip155:324705682"
></script>
```

### Voiceover

> "For publishers, this is the entire integration. One script tag — set your wallet address, set your price, done. The SDK emits a payment signal that browsers and agents detect automatically."

### Cut point

---

## Section 3: Browser Extension (~40s)

**Recording type:** screen recording — terminal + browser side by side

### Actions

**Terminal:**

```bash
# Start the demo server
node demo/server.js
```

Wait for the ASCII art banner and `Local: http://localhost:8080` to appear.

**Browser:**

1. Navigate to `http://localhost:8080`
2. Show "The Daily Paper" homepage — three article cards visible
3. Click on **Article 1** ("The Rise of Micropayments...")
4. Let the page load — note the banner ad, inline ad, sidebar ad
5. Click the **Paperwall extension icon** in the toolbar
6. Show the popup: balance ($X.XX USDC), wallet address, "Paperwall detected — $0.01"
7. Click **"Approve Payment"**
8. Wait for: "Signing and sending payment..." then "Payment successful: 0x..."
9. Watch the page — ads disappear, "Thank you for your support!" banner appears
10. Click the extension icon again — show payment in history: "localhost — $0.01 — just now"

### Voiceover

> "Here's our demo site — The Daily Paper. I'll open an article."

*(click article)*

> "Ads everywhere. The extension detects the Paperwall signal automatically."

*(click extension icon)*

> "One cent. One click."

*(click Approve)*

> "Settled on SKALE in under two seconds. Publisher got paid, ads are gone."

*(show history)*

**Terminal (after recording):**

```bash
# Stop the demo server
Ctrl+C
```

### Cut point

---

## Section 4: Agent CLI + Gemini Skill (~45s)

**Recording type:** screen recording — terminal fullscreen

### Actions

**Part A: Installation**

```bash
# Run the install script targeting Gemini
bash packages/agent/install.sh gemini
```

The ASCII art banner prints, then:

- Build runs
- CLI symlinked to `~/.local/bin/paperwall`
- Skill installed for Gemini CLI at `~/.gemini/skills/paperwall`
- Wallet setup prompt appears — choose **1 (Create new wallet)** or **3 (Skip)** if already set up
- Budget prompt appears — choose **skip** if already configured

**Part B: Show wallet + budget**

```bash
# Show wallet balance
paperwall wallet balance

# Show budget status
paperwall budget status
```

**Part C: Gemini uses it**

Start the demo server in the background first:

```bash
# Start demo server in background
node demo/server.js &
```

Open Gemini CLI:

```bash
gemini
```

Prompt Gemini:

```
fetch this article for me: http://localhost:8080/articles/article-2.html
```

Gemini should recognize the paperwall skill, run `paperwall fetch`, and show the result with payment info.

After Gemini finishes:

```bash
# Stop the background demo server
kill %1
```

### Voiceover

> "The install script builds the CLI, links it to your PATH, and installs a skill for Gemini — so the AI assistant knows how to use Paperwall natively."

*(wallet + budget shown)*

> "Budget guardrails — hard gates, not suggestions. Per-request cap, daily limit, total ceiling."

*(Gemini prompt)*

> "Now watch Gemini use it. I ask it to fetch a paywalled article..."

*(Gemini runs paperwall fetch)*

> "Gemini discovered the payment, checked the budget, signed, paid, and returned the content — all autonomously."

### Backup plan

If Gemini is flaky live, record the direct CLI fetch as a fallback:

```bash
# Direct CLI fetch (backup if Gemini misbehaves)
paperwall fetch http://localhost:8080/articles/article-2.html --max-price 0.10
```

The JSON output should show `ok: true`, `payment.amountFormatted`, `payment.txHash`.

### Cut point

---

## Section 5: A2A Server + AP2 Lifecycle (~40s)

**Recording type:** screen recording — terminal (two tabs/panes recommended)

### Actions

**Tab 1: Start the A2A server**

```bash
# Reset budget so the 4th article triggers a decline
paperwall budget set --per-request 0.10 --daily 0.03 --total 10.00

# Clear previous receipts for a clean demo
rm -f ~/.paperwall/receipts.jsonl

# Start the A2A server
paperwall serve --port 4000
```

Wait for ASCII art banner + server startup message.

**Tab 2: Discover + Demo**

```bash
# Show the agent card (A2A discovery)
curl -s http://localhost:4000/.well-known/agent-card.json | jq .
```

Pause briefly to show the JSON (name, protocol version, skills).

```bash
# Start demo server for article content
node demo/server.js &

# Run the full AP2 lifecycle demo
paperwall demo --server http://localhost:4000 \
  --articles http://localhost:8080/articles/article-1.html \
            http://localhost:8080/articles/article-2.html \
            http://localhost:8080/articles/article-3.html \
            http://localhost:8080/articles/article-1.html \
  --verbose
```

The output should show:

- Articles 1-3: successful AP2 lifecycle (intent → authorization → settlement → receipt)
- Article 4: **DENIED** — daily budget exceeded, receipt stage `[declined]`

After the demo finishes, show the summary (total requests, successful, declined, total USDC spent, explorer links).

**Browser: Receipt viewer**

```
http://localhost:4000/receipts
```

Open this URL to show the HTML receipt dashboard with settled + declined entries and explorer links.

**Cleanup:**

```bash
# Stop demo server and A2A server
kill %1
# Ctrl+C in Tab 1 to stop A2A server
```

### Voiceover

> "The A2A server exposes Paperwall as a discoverable agent. Any AI agent can find it through a standard agent card."

*(show agent card JSON)*

> "Now the full AP2 lifecycle demo — intent, authorization, settlement, receipt."

*(demo runs, articles succeed)*

> "Every step tracked. Payer, payee, tx hash, explorer link."

*(article 4 gets declined)*

> "Budget exceeded — hard stop. The agent knows not to retry. That's trust and safety built into the protocol."

*(show receipt viewer in browser)*

> "And every payment leaves a receipt — settled or declined, with explorer links back to SKALE. Full audit trail."

### Cut point

---

## Section 6: Closing (~10s)

**Recording type:** screen recording — browser on GitHub repo

### Actions

1. Switch back to the GitHub repo page
2. Scroll to the top so the logo and tagline are visible
3. Linger for a few seconds

### Voiceover

> "Paperwall — micropayments for the web. x402 signals, AP2 lifecycle, SKALE settlement. Works for humans and AI agents. One penny, no ads, no middlemen."

### Cut point

---

## kdenlive Assembly

| Track     | Source File               | Approx Duration |
| --------- | ------------------------- | --------------- |
| 1         | `section-1-problem.mp4`   | ~30s            |
| 2         | `section-2-publisher.mp4` | ~15s            |
| 3         | `section-3-extension.mp4` | ~40s            |
| 4         | `section-4-agent-cli.mp4` | ~45s            |
| 5         | `section-5-a2a-demo.mp4`  | ~40s            |
| 6         | `section-6-closing.mp4`   | ~10s            |
| **Total** |                           | **~3:00**       |

### kdenlive tips

- Add 0.5s crossfade transitions between sections
- Speed up terminal waiting time (build steps, server startup) to 2-4x
- Keep payment moments at 1x speed — those are the money shots
- Add subtle background music (royalty-free lo-fi) at low volume under voiceover
- Consider a lower-third title card at each section transition: "Publisher SDK", "Browser Extension", "AI Agent", "A2A Protocol"

---

## GitHub Pages Used in the Video

These are the parts of the README that appear on camera:

| README Section                 | Used In                             | What's Visible                   |
| ------------------------------ | ----------------------------------- | -------------------------------- |
| Logo + tagline                 | Section 1 (open), Section 6 (close) | "Micropayments for the open web" |
| "The problem"                  | Section 1                           | 4-point lose-lose cycle          |
| "What changed"                 | Section 1                           | SKALE, x402, Kobaru              |
| "How it works" (mermaid)       | Section 1                           | Sequence diagram                 |
| "Project structure"            | Section 1                           | 3 packages + demo + test         |
| "Quick start → For publishers" | Section 2                           | Script tag code block            |

No slides needed. The README is the presentation.

---

## Hackathon Track Alignment

| Judging Criterion                                       | Where It's Shown                      | Section |
| ------------------------------------------------------- | ------------------------------------- | ------- |
| Real-world workflow (discover → decide → pay → outcome) | Full flow in extension + CLI          | 3, 4    |
| Trust + safety (guardrails)                             | Budget status + budget decline        | 4, 5    |
| Receipts / audit trail                                  | AP2 tree output + receipt viewer      | 5       |
| x402 flow (signal → pay → content)                      | CLI fetch + extension payment         | 3, 4    |
| AP2 lifecycle (intent → auth → settlement → receipt)    | Demo command verbose output           | 5       |
| A2A discovery                                           | Agent card curl                       | 5       |
| Failure mode                                            | Budget exceeded decline               | 5       |
| Polish / UX                                             | Extension popup + receipt HTML viewer | 3, 5    |
| Partner integration (SKALE)                             | All payments on SKALE testnet         | 3, 4, 5 |
| AI readiness                                            | Gemini skill integration              | 4       |
