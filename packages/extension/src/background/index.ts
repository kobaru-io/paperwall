import { registerMessageRouter } from './message-router.js';

// Set session storage access level to TRUSTED_CONTEXTS (service worker + popup only)
// This prevents content scripts from reading the decrypted private key
// TODO(review): Firefox session storage isolation gap — decrypted private key in
// chrome.storage.session is readable by content scripts on Firefox (setAccessLevel
// API unavailable). Pre-existing platform limitation. Tier 1 trust model accepts this
// risk. Track as follow-up: consider clearing session cache between payments.
// Severity: Medium - security-reviewer, 2026-03-09
chrome.storage.session
  .setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  .catch(() => {
    // setAccessLevel is not supported on Firefox (no equivalent API exists).
    // On Firefox, session storage is accessible to content scripts by default.
    // The private key is still AES-256-GCM encrypted at rest in chrome.storage.local.
    console.warn('[paperwall] Session storage TRUSTED_CONTEXTS isolation unavailable on this browser. Private key session cache is accessible to content scripts.');
  });

registerMessageRouter();
