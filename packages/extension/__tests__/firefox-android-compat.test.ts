/**
 * Firefox Android Compatibility Regression Suite
 *
 * These tests guard against regressions in behaviors critical for Firefox Android
 * support. Do not remove without understanding the Firefox Android compat
 * requirements in docs/pre-dev/firefox-android/.
 *
 * Key differences on Firefox Android vs desktop Chrome:
 *   - chrome.action.setBadgeText / setBadgeBackgroundColor are unsupported and throw
 *   - The event page can be killed by the OS and restarted at any time
 *   - Multiple messages can arrive concurrently before any handler completes
 *   - The popup runs in a real viewport (not a fixed-size Chrome popup)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMessage, _resetBruteForceStateForTest } from '../src/background/message-router.js';
import { _resetRateLimiterForTest } from '../src/background/auto-pay-rules.js';
import { createStorageMock } from './helpers/storage-mock.js';
import fs from 'fs';
import path from 'path';

// ── Chrome API Mocks ────────────────────────────────────────────────

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

vi.stubGlobal('chrome', {
  storage: {
    local: localStorageMock,
    session: sessionStorageMock,
  },
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    onMessage: { addListener: vi.fn() },
    lastError: null,
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  tabs: {
    onRemoved: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
});

beforeEach(async () => {
  localStorageMock._reset();
  sessionStorageMock._reset();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // Restore getURL implementation after clearAllMocks wipes it
  vi.mocked(chrome.runtime.getURL).mockImplementation((p: string) =>
    `chrome-extension://test-extension-id/${p}`
  );
  await _resetBruteForceStateForTest();
  _resetRateLimiterForTest();
});

// ── Helpers ─────────────────────────────────────────────────────────

function sendMessage(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleMessage(
      message as chrome.runtime.MessageEvent,
      { url: 'chrome-extension://test-extension-id/popup.html' } as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

function sendFromContentScript(
  message: Record<string, unknown>,
  sender: Partial<chrome.runtime.MessageSender>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleMessage(
      message as chrome.runtime.MessageEvent,
      sender as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Firefox Android Compatibility', () => {

  // ── Group 1: Badge API Resilience ─────────────────────────────────
  describe('Badge API Resilience', () => {
    // Firefox Android specific: chrome.action.setBadgeText and
    // setBadgeBackgroundColor are not supported on Firefox Android.
    // The extension must degrade gracefully instead of crashing.

    beforeEach(async () => {
      localStorageMock._reset();
      sessionStorageMock._reset();
      await _resetBruteForceStateForTest();
    });

    it('setBadgeText throws -> handler does not propagate the error', async () => {
      // Firefox Android specific: setBadgeText throws because the API
      // does not exist. The handler must catch this and warn, not crash.
      vi.mocked(chrome.action.setBadgeText).mockImplementation(() => {
        throw new Error('Badge API not supported');
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock fetch for balance check in PAGE_HAS_PAPERWALL handler
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const response = await sendFromContentScript(
        {
          type: 'PAGE_HAS_PAPERWALL',
          origin: 'https://example.com',
          url: 'https://example.com/article',
          facilitatorUrl: 'https://gateway.kobaru.io',
          price: '100000',
          network: 'eip155:324705682',
          signal: {
            x402Version: 1,
            resource: { url: 'https://example.com/article' },
            accepts: [{ scheme: 'exact', network: 'eip155:324705682', amount: '100000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0x0000000000000000000000000000000000000001' }],
          },
        },
        { tab: { id: 1, url: 'https://example.com/article' } } as Partial<chrome.runtime.MessageSender>,
      );

      expect(response.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Badge API unavailable'),
        expect.any(Error),
      );

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('setBadgeBackgroundColor throws -> setBadgeText still executes independently', async () => {
      // Firefox Android specific: color API may throw independently of text API.
      // Both calls are wrapped in separate try/catch blocks so one failure
      // does not prevent the other from executing.
      vi.mocked(chrome.action.setBadgeBackgroundColor).mockImplementation(() => {
        throw new Error('Color API not supported');
      });
      // setBadgeText should NOT throw — it's a spy that records calls
      vi.mocked(chrome.action.setBadgeText).mockImplementation(() => {});

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const response = await sendFromContentScript(
        {
          type: 'PAGE_HAS_PAPERWALL',
          origin: 'https://example.com',
          url: 'https://example.com/article',
          facilitatorUrl: 'https://gateway.kobaru.io',
          price: '100000',
          network: 'eip155:324705682',
          signal: {
            x402Version: 1,
            resource: { url: 'https://example.com/article' },
            accepts: [{ scheme: 'exact', network: 'eip155:324705682', amount: '100000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0x0000000000000000000000000000000000000001' }],
          },
        },
        { tab: { id: 2, url: 'https://example.com/article' } } as Partial<chrome.runtime.MessageSender>,
      );

      expect(response.success).toBe(true);
      // setBadgeText was called (text was set despite color failing)
      expect(chrome.action.setBadgeText).toHaveBeenCalled();
      // console.warn was called for the color failure
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Badge API unavailable'),
        expect.any(Error),
      );

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('both badge APIs throw -> handler returns a valid response', async () => {
      // Firefox Android specific: both badge APIs may be entirely absent.
      // The handler must still succeed — badge display is cosmetic, not functional.
      vi.mocked(chrome.action.setBadgeText).mockImplementation(() => {
        throw new Error('Badge API not supported');
      });
      vi.mocked(chrome.action.setBadgeBackgroundColor).mockImplementation(() => {
        throw new Error('Badge API not supported');
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));

      const response = await sendFromContentScript(
        {
          type: 'PAGE_HAS_PAPERWALL',
          origin: 'https://example.com',
          url: 'https://example.com/article',
          facilitatorUrl: 'https://gateway.kobaru.io',
          price: '100000',
          network: 'eip155:324705682',
          signal: {
            x402Version: 1,
            resource: { url: 'https://example.com/article' },
            accepts: [{ scheme: 'exact', network: 'eip155:324705682', amount: '100000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0x0000000000000000000000000000000000000001' }],
          },
        },
        { tab: { id: 3, url: 'https://example.com/article' } } as Partial<chrome.runtime.MessageSender>,
      );

      // Handler still succeeds (badge failure is non-fatal)
      expect(response.success).toBe(true);

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  // ── Group 2: Brute-Force State Persistence ────────────────────────
  describe('Brute-Force State Persistence (chrome.storage.session)', () => {
    // Firefox Android specific: the event page can be killed and
    // restarted by the OS at any time. Brute-force state must survive
    // this because it is stored in chrome.storage.session, not in
    // module-level variables.

    beforeEach(async () => {
      await _resetBruteForceStateForTest();
      localStorageMock._reset();
      sessionStorageMock._reset();
    });

    it('brute-force counter persists in storage (survives simulated restart)', async () => {
      // Firefox Android specific: after 3 failed attempts, the event page
      // is killed. On restart the counter must continue from 3, not 0.
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      }

      // Simulate SW restart: reset module-level state but keep session storage
      // _resetBruteForceStateForTest resets the session storage too, so we need
      // to manually preserve and restore the brute-force state
      const storeBeforeRestart = sessionStorageMock._getStore();
      const attempts = storeBeforeRestart['unlockAttempts'];
      const lockedUntil = storeBeforeRestart['lockedUntil'];

      await _resetBruteForceStateForTest();

      // Restore session storage as if the OS kept it (simulating SW restart,
      // not a full extension restart)
      await sessionStorageMock.set({ unlockAttempts: attempts, lockedUntil: lockedUntil });

      // Clear privateKey from session to simulate locked state post-restart
      await sessionStorageMock.remove('privateKey');

      // 4th attempt — counter should continue from 3
      const r4 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      expect(r4.success).toBe(false);
      expect(r4.error).toContain('1 attempt remaining');
    });

    it('lockout persists in storage (locked state survives simulated restart)', async () => {
      // Firefox Android specific: if the user triggers lockout and then the
      // event page is killed, the lockout must still be enforced after restart.
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // Trigger lockout (5 failed attempts)
      for (let i = 0; i < 5; i++) {
        await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      }

      // Simulate SW restart: reset module state, keep session storage with lockout
      const lockedUntilValue = sessionStorageMock._getStore()['lockedUntil'];
      expect(typeof lockedUntilValue).toBe('number');
      expect(lockedUntilValue as number).toBeGreaterThan(Date.now());

      await _resetBruteForceStateForTest();

      // Restore locked state as if OS preserved session storage
      await sessionStorageMock.set({ unlockAttempts: 0, lockedUntil: Date.now() + 300000 });

      // Re-store the wallet in local storage (it was preserved through restart)
      // Actually local storage was not reset — only session was touched by
      // _resetBruteForceStateForTest. But privateKey is gone (session cleared).

      // Try unlocking with correct password — should still be locked
      const response = await sendMessage({ type: 'UNLOCK_WALLET', password: 'correct-pw' });
      expect(response.success).toBe(false);
      expect(response.error).toContain('Too many attempts');
    });
  });

  // ── Group 3: Concurrent Unlock Prevention ─────────────────────────
  describe('Concurrent Unlock Prevention (unlockInProgress mutex)', () => {
    // Firefox Android specific: the message passing layer can dispatch
    // multiple concurrent messages before any handler completes. The
    // unlockInProgress mutex prevents double-processing.

    beforeEach(async () => {
      await _resetBruteForceStateForTest();
      localStorageMock._reset();
      sessionStorageMock._reset();
    });

    it('concurrent unlock attempts are rejected while one is in progress', async () => {
      // Firefox Android specific: two UNLOCK_WALLET messages arrive
      // simultaneously. The second must be rejected with "in progress".
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // Fire two unlock attempts simultaneously
      const [r1, r2] = await Promise.all([
        sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong-pw' }),
        sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong-pw' }),
      ]);

      // One should fail with "in progress", the other with "Incorrect password"
      const responses = [r1, r2];
      const inProgressResponse = responses.find(r => typeof r.error === 'string' && (r.error as string).includes('in progress'));
      const passwordResponse = responses.find(r => typeof r.error === 'string' && (r.error as string).includes('Incorrect password'));

      expect(inProgressResponse).toBeDefined();
      expect(passwordResponse).toBeDefined();
    });

    it('after unlock completes, mutex is released (next unlock can proceed)', async () => {
      // Firefox Android specific: verify the finally block correctly
      // releases the mutex so subsequent unlock attempts are not blocked.
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // First unlock — succeeds
      const r1 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'correct-pw' });
      expect(r1.success).toBe(true);

      // Clear session to re-lock
      sessionStorageMock._reset();
      // Restore wallet state but not privateKey
      await _resetBruteForceStateForTest();

      // Second unlock — should also succeed (mutex was released in finally block)
      const r2 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'correct-pw' });
      expect(r2.success).toBe(true);
    });
  });

  // ── Group 4: Popup Viewport and CSS ───────────────────────────────
  describe('Popup Viewport and CSS', () => {
    // Firefox Android specific: the popup renders inside a real mobile
    // viewport. A hardcoded width=360 would prevent the popup from
    // adapting to different screen sizes.

    const extensionRoot = path.resolve(__dirname, '..');

    it('popup/index.html contains device-width viewport meta', () => {
      // Firefox Android specific: width=device-width allows the popup
      // to adapt to the actual screen size rather than being forced to 360px.
      const html = fs.readFileSync(
        path.join(extensionRoot, 'src/popup/index.html'),
        'utf-8',
      );

      expect(html).toContain('width=device-width');
      expect(html).not.toContain('width=360');
    });

    it('popup/styles.css uses max-width (not fixed width) for body', () => {
      // Firefox Android specific: max-width: 360px + width: 100% allows
      // the popup to shrink on narrower screens while capping at 360px
      // on desktop. A fixed width: 360px would overflow on small phones.
      const css = fs.readFileSync(
        path.join(extensionRoot, 'src/popup/styles.css'),
        'utf-8',
      );

      expect(css).toContain('max-width: 360px');
      expect(css).toContain('width: 100%');
      // Must not contain "width: 360px" as a standalone rule (fixed width)
      // but "max-width: 360px" is fine — so we use a negative lookbehind
      expect(css).not.toMatch(/(?<![-\w])width:\s*360px/);
    });
  });

  // ── Group 5: Build Configuration Guards ───────────────────────────
  describe('Build Configuration Guards', () => {
    // Firefox Android specific: the esbuild target must include firefox140
    // (or higher) to ensure compatibility with Firefox Android's JS engine.

    const extensionRoot = path.resolve(__dirname, '..');

    it('build.ts targets Firefox 140 or higher', () => {
      // Firefox Android specific: firefox121 was the old target that
      // lacked support for several APIs used by the extension. firefox140
      // is the minimum required for full compatibility.
      const buildSource = fs.readFileSync(
        path.join(extensionRoot, 'build.ts'),
        'utf-8',
      );

      expect(buildSource).not.toContain('firefox121');
      // Must contain firefox140 or a higher version number
      const firefoxTargetMatch = buildSource.match(/firefox(\d+)/g);
      expect(firefoxTargetMatch).not.toBeNull();
      // All firefox target numbers should be >= 140
      for (const match of firefoxTargetMatch!) {
        const version = parseInt(match.replace('firefox', ''), 10);
        expect(version).toBeGreaterThanOrEqual(140);
      }
    });

    it('package.json has lint:firefox script', () => {
      // Firefox Android specific: web-ext lint validates the manifest
      // and extension structure against Firefox/AMO requirements.
      const pkgJson = JSON.parse(
        fs.readFileSync(
          path.join(extensionRoot, 'package.json'),
          'utf-8',
        ),
      ) as Record<string, Record<string, string>>;

      expect(pkgJson['scripts']?.['lint:firefox']).toBeDefined();
      expect(pkgJson['scripts']?.['lint:firefox']).toContain('web-ext lint');
      expect(pkgJson['devDependencies']?.['web-ext']).toBeDefined();
    });
  });
});
