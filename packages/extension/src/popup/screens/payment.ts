// ── Payment Prompt Screen ────────────────────────────────────────
// Displays 3-option payment prompt: Pay & Auto-approve, Pay once, Reject/Block.
// Context-aware variants for budget-exceeded and price-increased cases.

import { formatUsdcFromString } from '../../shared/format.js';
import { getNetwork, isTestnet } from '../../shared/constants.js';

interface PageState {
  origin: string;
  price: string;
  network: string;
  facilitatorUrl: string;
  autoPayReason?: string;
}

export function renderPaymentPrompt(
  container: HTMLElement,
  pageState: PageState,
  onComplete: () => void,
): void {
  container.innerHTML = '';
  container.style.padding = '16px';

  const heading = document.createElement('h1');
  heading.textContent = 'Payment Request';
  heading.className = 'screen-title';

  const description = document.createElement('p');
  description.className = 'screen-description';
  description.textContent = 'This site uses Paperwall for ad-free browsing.';

  // ── Context Alert Banner ─────────────────────────────────────
  const reason = pageState.autoPayReason ?? '';
  const isBudgetExceeded = reason.includes('budget');
  const isPriceIncreased = reason.includes('max amount');

  let alertBanner: HTMLElement | null = null;
  if (isBudgetExceeded || isPriceIncreased) {
    alertBanner = document.createElement('div');
    alertBanner.className = 'payment-alert';
    alertBanner.setAttribute('role', 'alert');
    if (isBudgetExceeded) {
      alertBanner.textContent = 'Auto-pay paused: spending limit reached for this period.';
    } else {
      alertBanner.textContent = 'Auto-pay paused: price exceeds your approved amount.';
    }
  }

  // ── Site Info ────────────────────────────────────────────────
  const siteSection = document.createElement('section');
  siteSection.className = 'payment-site-section';
  siteSection.setAttribute('aria-label', 'Payment details');

  const originLabel = document.createElement('p');
  originLabel.className = 'payment-label';
  originLabel.textContent = 'Site';

  const originValue = document.createElement('p');
  originValue.className = 'payment-value';
  originValue.textContent = pageState.origin;

  const priceLabel = document.createElement('p');
  priceLabel.className = 'payment-label';
  priceLabel.textContent = 'Price';

  const priceValue = document.createElement('p');
  priceValue.className = 'payment-value payment-price';
  priceValue.textContent = `$${formatUsdcFromString(pageState.price)} USDC`;

  const networkVia = document.createElement('p');
  networkVia.className = 'network-via';
  networkVia.textContent = `via ${formatNetworkName(pageState.network)}`;

  if (isTestnet(pageState.network)) {
    const testBadge = document.createElement('span');
    testBadge.className = 'badge-test';
    testBadge.textContent = 'TEST';
    testBadge.setAttribute('aria-label', 'Testnet network');
    networkVia.appendChild(testBadge);
  }

  siteSection.append(originLabel, originValue, priceLabel, priceValue, networkVia);

  // ── Status Display ───────────────────────────────────────────
  const statusDisplay = document.createElement('p');
  statusDisplay.className = 'payment-status';
  statusDisplay.setAttribute('role', 'status');
  statusDisplay.setAttribute('aria-live', 'polite');

  // ── Buttons (vertical stack) ─────────────────────────────────
  const buttonStack = document.createElement('div');
  buttonStack.className = 'payment-buttons-stack';

  // Primary: Pay & Auto-approve (or context variant)
  const autoApproveButton = document.createElement('button');
  autoApproveButton.type = 'button';
  autoApproveButton.className = 'btn btn-primary';
  if (isPriceIncreased) {
    autoApproveButton.textContent = `Pay $${formatUsdcFromString(pageState.price)} & Update Limit`;
  } else if (isBudgetExceeded) {
    autoApproveButton.textContent = `Pay $${formatUsdcFromString(pageState.price)} & Increase Budget`;
  } else {
    autoApproveButton.textContent = `Pay $${formatUsdcFromString(pageState.price)} & Auto-approve`;
  }

  // Secondary: Pay once
  const payOnceButton = document.createElement('button');
  payOnceButton.type = 'button';
  payOnceButton.className = 'btn btn-secondary';
  payOnceButton.textContent = `Pay $${formatUsdcFromString(pageState.price)} once`;

  // Text links: Reject + Block this site
  const linksRow = document.createElement('div');
  linksRow.className = 'payment-links';

  const rejectLink = document.createElement('button');
  rejectLink.type = 'button';
  rejectLink.className = 'btn-link';
  rejectLink.textContent = 'Reject';

  const blockLink = document.createElement('button');
  blockLink.type = 'button';
  blockLink.className = 'btn-link btn-link--danger';
  blockLink.textContent = 'Block this site';

  linksRow.append(rejectLink, blockLink);

  buttonStack.append(autoApproveButton, payOnceButton, linksRow);

  // ── Block Confirmation ───────────────────────────────────────
  const blockConfirm = document.createElement('div');
  blockConfirm.className = 'payment-block-confirm';
  blockConfirm.style.display = 'none';

  const blockMsg = document.createElement('p');
  blockMsg.className = 'payment-block-msg';
  blockMsg.textContent = `Block ${pageState.origin}? You won't see payment prompts for this site.`;

  const blockYes = document.createElement('button');
  blockYes.type = 'button';
  blockYes.className = 'btn btn-danger btn-small';
  blockYes.textContent = 'Yes, block';

  const blockCancel = document.createElement('button');
  blockCancel.type = 'button';
  blockCancel.className = 'btn btn-secondary btn-small';
  blockCancel.textContent = 'Cancel';

  blockConfirm.append(blockMsg, blockYes, blockCancel);

  // ── Loading / Status helpers ─────────────────────────────────
  function setLoading(loading: boolean): void {
    autoApproveButton.disabled = loading;
    payOnceButton.disabled = loading;
    rejectLink.disabled = loading;
    blockLink.disabled = loading;
    if (loading) {
      statusDisplay.textContent = 'Signing and sending payment...';
      statusDisplay.className = 'payment-status';
    }
  }

  function showStatus(message: string, isError: boolean): void {
    statusDisplay.textContent = message;
    statusDisplay.className = isError
      ? 'payment-status payment-status--error'
      : 'payment-status payment-status--success';
  }

  // ── Core payment handler ─────────────────────────────────────
  let paymentInProgress = false;

  async function handlePayment(autoApprove: boolean): Promise<void> {
    if (paymentInProgress) return;
    paymentInProgress = true;
    setLoading(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id ?? 0;

      const response = await chrome.runtime.sendMessage({
        type: 'SIGN_AND_PAY',
        tabId,
      });

      if (response.success) {
        if (autoApprove) {
          // Trust the site for future auto-pay
          await chrome.runtime.sendMessage({
            type: 'AUTO_PAY_TRUST_SITE',
            origin: pageState.origin,
            maxAmountRaw: pageState.price,
          });

          // Check if explainer needs to be shown
          const rulesResponse = await chrome.runtime.sendMessage({ type: 'GET_AUTO_PAY_RULES' });
          if (rulesResponse?.success) {
            const rules = rulesResponse.rules as { explainerDismissed?: boolean } | undefined;
            if (rules && !rules.explainerDismissed) {
              showExplainerOverlay(container);
            }
          }
        }

        const txHash = (response.transaction as string) ?? '';
        const truncatedHash = txHash
          ? `${txHash.slice(0, 10)}...${txHash.slice(-6)}`
          : 'confirmed';
        showStatus(`Payment successful: ${truncatedHash}`, false);

        setTimeout(() => onComplete(), 2000);
      } else {
        const errorMsg = (response.error as string) || 'Payment failed.';
        showStatus(errorMsg, true);

        if (response.networkBalances && response.needed) {
          const balances = response.networkBalances as Record<string, { network: string; formatted: string }>;
          const needed = response.needed as string;
          showBalanceBreakdown(statusDisplay, balances, needed);
        }

        paymentInProgress = false;
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showStatus(message, true);
      paymentInProgress = false;
      setLoading(false);
    }
  }

  // ── Event Listeners ──────────────────────────────────────────

  autoApproveButton.addEventListener('click', () => handlePayment(true));
  payOnceButton.addEventListener('click', () => handlePayment(false));

  rejectLink.addEventListener('click', () => onComplete());

  blockLink.addEventListener('click', () => {
    blockConfirm.style.display = '';
    buttonStack.style.display = 'none';
  });

  blockCancel.addEventListener('click', () => {
    blockConfirm.style.display = 'none';
    buttonStack.style.display = '';
  });

  blockYes.addEventListener('click', async () => {
    blockYes.disabled = true;
    blockCancel.disabled = true;
    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_ADD_DENYLIST',
      origin: pageState.origin,
    });
    onComplete();
  });

  // ── Assembly ─────────────────────────────────────────────────
  container.append(heading, description);
  if (alertBanner) container.appendChild(alertBanner);
  container.append(siteSection, statusDisplay, buttonStack, blockConfirm);

  autoApproveButton.focus();
}

// ── Explainer Overlay ─────────────────────────────────────────────

function showExplainerOverlay(container: HTMLElement): void {
  const overlay = document.createElement('div');
  overlay.className = 'explainer-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Auto-approve explainer');

  const card = document.createElement('div');
  card.className = 'explainer-card';

  const title = document.createElement('h2');
  title.className = 'explainer-title';
  title.textContent = 'Auto-Approve Enabled';

  const body = document.createElement('p');
  body.className = 'explainer-body';
  body.textContent =
    'This site will be paid automatically on future visits, within your budget limits. ' +
    'You can manage trusted sites and budgets in the Budget tab.';

  const gotIt = document.createElement('button');
  gotIt.type = 'button';
  gotIt.className = 'btn btn-primary';
  gotIt.textContent = 'Got it';

  async function dismiss(): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'DISMISS_EXPLAINER' });
    overlay.remove();
  }

  gotIt.addEventListener('click', dismiss);

  // Escape key dismisses
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      dismiss();
      document.removeEventListener('keydown', handleKeyDown);
    }
  }
  document.addEventListener('keydown', handleKeyDown);

  card.append(title, body, gotIt);
  overlay.appendChild(card);
  container.appendChild(overlay);

  // Focus trap: focus the button
  gotIt.focus();
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatNetworkName(caip2: string): string {
  try {
    return getNetwork(caip2).name;
  } catch {
    return caip2;
  }
}

function showBalanceBreakdown(
  statusEl: HTMLElement,
  balances: Record<string, { network: string; formatted: string }>,
  needed: string,
): void {
  const breakdown = document.createElement('div');
  breakdown.className = 'network-breakdown';
  breakdown.setAttribute('role', 'list');
  breakdown.setAttribute('aria-label', 'Balance per network');

  const header = document.createElement('p');
  header.className = 'payment-label';
  header.textContent = `Need $${needed} USDC`;
  breakdown.appendChild(header);

  for (const [caip2, bal] of Object.entries(balances)) {
    const row = document.createElement('div');
    row.className = 'network-row';
    row.setAttribute('role', 'listitem');

    const nameContainer = document.createElement('span');
    nameContainer.className = 'network-row-name';
    nameContainer.textContent = formatNetworkName(caip2);

    if (isTestnet(caip2)) {
      const badge = document.createElement('span');
      badge.className = 'badge-test';
      badge.textContent = 'TEST';
      badge.setAttribute('aria-label', 'Testnet network');
      nameContainer.appendChild(badge);
    }

    const amount = document.createElement('span');
    amount.className = 'network-row-amount';
    amount.textContent = `$${bal.formatted}`;

    row.append(nameContainer, amount);
    breakdown.appendChild(row);
  }

  statusEl.insertAdjacentElement('afterend', breakdown);
}
