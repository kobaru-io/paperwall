// ── Dashboard Screen ────────────────────────────────────────────────
// Main screen after wallet is unlocked. Shows balance, address, history.

import { formatUsdcFromString } from '../../shared/format.js';

export function renderDashboard(
  container: HTMLElement,
  address: string,
): void {
  container.innerHTML = '';

  // Header
  const header = document.createElement('header');
  header.className = 'dashboard-header';

  const heading = document.createElement('h1');
  heading.textContent = 'Paperwall';
  heading.className = 'screen-title';

  const statusDot = document.createElement('span');
  statusDot.className = 'status-dot status-dot--active';
  statusDot.setAttribute('aria-label', 'Wallet unlocked');
  heading.appendChild(statusDot);

  header.appendChild(heading);

  // Balance Section
  const balanceSection = document.createElement('section');
  balanceSection.className = 'balance-section';
  balanceSection.setAttribute('aria-label', 'Wallet balance');

  const balanceLabel = document.createElement('p');
  balanceLabel.className = 'balance-label';
  balanceLabel.textContent = 'Balance';

  const balanceAmount = document.createElement('p');
  balanceAmount.className = 'balance-amount';
  balanceAmount.textContent = '--';
  balanceAmount.setAttribute('aria-live', 'polite');

  const balanceAsset = document.createElement('span');
  balanceAsset.className = 'balance-asset';
  balanceAsset.textContent = 'USDC';

  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'btn btn-secondary btn-small';
  refreshButton.textContent = 'Refresh';
  refreshButton.setAttribute('aria-label', 'Refresh balance');

  balanceSection.append(balanceLabel, balanceAmount, balanceAsset, refreshButton);

  // Address Section
  const addressSection = document.createElement('section');
  addressSection.className = 'address-section';
  addressSection.setAttribute('aria-label', 'Wallet address');

  const addressLabel = document.createElement('p');
  addressLabel.className = 'address-label';
  addressLabel.textContent = 'Address';

  const addressDisplay = document.createElement('p');
  addressDisplay.className = 'address-display';
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
  addressDisplay.textContent = truncated;
  addressDisplay.title = address;

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'btn btn-secondary btn-small';
  copyButton.textContent = 'Copy';
  copyButton.setAttribute('aria-label', 'Copy full wallet address to clipboard');

  const copyFeedback = document.createElement('span');
  copyFeedback.className = 'copy-feedback';
  copyFeedback.setAttribute('aria-live', 'polite');

  addressSection.append(addressLabel, addressDisplay, copyButton, copyFeedback);

  // History Section
  const historySection = document.createElement('section');
  historySection.className = 'history-section';
  historySection.setAttribute('aria-label', 'Payment history');

  const historyHeading = document.createElement('h2');
  historyHeading.className = 'section-heading';
  historyHeading.textContent = 'Last 5 Payments';

  const historyList = document.createElement('ul');
  historyList.className = 'history-list';
  historyList.setAttribute('aria-label', 'Payment list');

  const historyEmpty = document.createElement('p');
  historyEmpty.className = 'history-empty';
  historyEmpty.textContent = 'No payments yet.';

  historySection.append(historyHeading, historyList, historyEmpty);

  // Page Status Section
  const pageSection = document.createElement('section');
  pageSection.className = 'page-status-section';
  pageSection.setAttribute('aria-label', 'Current page status');

  const pageHeading = document.createElement('h2');
  pageHeading.className = 'section-heading';
  pageHeading.textContent = 'Current Page';

  const pageStatus = document.createElement('p');
  pageStatus.className = 'page-status';
  pageStatus.textContent = 'No Paperwall content detected.';
  pageStatus.setAttribute('aria-live', 'polite');

  pageSection.append(pageHeading, pageStatus);

  // Assemble
  container.append(
    header,
    balanceSection,
    addressSection,
    historySection,
    pageSection,
  );

  // ── Load Data ───────────────────────────────────────────────────

  async function loadBalance(): Promise<void> {
    balanceAmount.textContent = 'Loading...';
    refreshButton.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_BALANCE',
      });

      if (response.success) {
        const balance = response.balance as {
          formatted: string;
          asset: string;
        };
        balanceAmount.textContent = `$${balance.formatted}`;
        balanceAsset.textContent = balance.asset;
      } else {
        balanceAmount.textContent = 'Error';
      }
    } catch {
      balanceAmount.textContent = 'Error';
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function loadHistory(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_HISTORY',
        limit: 5,
        offset: 0,
      });

      if (response.success && Array.isArray(response.records)) {
        const records = response.records as Array<{
          origin: string;
          amount: string;
          formattedAmount: string;
          timestamp: number;
          status: string;
        }>;

        if (records.length === 0) {
          historyList.style.display = 'none';
          historyEmpty.style.display = 'block';
        } else {
          historyEmpty.style.display = 'none';
          historyList.style.display = 'block';
          historyList.innerHTML = '';

          for (const record of records) {
            const li = document.createElement('li');
            li.className = 'history-item';

            const origin = document.createElement('span');
            origin.className = 'history-origin';
            origin.textContent = record.origin;

            const amount = document.createElement('span');
            amount.className = 'history-amount';
            amount.textContent = `$${record.formattedAmount}`;

            const time = document.createElement('time');
            time.className = 'history-time';
            time.dateTime = new Date(record.timestamp).toISOString();
            time.textContent = formatRelativeTime(record.timestamp);

            li.append(origin, amount, time);
            historyList.appendChild(li);
          }
        }
      }
    } catch {
      // History fetch failed silently -- non-critical
    }
  }

  async function loadPageState(): Promise<void> {
    try {
      // Get active tab ID to query its page state
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;

      if (!tabId) {
        pageStatus.textContent = 'No active tab.';
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'GET_PAGE_STATE',
        tabId,
      });

      if (response.success && response.detected) {
        const origin = response.origin as string;
        const price = response.price as string;
        pageStatus.textContent = `Paperwall detected on ${origin} -- $${formatUsdcFromString(price)}`;
        pageStatus.className = 'page-status page-status--detected';
      } else {
        pageStatus.textContent = 'No Paperwall content detected.';
        pageStatus.className = 'page-status';
      }
    } catch {
      // Page state fetch failed silently
    }
  }

  // Copy address handler
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(address);
      copyFeedback.textContent = 'Copied!';
      setTimeout(() => {
        copyFeedback.textContent = '';
      }, 2000);
    } catch {
      copyFeedback.textContent = 'Failed to copy.';
    }
  });

  // Refresh balance handler
  refreshButton.addEventListener('click', () => {
    loadBalance();
  });

  // Initial data load
  loadBalance();
  loadHistory();
  loadPageState();
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
