import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMessage } from '../src/background/message-router.js';

// ── Chrome API Mocks ────────────────────────────────────────────────

type StorageData = Record<string, unknown>;

function createStorageMock() {
  let store: StorageData = {};
  return {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (!keys || keys === null) return { ...store };
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      const result: StorageData = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (items: StorageData) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = typeof keys === 'string' ? [keys] : keys;
      for (const k of arr) delete store[k];
    }),
    clear: vi.fn(async () => {
      store = {};
    }),
    _getStore: () => store,
    _reset: () => { store = {}; },
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

vi.stubGlobal('chrome', {
  storage: {
    local: localStorageMock,
    session: sessionStorageMock,
  },
  runtime: {
    id: 'test-extension-id',
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

beforeEach(() => {
  localStorageMock._reset();
  sessionStorageMock._reset();
  vi.clearAllMocks();
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
  });

  describe('unknown message type', () => {
    it('returns error for unknown type', async () => {
      const response = await sendMessage({ type: 'NONEXISTENT_ACTION' });
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown');
    });
  });
});
