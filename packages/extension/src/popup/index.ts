import { renderSetup } from './screens/setup.js';
import { renderUnlock } from './screens/unlock.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderPaymentPrompt } from './screens/payment.js';

// ── Popup Router ────────────────────────────────────────────────────
// Routes to the correct screen based on wallet state and page context.

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  try {
    const state = await chrome.runtime.sendMessage({
      type: 'GET_WALLET_STATE',
    });

    if (!state.exists) {
      renderSetup(app, (address: string) => {
        renderDashboard(app, address);
      });
    } else if (!state.unlocked) {
      renderUnlock(app, async () => {
        // After unlock, get full state and render dashboard
        const updated = await chrome.runtime.sendMessage({
          type: 'GET_WALLET_STATE',
        });
        await showDashboardOrPayment(app, updated.address as string);
      });
    } else {
      await showDashboardOrPayment(app, state.address as string);
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

/**
 * Shows the payment prompt if the current tab has a Paperwall page detected,
 * otherwise shows the main dashboard.
 */
async function showDashboardOrPayment(
  app: HTMLElement,
  address: string,
): Promise<void> {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tabId = tab?.id ?? 0;

    const pageState = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_STATE',
      tabId,
    });

    if (pageState.success && pageState.detected) {
      renderPaymentPrompt(
        app,
        {
          origin: pageState.origin as string,
          price: pageState.price as string,
          network: pageState.network as string,
          facilitatorUrl: pageState.facilitatorUrl as string,
        },
        () => {
          // After payment or rejection, go back to dashboard
          renderDashboard(app, address);
        },
      );
    } else {
      renderDashboard(app, address);
    }
  } catch {
    // If page state check fails, just show dashboard
    renderDashboard(app, address);
  }
}

document.addEventListener('DOMContentLoaded', init);
