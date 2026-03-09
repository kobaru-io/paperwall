import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../message-router.js';

// ── Chrome API Mocks ────────────────────────────────────────────────
// Note: createStorageMock is intentionally inlined here (not imported from
// __tests__/helpers/storage-mock.ts) because this file is under src/ and
// TypeScript's rootDir:src constraint prevents cross-directory imports.

type StorageData = Record<string, unknown>;

function createStorageMock() {
  let store: StorageData = {};
  return {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (!keys || keys === null) return { ...store };
      if (typeof keys === 'string') return keys in store ? { [keys]: store[keys] } : {};
      const result: StorageData = {};
      for (const k of keys) { if (k in store) result[k] = store[k]; }
      return result;
    }),
    set: vi.fn(async (items: StorageData) => { Object.assign(store, items); }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = typeof keys === 'string' ? [keys] : keys;
      for (const k of arr) delete store[k];
    }),
    clear: vi.fn(async () => { store = {}; }),
    _getStore: () => store,
    _reset: () => { store = {}; },
  };
}

const localMock = createStorageMock();
const sessionMock = createStorageMock();

vi.stubGlobal('chrome', {
  storage: { local: localMock, session: sessionMock },
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: null,
  },
  action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  tabs: { onRemoved: { addListener: vi.fn() }, sendMessage: vi.fn() },
});

// ── Helpers ──────────────────────────────────────────────────────────

const EXT_SENDER = { url: 'chrome-extension://test-extension-id/popup.html' } as chrome.runtime.MessageSender;
const EXT_SENDER_ALT = { url: 'chrome-extension://test-extension-id/options.html' } as chrome.runtime.MessageSender;
const EXT_SENDER_WRONG_ID = { url: 'chrome-extension://other-extension-id/popup.html' } as chrome.runtime.MessageSender;
const EXTERNAL_SENDER = { url: 'https://evil.com/page' } as chrome.runtime.MessageSender;
// TODO(review): NO_URL_SENDER is used in only one test; consider inlining if test count stays at 1.
// Severity: Low - ring:code-reviewer, 2026-03-09
const NO_URL_SENDER = {} as chrome.runtime.MessageSender;

function send(message: Record<string, unknown>, sender = EXT_SENDER): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleMessage(message, sender, (r: unknown) => resolve(r as Record<string, unknown>));
  });
}

async function createTestWallet(password = 'test-pw-123', sender = EXT_SENDER): Promise<string> {
  const res = await send({ type: 'CREATE_WALLET', password }, sender);
  if (!res.success) {
    throw new Error(`createTestWallet failed: ${res.error as string}`);
  }
  return res.address as string;
}

beforeEach(() => {
  localMock._reset();
  sessionMock._reset();
  vi.clearAllMocks();
  // Restore getURL default after clearAllMocks resets all mock implementations
  (chrome.runtime.getURL as ReturnType<typeof vi.fn>).mockImplementation(
    (path: string) => `chrome-extension://test-extension-id/${path}`,
  );
});

// ── EXPORT_PRIVATE_KEY ────────────────────────────────────────────────

describe('EXPORT_PRIVATE_KEY handler', () => {
  it('rejects requests from external origins', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'test' }, EXTERNAL_SENDER);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });

  it('rejects requests from a different extension id', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'test' }, EXT_SENDER_WRONG_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });

  it('rejects empty password', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: '' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid password');
  });

  it('rejects non-string password', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 123 });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid password');
  });

  it('returns error when no wallet exists', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'test' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('No wallet found');
  });

  it('returns private key for correct password', async () => {
    await createTestWallet('secure-password');
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'secure-password' });
    expect(res.success).toBe(true);
    expect(typeof res.privateKey).toBe('string');
    expect(res.privateKey as string).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('returns error for wrong password', async () => {
    await createTestWallet('correct-password');
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'wrong-password' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Wrong password');
  });

  it('accepts request from alternative extension page', async () => {
    await createTestWallet('pw');
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'pw' }, EXT_SENDER_ALT);
    expect(res.success).toBe(true);
  });
});

// ── IMPORT_PRIVATE_KEY ────────────────────────────────────────────────

describe('IMPORT_PRIVATE_KEY handler', () => {
  // Hardhat account #0 — well-known test key, not a funded production key
  const VALID_KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const VALID_KEY_0X = '0x' + VALID_KEY;

  it('rejects requests from external origins', async () => {
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: VALID_KEY_0X, password: 'pw' }, EXTERNAL_SENDER);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });

  it('rejects empty password', async () => {
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: VALID_KEY_0X, password: '' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid parameters');
  });

  it('rejects non-string privateKey', async () => {
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: 12345, password: 'pw' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid parameters');
  });

  it('rejects key shorter than 64 hex chars', async () => {
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: 'abcdef1234', password: 'pw' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid private key format');
  });

  it('rejects key with non-hex characters', async () => {
    const badKey = 'zz' + VALID_KEY.slice(2);
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: badKey, password: 'pw' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid private key format');
  });

  it('imports valid key without 0x prefix', async () => {
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: VALID_KEY, password: 'new-pw' });
    expect(res.success).toBe(true);
    expect(res.address as string).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const wallet = localMock._getStore()['wallet'] as Record<string, unknown>;
    expect(wallet.address).toBe(res.address);
  });

  it('imports valid key with 0x prefix', async () => {
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: VALID_KEY_0X, password: 'new-pw' });
    expect(res.success).toBe(true);
    expect(res.address as string).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('clears session private key after import (forces re-lock)', async () => {
    await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: VALID_KEY, password: 'pw' });
    expect(sessionMock._getStore()['privateKey']).toBeNull();
  });

  it('overwrites existing wallet on import', async () => {
    await createTestWallet('old-pw');
    const res = await send({ type: 'IMPORT_PRIVATE_KEY', privateKey: VALID_KEY, password: 'new-pw' });
    expect(res.success).toBe(true);
    const wallet = localMock._getStore()['wallet'] as Record<string, unknown>;
    expect(wallet.address).toBe(res.address);
  });
});

// ── Sender URL scheme verification ───────────────────────────────────

describe('sender URL scheme check (cross-browser)', () => {
  it('accepts a chrome-extension:// sender', async () => {
    // EXT_SENDER uses chrome-extension://test-extension-id/ which matches getURL('')
    await createTestWallet('pw');
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'pw' }, EXT_SENDER);
    expect(res.success).toBe(true);
  });

  it('accepts a moz-extension:// sender when getURL returns moz-extension://', async () => {
    // Switch the mock to simulate Firefox BEFORE creating the wallet so the
    // entire test runs under the Firefox scheme (including wallet creation auth).
    (chrome.runtime.getURL as ReturnType<typeof vi.fn>).mockImplementation(
      (path: string) => `moz-extension://test-extension-id/${path}`,
    );
    const mozSender = { url: 'moz-extension://test-extension-id/popup.html' } as chrome.runtime.MessageSender;
    await createTestWallet('pw', mozSender);
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'pw' }, mozSender);
    expect(res.success).toBe(true);
  });

  it('rejects an https:// sender for privileged operations', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'pw' }, EXTERNAL_SENDER);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });

  it('rejects a sender from a different extension id', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'pw' }, EXT_SENDER_WRONG_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });

  it('rejects a sender with no URL', async () => {
    const res = await send({ type: 'EXPORT_PRIVATE_KEY', password: 'pw' }, NO_URL_SENDER);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });

  it('rejects sender with empty string URL', async () => {
    const res = await send(
      { type: 'EXPORT_PRIVATE_KEY', password: 'test-pw-123' },
      { url: '' },
    );
    expect(res.success).toBe(false);
    expect(res.error).toBe('Unauthorized sender');
  });
});
