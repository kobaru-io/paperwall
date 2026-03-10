// ── Payment Prompt Screen ────────────────────────────────────────
// Displayed when the user is on a Paperwall page and clicks "Pay".
// Shows site info, price, and approve/reject buttons.

import { formatUsdcFromString } from '../../shared/format.js';
import { getNetwork, isTestnet } from '../../shared/constants.js';

interface PageState {
  origin: string;
  price: string;
  network: string;
  facilitatorUrl: string;
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

  // Site Info
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

  siteSection.append(
    originLabel,
    originValue,
    priceLabel,
    priceValue,
    networkVia,
  );

  // Status display
  const statusDisplay = document.createElement('p');
  statusDisplay.className = 'payment-status';
  statusDisplay.setAttribute('role', 'status');
  statusDisplay.setAttribute('aria-live', 'polite');

  // Buttons
  const buttonRow = document.createElement('div');
  buttonRow.className = 'payment-buttons';

  const approveButton = document.createElement('button');
  approveButton.type = 'button';
  approveButton.textContent = 'Approve Payment';
  approveButton.className = 'btn btn-primary';

  const rejectButton = document.createElement('button');
  rejectButton.type = 'button';
  rejectButton.textContent = 'Reject';
  rejectButton.className = 'btn btn-secondary';

  buttonRow.append(rejectButton, approveButton);

  // Loading state
  function setLoading(loading: boolean): void {
    approveButton.disabled = loading;
    rejectButton.disabled = loading;
    approveButton.textContent = loading ? 'Processing...' : 'Approve Payment';
  }

  function showStatus(message: string, isError: boolean): void {
    statusDisplay.textContent = message;
    statusDisplay.className = isError
      ? 'payment-status payment-status--error'
      : 'payment-status payment-status--success';
  }

  // Approve handler (guard against rapid double-click)
  let approveInProgress = false;
  async function handleApprove(): Promise<void> {
    if (approveInProgress) return;
    approveInProgress = true;
    setLoading(true);
    statusDisplay.textContent = 'Signing and sending payment...';
    statusDisplay.className = 'payment-status';

    try {
      // Get active tab to determine tabId
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tab?.id ?? 0;

      const response = await chrome.runtime.sendMessage({
        type: 'SIGN_AND_PAY',
        tabId,
      });

      if (response.success) {
        const txHash = (response.txHash as string) ?? '';
        const truncatedHash = txHash
          ? `${txHash.slice(0, 10)}...${txHash.slice(-6)}`
          : 'confirmed';
        showStatus(`Payment successful: ${truncatedHash}`, false);

        // Transition back to dashboard after a short delay
        setTimeout(() => onComplete(), 2000);
      } else {
        const errorMsg = (response.error as string) || 'Payment failed.';
        showStatus(errorMsg, true);

        // Show per-network balance breakdown on insufficient balance
        if (response.networkBalances && response.needed) {
          const balances = response.networkBalances as Record<string, { network: string; formatted: string }>;
          const needed = response.needed as string;
          showBalanceBreakdown(statusDisplay, balances, needed);
        }

        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showStatus(message, true);
      setLoading(false);
    }
  }

  // Reject handler
  function handleReject(): void {
    onComplete();
  }

  approveButton.addEventListener('click', handleApprove);
  rejectButton.addEventListener('click', handleReject);

  container.append(
    heading,
    description,
    siteSection,
    statusDisplay,
    buttonRow,
  );

  approveButton.focus();
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
  container: HTMLElement,
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

  // Insert breakdown after the status message
  container.insertAdjacentElement('afterend', breakdown);
}
