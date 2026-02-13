import { registerMessageRouter } from './message-router.js';

// Set session storage access level to TRUSTED_CONTEXTS (service worker + popup only)
// This prevents content scripts from reading the decrypted private key
chrome.storage.session.setAccessLevel?.({
  accessLevel: 'TRUSTED_CONTEXTS'
}).catch(() => {
  // setAccessLevel may not be available in older Chrome versions, fail silently
});

registerMessageRouter();
