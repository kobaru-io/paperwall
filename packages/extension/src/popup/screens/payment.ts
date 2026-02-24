// ── Payment Prompt Screen ────────────────────────────────────────
// Displayed when the user is on a Paperwall page and clicks "Pay".
// Shows site info, price, and approve/reject buttons.

import { formatUsdcFromString } from '../../shared/format.js';
import { getNetwork } from '../../shared/constants.js';

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

  const networkLabel = document.createElement('p');
  networkLabel.className = 'payment-label';
  networkLabel.textContent = 'Network';

  const networkValue = document.createElement('p');
  networkValue.className = 'payment-value';
  networkValue.textContent = formatNetworkName(pageState.network);

  siteSection.append(
    originLabel,
    originValue,
    priceLabel,
    priceValue,
    networkLabel,
    networkValue,
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
        showStatus(
          (response.error as string) || 'Payment failed.',
          true,
        );
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
