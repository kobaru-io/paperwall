import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMessage, _resetBruteForceStateForTest } from '../src/background/message-router.js';
import { createStorageMock } from './helpers/storage-mock.js';

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
  },
});

beforeEach(async () => {
  localStorageMock._reset();
  sessionStorageMock._reset();
  vi.clearAllMocks();
  // Restore getURL implementation after clearAllMocks wipes it
  vi.mocked(chrome.runtime.getURL).mockImplementation((path: string) =>
    `chrome-extension://test-extension-id/${path}`
  );
  // Reset brute-force state to prevent leakage between describe blocks
  await _resetBruteForceStateForTest();
});

// ── Helper ──────────────────────────────────────────────────────────

function sendMessage(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleMessage(
      message as chrome.runtime.MessageEvent,
      { url: 'chrome-extension://test-extension-id/popup.html' } as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('message-router', () => {
  describe('CREATE_WALLET', () => {
    it('generates key, encrypts, stores in local and session, returns address', async () => {
      const response = await sendMessage({
        type: 'CREATE_WALLET',
        password: 'test-password-123',
      });

      expect(response.success).toBe(true);
      expect(response.address).toBeDefined();
      expect(typeof response.address).toBe('string');
      expect((response.address as string)).toMatch(/^0x[0-9a-fA-F]{40}$/);

      // Verify local storage has wallet data
      const localData = localStorageMock._getStore();
      expect(localData['wallet']).toBeDefined();
      const wallet = localData['wallet'] as Record<string, unknown>;
      expect(wallet.address).toBe(response.address);
      expect(wallet.encryptedKey).toBeDefined();
      expect(wallet.keySalt).toBeDefined();
      expect(wallet.keyIv).toBeDefined();

      // Verify session storage has decrypted key
      const sessionData = sessionStorageMock._getStore();
      expect(sessionData['privateKey']).toBeDefined();
      expect(typeof sessionData['privateKey']).toBe('string');
    });
  });

  describe('GET_WALLET_STATE', () => {
    it('with no wallet returns { exists: false, unlocked: false }', async () => {
      const response = await sendMessage({ type: 'GET_WALLET_STATE' });
      expect(response.exists).toBe(false);
      expect(response.unlocked).toBe(false);
    });

    it('with wallet but no session returns { exists: true, unlocked: false, address }', async () => {
      // Create wallet first
      const createResult = await sendMessage({
        type: 'CREATE_WALLET',
        password: 'pw',
      });
      const address = createResult.address;

      // Clear session to simulate locked state
      sessionStorageMock._reset();

      const response = await sendMessage({ type: 'GET_WALLET_STATE' });
      expect(response.exists).toBe(true);
      expect(response.unlocked).toBe(false);
      expect(response.address).toBe(address);
    });

    it('with wallet + session returns { exists: true, unlocked: true, address }', async () => {
      const createResult = await sendMessage({
        type: 'CREATE_WALLET',
        password: 'pw',
      });

      const response = await sendMessage({ type: 'GET_WALLET_STATE' });
      expect(response.exists).toBe(true);
      expect(response.unlocked).toBe(true);
      expect(response.address).toBe(createResult.address);
    });

    it('with null wallet value in storage returns { exists: false, unlocked: false }', async () => {
      // Simulate storage returning { wallet: null } (corrupted or cleared entry)
      await localStorageMock.set({ wallet: null });
      const response = await sendMessage({ type: 'GET_WALLET_STATE' });
      expect(response.exists).toBe(false);
      expect(response.unlocked).toBe(false);
    });
  });

  describe('UNLOCK_WALLET', () => {
    it('correct password returns { success: true } and stores key in session', async () => {
      await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });

      // Clear session to simulate locked state
      sessionStorageMock._reset();

      const response = await sendMessage({
        type: 'UNLOCK_WALLET',
        password: 'correct-pw',
      });

      expect(response.success).toBe(true);

      // Verify session has key again
      const sessionData = sessionStorageMock._getStore();
      expect(sessionData['privateKey']).toBeDefined();
    });

    it('wrong password returns { success: false, error }', async () => {
      await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      sessionStorageMock._reset();

      const response = await sendMessage({
        type: 'UNLOCK_WALLET',
        password: 'wrong-pw',
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Incorrect password');
    });

    it('with null wallet value in storage returns { success: false, error }', async () => {
      // Simulate storage returning { wallet: null } (no wallet set up)
      await localStorageMock.set({ wallet: null });
      const response = await sendMessage({
        type: 'UNLOCK_WALLET',
        password: 'any-password',
      });
      expect(response.success).toBe(false);
      expect(response.error).toContain('No wallet found');
    });
  });

  describe('GET_BALANCE', () => {
    it('returns balance data for unlocked wallet', async () => {
      const createResult = await sendMessage({
        type: 'CREATE_WALLET',
        password: 'pw',
      });

      // Mock fetch for RPC call
      const hexBalance = '0x' + (5_000_000).toString(16).padStart(64, '0');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const response = await sendMessage({ type: 'GET_BALANCE' });

      expect(response.success).toBe(true);
      expect(response.balance).toBeDefined();
      const balance = response.balance as Record<string, unknown>;
      expect(balance.formatted).toBe('5.00');
      expect(balance.asset).toBe('USDC');
    });

    it('returns error for locked wallet', async () => {
      await sendMessage({ type: 'CREATE_WALLET', password: 'pw' });
      sessionStorageMock._reset();

      const response = await sendMessage({ type: 'GET_BALANCE' });
      expect(response.success).toBe(false);
      expect(response.error).toContain('locked');
    });

    it('returns success: false and error message when wallet is locked', async () => {
      // Explicit check that both success and error fields are set correctly
      await sendMessage({ type: 'CREATE_WALLET', password: 'pw' });
      sessionStorageMock._reset();

      const response = await sendMessage({ type: 'GET_BALANCE' });
      expect(response.success).toBe(false);
      expect(typeof response.error).toBe('string');
      expect((response.error as string).length).toBeGreaterThan(0);
    });
  });

  describe('UNLOCK_WALLET brute-force lockout', () => {
    // Reset brute-force counter and clear all storage so each test starts
    // with a clean slate and can create its own wallet without collision.
    beforeEach(async () => {
      await _resetBruteForceStateForTest();
      localStorageMock._reset();
      sessionStorageMock._reset();
    });

    it('shows decreasing attempts remaining', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      const r1 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      expect(r1.error).toContain('4 attempts remaining');

      const r2 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      expect(r2.error).toContain('3 attempts remaining');

      const r3 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      expect(r3.error).toContain('2 attempts remaining');

      const r4 = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      expect(r4.error).toContain('1 attempt remaining');
    });

    it('locks wallet after 5 consecutive wrong password attempts', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // 4 wrong attempts — should get "N attempts remaining"
      for (let i = 0; i < 4; i++) {
        const r = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
        expect(r.success).toBe(false);
        expect(r.error).toContain('remaining');
      }

      // 5th wrong attempt triggers lockout
      const lockResponse = await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      expect(lockResponse.success).toBe(false);
      expect(lockResponse.error).toContain('locked for 5 minutes');
    });

    it('rejects correct password during lockout period', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong' });
      }

      // Correct password should still be rejected during lockout
      const response = await sendMessage({ type: 'UNLOCK_WALLET', password: 'correct-pw' });
      expect(response.success).toBe(false);
      expect(response.error).toContain('Too many attempts');
    });

    it('accepts correct password after lockout period expires', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // Trigger lockout with 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await sendMessage({ type: 'UNLOCK_WALLET', password: 'wrong-pw' });
      }

      // Directly reset the lockout (simulating time passage without wall-clock wait)
      await _resetBruteForceStateForTest();

      // Correct password must succeed after reset using this test's own wallet password
      const response = await sendMessage({ type: 'UNLOCK_WALLET', password: 'correct-pw' });
      expect(response.success).toBe(true);
    });
  });

  describe('UNLOCK_WALLET chrome.storage.session failure', () => {
    it('returns error when session.get rejects (storage unavailable)', async () => {
      await sendMessage({ type: 'CREATE_WALLET', password: 'pw' });
      sessionStorageMock._reset();

      // Simulate storage failure on session.get (e.g. Firefox Android memory pressure)
      vi.spyOn(sessionStorageMock, 'get').mockRejectedValueOnce(new Error('Storage unavailable'));

      const response = await sendMessage({ type: 'UNLOCK_WALLET', password: 'pw' });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe('string');
      expect((response.error as string).length).toBeGreaterThan(0);
    });

    it('returns error when session.set rejects (storage unavailable)', async () => {
      await sendMessage({ type: 'CREATE_WALLET', password: 'pw' });
      sessionStorageMock._reset();

      // Allow session.get to succeed (for brute-force state read) but fail on session.set
      // (which stores the decrypted private key after successful decrypt)
      vi.spyOn(sessionStorageMock, 'set').mockRejectedValueOnce(new Error('Storage unavailable'));

      const response = await sendMessage({ type: 'UNLOCK_WALLET', password: 'pw' });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe('string');
      expect((response.error as string).length).toBeGreaterThan(0);
    });
  });

  describe('EXPORT_PRIVATE_KEY brute-force lockout', () => {
    beforeEach(async () => {
      await _resetBruteForceStateForTest();
      localStorageMock._reset();
      sessionStorageMock._reset();
    });

    it('increments attempt counter on wrong password', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);

      const r1 = await sendMessage({ type: 'EXPORT_PRIVATE_KEY', password: 'wrong' });
      expect(r1.success).toBe(false);
      expect(r1.error).toContain('4 attempt');

      const r2 = await sendMessage({ type: 'EXPORT_PRIVATE_KEY', password: 'wrong' });
      expect(r2.success).toBe(false);
      expect(r2.error).toContain('3 attempt');
    });

    it('locks wallet after 5 consecutive failed export attempts', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);

      for (let i = 0; i < 4; i++) {
        const r = await sendMessage({ type: 'EXPORT_PRIVATE_KEY', password: 'wrong' });
        expect(r.success).toBe(false);
        expect(r.error).toContain('remaining');
      }

      // 5th wrong attempt triggers lockout
      const lockResponse = await sendMessage({ type: 'EXPORT_PRIVATE_KEY', password: 'wrong' });
      expect(lockResponse.success).toBe(false);
      expect(lockResponse.error).toContain('locked for 5 minutes');
    });

    it('export lockout also blocks UNLOCK_WALLET (shared counter)', async () => {
      const createResult = await sendMessage({ type: 'CREATE_WALLET', password: 'correct-pw' });
      expect(createResult.success).toBe(true);
      sessionStorageMock._reset();

      // Trigger lockout via EXPORT_PRIVATE_KEY
      for (let i = 0; i < 5; i++) {
        await sendMessage({ type: 'EXPORT_PRIVATE_KEY', password: 'wrong' });
      }

      // UNLOCK_WALLET should also be blocked by the shared lockout
      const unlockResponse = await sendMessage({ type: 'UNLOCK_WALLET', password: 'correct-pw' });
      expect(unlockResponse.success).toBe(false);
      expect(unlockResponse.error).toContain('Too many attempts');
    });
  });

  describe('unknown message type', () => {
    it('returns error for unknown type', async () => {
      const response = await sendMessage({ type: 'NONEXISTENT_ACTION' });
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown');
    });
  });

  describe('sender URL authorization', () => {
    function sendWithSender(
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

    it('accepts moz-extension:// sender when getURL returns moz-extension://', async () => {
      vi.mocked(chrome.runtime.getURL).mockImplementation(
        (path: string) => `moz-extension://test-uuid/${path}`,
      );
      // Create wallet using moz-extension sender so auth passes during setup too
      const createRes = await sendWithSender(
        { type: 'CREATE_WALLET', password: 'moz-pw' },
        { url: 'moz-extension://test-uuid/popup.html' },
      );
      expect(createRes.success).toBe(true);

      sessionStorageMock._reset();
      const unlockRes = await sendWithSender(
        { type: 'UNLOCK_WALLET', password: 'moz-pw' },
        { url: 'moz-extension://test-uuid/popup.html' },
      );
      expect(unlockRes.success).toBe(true);
    });

    it('rejects https:// sender for sensitive operations', async () => {
      const response = await sendWithSender(
        { type: 'UNLOCK_WALLET', password: 'any' },
        { url: 'https://evil.example.com/page' },
      );
      expect(response.success).toBe(false);
      expect(response.error).toBe('Unauthorized sender');
    });

    it('rejects sender with undefined URL for sensitive operations', async () => {
      const response = await sendWithSender(
        { type: 'UNLOCK_WALLET', password: 'any' },
        {},
      );
      expect(response.success).toBe(false);
      expect(response.error).toBe('Unauthorized sender');
    });

    it('rejects sender with empty string URL for sensitive operations', async () => {
      const response = await sendWithSender(
        { type: 'UNLOCK_WALLET', password: 'any' },
        { url: '' },
      );
      expect(response.success).toBe(false);
      expect(response.error).toBe('Unauthorized sender');
    });
  });
});
