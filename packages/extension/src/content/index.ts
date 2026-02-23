import { scanForPaperwall, observeForPaperwall } from './detector.js';
import { initBridge } from './bridge.js';
import type { DetectedPage } from './detector.js';

// ── Content Script Entry Point ───────────────────────────────────

function handleDetection(detected: DetectedPage): void {
  // Extract first offer — skip if accepts is empty (no valid payment options)
  const offer = detected.signal.accepts[0];
  if (!offer) return;

  const price = offer.amount;
  const network = offer.network;

  // Notify the service worker about the detected Paperwall page
  chrome.runtime.sendMessage({
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
  });
}

// Initialize bridge for SDK <-> SW messaging
initBridge();

// Scan immediately for existing meta tags
const existing = scanForPaperwall();
if (existing) {
  handleDetection(existing);
}

// Observe for dynamically added meta tags
observeForPaperwall((detected) => {
  handleDetection(detected);
});
