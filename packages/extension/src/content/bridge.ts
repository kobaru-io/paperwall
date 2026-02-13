// ── Content Script Message Bridge ─────────────────────────────────
// Bridges window.postMessage (SDK) <-> chrome.runtime.sendMessage (SW)
//
// SDK posts PAPERWALL_PAYMENT_REQUIRED → bridge relays as PAGE_HAS_PAPERWALL to SW
// SW sends response → bridge posts PAPERWALL_PAYMENT_RESULT back to page
// SDK posts PAPERWALL_PING → bridge immediately posts PAPERWALL_PONG (no SW)

const PAPERWALL_PREFIX = 'PAPERWALL_';

let windowListener: ((event: MessageEvent) => void) | null = null;
let runtimeListener: ((
  message: unknown,
  sender: chrome.runtime.MessageSender,
) => void) | null = null;

/**
 * Initializes the content script message bridge.
 * Listens for SDK postMessage events and relays to/from the service worker.
 */
export function initBridge(): void {
  // Clean up any previous bridge
  destroyBridge();

  const pageOrigin = window.location.origin;

  // FIX CRITICAL-1: Listen for payment results from service worker
  const runtimeHandler = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ): void => {
    if (!message || typeof message !== 'object') return;
    const msg = message as Record<string, unknown>;

    // Relay PAYMENT_COMPLETE messages to the SDK
    if (msg.type === 'PAYMENT_COMPLETE') {
      window.postMessage(
        {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: msg.requestId,
          success: msg.success,
          receipt: msg.receipt,
          error: msg.error,
        },
        window.location.origin,
      );
    }
  };

  runtimeListener = runtimeHandler;
  chrome.runtime.onMessage.addListener(runtimeHandler);

  const handler = (event: MessageEvent): void => {
    // Only accept messages from the same origin (same page).
    // Reject about:blank, null origins, and sandboxed iframes for security.
    if (
      !pageOrigin ||
      pageOrigin === 'null' ||
      pageOrigin === '' ||
      pageOrigin.startsWith('about:')
    ) {
      // No valid origin context - reject all postMessage
      return;
    }

    if (event.origin !== pageOrigin) {
      return;
    }

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    const type = data.type as string | undefined;
    if (!type || !type.startsWith(PAPERWALL_PREFIX)) return;

    // Handle PING immediately without contacting SW
    if (type === 'PAPERWALL_PING') {
      window.postMessage({ type: 'PAPERWALL_PONG' }, window.location.origin);
      return;
    }

    // Relay PAPERWALL_PAYMENT_REQUIRED to service worker
    if (type === 'PAPERWALL_PAYMENT_REQUIRED') {
      const message = {
        type: 'PAGE_HAS_PAPERWALL',
        requestId: data.requestId,
        facilitatorUrl: data.facilitatorUrl,
        payTo: data.payTo,
        price: data.price,
        network: data.network,
        mode: data.mode,
        siteKey: data.siteKey,
        signal: data.signal, // FIX CRITICAL-2: Include signal field
        origin: window.location.origin,
        url: window.location.href,
      };

      // FIX CRITICAL-1: Don't relay the registration ack as PAPERWALL_PAYMENT_RESULT
      // The actual payment result will come later via chrome.runtime.onMessage
      chrome.runtime.sendMessage(message);
    }
  };

  windowListener = handler;
  window.addEventListener('message', handler);
}

/**
 * Tears down the bridge, removing all event listeners.
 */
export function destroyBridge(): void {
  if (windowListener) {
    window.removeEventListener('message', windowListener);
    windowListener = null;
  }
  if (runtimeListener) {
    chrome.runtime.onMessage.removeListener(runtimeListener);
    runtimeListener = null;
  }
}
