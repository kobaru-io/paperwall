import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../message-router.js';

// ── Chrome API Mocks ────────────────────────────────────────────────

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

function send(message: Record<string, unknown>, sender = EXT_SENDER): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleMessage(message, sender, (r: unknown) => resolve(r as Record<string, unknown>));
  });
}

async function createTestWallet(password = 'test-pw-123'): Promise<string> {
  const res = await send({ type: 'CREATE_WALLET', password });
  return res.address as string;
}

beforeEach(() => {
  localMock._reset();
  sessionMock._reset();
  vi.clearAllMocks();
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
    expect(res.error).toBe('Wrong password');
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
