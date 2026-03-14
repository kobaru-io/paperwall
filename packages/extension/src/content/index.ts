import { scanForPaperwall, observeForPaperwall } from './detector.js';
import { initBridge, destroyBridge } from './bridge.js';
import type { DetectedPage } from './detector.js';

// ── Content Script Entry Point ───────────────────────────────────

let stopObserving: (() => void) | null = null;

function handleDetection(detected: DetectedPage): void {
  if (window.location.protocol !== 'https:') return;

  // Extract first offer — skip if accepts is empty (no valid payment options)
  const offer = detected.signal.accepts[0];
  if (!offer) return;

  const price = offer.amount;
  const network = offer.network;

  // Notify the service worker about the detected Paperwall page
  chrome.runtime.sendMessage(
    {
      type: 'PAGE_HAS_PAPERWALL',
      facilitatorUrl: detected.facilitatorUrl,
      mode: detected.mode,
      siteKey: detected.siteKey,
      optimistic: detected.optimistic,
      signal: detected.signal,
      price, // Include price at top level
      network, // Include network at top level
      origin: window.location.origin,
      url: window.location.href,
    },
    (response: Record<string, unknown> | undefined) => {
      if (!response) return;

      if (response['blocked']) {
        // Site is denylisted: tear down bridge and stop observing.
        // Act as if the extension is not present.
        destroyBridge();
        if (stopObserving) {
          stopObserving();
          stopObserving = null;
        }
        return;
      }

      // If autoPaid, the service worker already handled payment and sent
      // PAYMENT_OPTIMISTIC to unlock content. No further action needed.
    },
  );
}

// Skip initialization entirely on non-HTTPS pages
if (window.location.protocol === 'https:') {
  // Initialize bridge for SDK <-> SW messaging
  initBridge();

  // Scan immediately for existing meta tags
  const existing = scanForPaperwall();
  if (existing) {
    handleDetection(existing);
  }

  // Observe for dynamically added meta tags
  stopObserving = observeForPaperwall((detected) => {
    handleDetection(detected);
  });
}
