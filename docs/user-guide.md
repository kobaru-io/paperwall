# User guide

This guide helps you install the Paperwall browser extension so you can pay small amounts to read articles online -- without ads, without subscriptions.

---

## What is Paperwall?

Paperwall is a small program you add to your Chrome browser. It creates a digital wallet on your computer that holds a small amount of money (USDC, a digital dollar). When you visit a website that uses Paperwall, you can choose to pay a few cents to read the article.

**Think of it like a coin jar for the internet.** You put a few dollars in, and every time you read an article, a penny or two comes out. At one cent per article, five dollars covers 500 articles.

---

## Is it safe?

Yes. Here is why:

- **Your money stays on your computer.** Your wallet's secret key (like a password to your money) is stored only on your computer, encrypted with a password you choose. No one else -- not Paperwall, not the website you visit -- can access it.

- **You approve every payment.** Paperwall never pays automatically. Every time a website asks for payment, you see the price and click "Approve" or "Reject." You are always in control.

- **The amounts are tiny.** Most articles cost between one cent and ten cents. Even if something went wrong, you would lose very little.

- **Your password is protected.** If someone tried to guess your password, Paperwall locks your wallet after 5 wrong attempts and makes them wait 5 minutes before trying again.

- **It's open source.** All of the code is publicly available for anyone to inspect. There are no hidden features or tracking.

---

## What you need

Before you start, make sure you have:

- **Google Chrome browser** on your computer (version 120 or newer)
- **A computer** (Windows, Mac, or Linux -- Paperwall does not work on phones yet)

That's all you need to install the extension. To actually pay for content, you will also need some USDC on the SKALE testnet, which we cover in a later section.

---

## Step 1: Install the extension

> **Note:** Paperwall is not yet on the Chrome Web Store. During the testnet phase, you install it manually. This takes about 2 minutes.

### Get the extension files

Pre-built releases will be available on the [GitHub Releases page](https://github.com/kobaru/paperwall/releases) once Paperwall reaches beta. For now, during the testnet phase, you need to build from source.

> **If you're comfortable with a terminal,** follow the [developer guide](developer-guide.md) to clone and build the project. After running `npm run build`, the extension files will be in `packages/extension/dist`.
>
> **If you're not comfortable building from source,** ask a developer friend to build it for you, or wait for the pre-built release on GitHub Releases (coming with Phase 1, Q2 2026).

### Load it into Chrome

1. Open Chrome
2. In the address bar at the top, type `chrome://extensions` and press Enter
3. In the top-right corner of the page, find the switch labeled **"Developer mode"** and turn it **on** (it should turn blue)
4. Click the **"Load unpacked"** button that appears in the top-left area
5. In the file picker that opens, navigate to the `packages/extension/dist` folder and click **"Select Folder"**

You should now see "Paperwall" listed on the extensions page with a small icon.

### Pin the extension (recommended)

To make Paperwall easy to access:

1. Click the **puzzle piece icon** in the top-right corner of Chrome (next to the address bar). This opens the extensions menu.
2. Find **"Paperwall"** in the list.
3. Click the **pin icon** next to it. The Paperwall icon now appears permanently in your toolbar.

---

## Step 2: Create your wallet

The first time you click the Paperwall icon, you will see a screen that says **"Create Wallet."**

### Choose a strong password

Your password protects your money. Choose a strong password:

- **At least 12 characters long**
- **Include at least 3 of these 4 types:** lowercase letters, UPPERCASE letters, numbers, special characters (like `!@#$%`)
- **Example of a good password:** `MyDog$Loves2Run!Fast`
- **Write it down** and keep it somewhere safe. If you forget your password, there is no way to recover your wallet.

### Create the wallet

1. Click the **Paperwall icon** in your Chrome toolbar
2. You will see the "Create Wallet" screen
3. Type your password in the **"Password"** field
4. Type the same password again in the **"Confirm Password"** field
5. Click the **"Create Wallet"** button
6. Wait a moment -- the button will say "Creating..." while it works

When it finishes, you will see your **dashboard** with:

- Your **balance** (it will show $0.00 since your wallet is new)
- Your **wallet address** (a long string starting with `0x` -- this is like your account number)

Your wallet has been created and is ready to receive funds.

---

## Step 3: Add money to your wallet (USDC)

To pay for content, you need USDC (a digital dollar) on the SKALE testnet.

> **Since Paperwall is in testnet phase, you use test money that has no real value.** This lets you try everything without spending real money.

### Getting testnet USDC

To get testnet USDC for your wallet:

1. **Copy your wallet address.** Click the Paperwall icon, then click the **"Copy"** button next to your address. You will see "Copied!" confirming it worked.

2. **Get testnet funds.** Visit the [SKALE Testnet Faucet](https://www.sfuelstation.com/) and select the Paperwall testnet chain. Paste your wallet address and request test USDC. If that faucet is unavailable, check the [SKALE documentation](https://docs.skale.network/) for alternative testnet faucet URLs.

3. **Wait a moment.** After requesting funds, it may take a few seconds for them to appear. Click the **"Refresh"** button on your Paperwall dashboard to check.

Once your balance shows an amount greater than $0.00, you are ready to pay for content.

---

## Step 4: Pay for content

When you visit a website that uses Paperwall, here is what happens:

### You will see a purple dollar sign

The Paperwall icon in your toolbar will show a purple **$** badge. This means the website is asking for a micropayment.

### Click the Paperwall icon

A payment screen appears showing:

- **Site** -- the website asking for payment (for example, `https://example.com`)
- **Price** -- how much it costs (for example, `$0.01 USDC`)
- **Network** -- the payment network (SKALE Testnet)

### Decide: approve or reject

- Click **"Approve Payment"** to pay and access the content. The button will say "Processing..." for a moment, then you will see "Payment successful" with a transaction confirmation.
- Click **"Reject"** if you don't want to pay. You won't be charged anything.

### After payment

After a successful payment:
- The Paperwall icon shows a green checkmark
- The website may unlock content, remove ads, or show a "thank you" message
- The payment is recorded in your history

---

## Step 5: Check your balance

To see how much money is left in your wallet:

1. Click the **Paperwall icon** in your toolbar
2. Your balance is shown at the top of the dashboard (for example, "$4.99 USDC")
3. Click **"Refresh"** to get the latest balance from the blockchain

---

## Step 6: Navigate the popup tabs

After you unlock your wallet, you see a tab bar at the top of the popup with four tabs: **Home**, **History**, **Stats**, and **Settings**. There is also a small **arrow button** in the top-right corner that opens the popup as a full browser tab for more screen space.

### Home tab

The Home tab is your dashboard. It shows your balance, wallet address, and a summary of recent payments. If you have payment history, you will see a **"View all"** link in the history section that takes you to the full History tab.

### History tab

The History tab shows all of your payments, grouped by date: **Today**, **Yesterday**, **This Week**, and **Older**.

- Use the **domain filter** at the top to show payments for a specific website only
- Click any payment row to **expand it** and see details: the full URL, transaction hash, network, and asset

### Stats tab

The Stats tab shows your spending patterns over time.

- Use the **time range selector** to switch between **7 days**, **15 days**, and **30 days**
- At the top you see your **total spend** for the selected period, with a sparkline chart
- Below that, your **top 5 sites** by spending amount
- At the bottom, a **6-month bar chart** showing monthly spending trends

### Settings tab

The Settings tab lets you manage your wallet. See [Wallet management](#wallet-management) below for details on exporting, importing, and creating wallets.

The About section at the bottom shows the extension version, a link to the GitHub repository, and the license.

### Open in tab

Click the **arrow button** at the top-right of the tab bar to open the popup as a full browser tab. This gives you more room to browse your history and stats. The current tab is preserved when you open in a new browser tab.

---

## Wallet management

The Settings tab includes three wallet actions. These are powerful operations, so each one includes safety warnings.

### Export your private key

If you need to back up your private key or move it to another wallet:

1. Go to the **Settings** tab
2. Click **"Export Private Key"**
3. Read the warning carefully -- this wallet is for micropayments only (max ~$50 USDC). Click **"I understand the risks -- Continue"**
4. Enter your password and click **"Reveal Key"**
5. Your private key appears on screen with a **"Copy to Clipboard"** button
6. The key **automatically hides after 60 seconds** and the clipboard is cleared

> **Warning:** Anyone with your private key can access your funds. Never share it. Never paste it into a website.

### Import a private key

If you have an existing private key from another wallet:

1. Go to the **Settings** tab
2. Click **"Import Private Key"**
3. Read the warning: this extension supports only one wallet address. Importing a new key **permanently replaces** your current wallet
4. Check the box confirming you understand, then click **"Proceed"**
5. Enter your private key, choose a new password, confirm it, and click **"Import Wallet"**
6. After import, you will be asked to unlock with your new password

> **Warning:** If you have not exported your current private key first, your current wallet and any funds in it will be permanently lost.

### Create a new wallet

If you want to start fresh with a new wallet:

1. Go to the **Settings** tab
2. Click **"Create New Wallet"**
3. Read the warning: this **permanently replaces** your current wallet
4. Check the confirmation box and click **"Proceed"**
5. Follow the wallet creation steps (choose a password, confirm it)

> **Warning:** This is irreversible. Export your current private key first if you want to keep access to your current funds.

---

## Unlocking your wallet

When you close and reopen Chrome, your wallet locks for security. You need to enter your password to unlock it.

1. Click the **Paperwall icon** in your toolbar
2. You will see the **"Unlock Wallet"** screen
3. Type your password and click **"Unlock"**

If you enter the wrong password:
- You will see "Incorrect password" with the number of attempts remaining
- After 5 wrong attempts, the wallet locks for 5 minutes (this protects you if someone else tries to guess your password)

---

## Troubleshooting

### "Insufficient balance" when trying to pay

Your wallet does not have enough USDC to cover the payment.

**What to do:** Add more USDC to your wallet. See Step 3 above.

### The Paperwall icon doesn't show a purple $ on a website

This means either:
- The website does not use Paperwall
- The page hasn't finished loading yet (wait a moment and check again)
- The extension is disabled (go to `chrome://extensions` and make sure Paperwall is turned on)

### "Wallet is locked" error

You need to enter your password to unlock your wallet.

**What to do:** Click the Paperwall icon and enter your password on the unlock screen.

### I forgot my password

Unfortunately, there is no way to recover a forgotten password. Your wallet is encrypted with your password, and without it, the wallet cannot be unlocked.

**What to do:** If your wallet has very little or no funds, you can remove the extension from Chrome (`chrome://extensions` then click "Remove"), reinstall it, and create a new wallet with a new password.

### Payment failed

If a payment fails:
- The Paperwall icon shows a red **!** badge
- Your money was NOT taken -- failed payments do not cost you anything
- Try again by clicking the Paperwall icon and approving the payment again
- If it keeps failing, the website's payment server may be temporarily unavailable -- try again later

### Extension not working after Chrome update

If Paperwall stops working after a Chrome update:

1. Go to `chrome://extensions`
2. Find Paperwall and click **"Reload"** (the circular arrow icon)
3. If that doesn't help, remove and reinstall the extension

> **Warning:** Removing the extension from Chrome **permanently deletes your wallet data** (including your encrypted private key and payment history). If you remove the extension, you will need to create a new wallet. Make sure your wallet has little or no funds before removing.

---

## Getting help

If you run into a problem not covered here:

- **Check the GitHub project** at [https://github.com/kobaru/paperwall](https://github.com/kobaru/paperwall) for known issues
- **Open a new issue** on GitHub describing what happened -- the development team reads every issue

---

## Glossary

| Term | What it means |
|------|---------------|
| **USDC** | A digital currency where 1 USDC always equals 1 US dollar |
| **Wallet** | A secure place on your computer that holds your USDC |
| **Wallet address** | Your unique account number (starts with `0x`), like a bank account number that people can send money to |
| **Private key** | A secret code that lets you spend your USDC -- Paperwall keeps this encrypted and never shares it |
| **SKALE** | The blockchain network that Paperwall uses -- it has zero transaction fees |
| **Testnet** | A practice version of the blockchain that uses fake money for testing |
| **Micropayment** | A very small payment, usually less than $1 |
| **Extension** | A small program that adds features to your Chrome browser |
