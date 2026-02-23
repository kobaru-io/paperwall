import { renderSetup } from './screens/setup.js';
import { renderUnlock } from './screens/unlock.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderPaymentPrompt } from './screens/payment.js';
import { renderHistoryFull } from './screens/history-full.js';
import { renderStats } from './screens/stats.js';
import { renderSettings } from './screens/settings.js';
import { renderTabBar, type TabName } from './components/tab-bar.js';
import { loadHistoryCache, clearHistoryCache } from './history-cache.js';

// ── Popup Router ────────────────────────────────────────────────────
// Routes to the correct screen based on wallet state and page context.

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  // Handle #tab= hash when opened as a full browser tab
  const hashMatch = window.location.hash.match(/^#tab=(\w+)$/);
  const hashTab = (hashMatch?.[1] as TabName | undefined) ?? 'dashboard';

  try {
    const state = await chrome.runtime.sendMessage({
      type: 'GET_WALLET_STATE',
    });

    if (!state.exists) {
      renderSetup(app, (address: string) => {
        clearHistoryCache();
        renderMainShell(app, address, 'dashboard');
      });
    } else if (!state.unlocked) {
      renderUnlock(app, async () => {
        const updated = await chrome.runtime.sendMessage({
          type: 'GET_WALLET_STATE',
        });
        clearHistoryCache();
        await showMainOrPayment(app, updated.address as string, hashTab);
      });
    } else {
      await showMainOrPayment(app, state.address as string, hashTab);
    }
  } catch (err) {
    app.innerHTML = '';
    const errorMsg = document.createElement('p');
    errorMsg.className = 'field-error';
    errorMsg.setAttribute('role', 'alert');
    errorMsg.textContent =
      err instanceof Error ? err.message : 'Failed to load wallet state.';
    app.appendChild(errorMsg);
  }
}

async function showMainOrPayment(
  app: HTMLElement,
  address: string,
  initialTab: TabName,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id ?? 0;
    const pageState = await chrome.runtime.sendMessage({ type: 'GET_PAGE_STATE', tabId });

    if (pageState.success && pageState.detected) {
      renderPaymentPrompt(
        app,
        {
          origin: pageState.origin as string,
          price: pageState.price as string,
          network: pageState.network as string,
          facilitatorUrl: pageState.facilitatorUrl as string,
        },
        () => renderMainShell(app, address, 'dashboard'),
      );
    } else {
      await renderMainShell(app, address, initialTab);
    }
  } catch {
    await renderMainShell(app, address, initialTab);
  }
}

async function renderMainShell(
  app: HTMLElement,
  address: string,
  initialTab: TabName,
): Promise<void> {
  // Restore last active tab from session storage, prefer hash param
  const stored = await chrome.storage.session.get('activeTab');
  const activeTab: TabName =
    initialTab !== 'dashboard'
      ? initialTab
      : ((stored['activeTab'] as TabName | undefined) ?? 'dashboard');

  // Pre-load history cache for History + Stats tabs
  const records = await loadHistoryCache();

  app.innerHTML = '';

  // Tab bar container (fixed at top)
  const tabBarContainer = document.createElement('div');
  tabBarContainer.className = 'tab-bar-container';

  // Content area
  const content = document.createElement('div');
  content.className = 'tab-content';
  content.id = 'tab-content';

  app.appendChild(tabBarContainer);
  app.appendChild(content);

  function switchTab(tab: TabName): void {
    void chrome.storage.session.set({ activeTab: tab });
    renderTabBar(tabBarContainer, tab, switchTab);
    content.innerHTML = '';
    switch (tab) {
      case 'dashboard':
        renderDashboard(content, address, () => switchTab('history'));
        break;
      case 'history':
        renderHistoryFull(content, records);
        break;
      case 'stats':
        renderStats(content, records);
        break;
      case 'settings':
        renderSettings(content, address);
        break;
    }
  }

  switchTab(activeTab);
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
