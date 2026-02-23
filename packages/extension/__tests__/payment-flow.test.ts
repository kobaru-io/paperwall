import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    clear: vi.fn(async () => { store = {}; }),
    _getStore: () => store,
    _reset: () => { store = {}; },
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

const setBadgeTextMock = vi.fn();
const setBadgeBackgroundColorMock = vi.fn();
const sendMessageToTabMock = vi.fn().mockResolvedValue(undefined);
const tabsOnRemovedListeners: Array<(tabId: number) => void> = [];

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
  tabs: {
    sendMessage: sendMessageToTabMock,
    onRemoved: {
      addListener: vi.fn((listener: (tabId: number) => void) => {
        tabsOnRemovedListeners.push(listener);
      }),
    },
  },
  action: {
    setBadgeText: setBadgeTextMock,
    setBadgeBackgroundColor: setBadgeBackgroundColorMock,
  },
});

// ── Module Mocks ────────────────────────────────────────────────────

vi.mock('../src/background/facilitator.js', () => ({
  getSupported: vi.fn(),
  settle: vi.fn(),
  verify: vi.fn(),
  clearSupportedCache: vi.fn(),
}));

vi.mock('../src/background/balance.js', () => ({
  fetchBalance: vi.fn(),
  clearBalanceCache: vi.fn(),
}));

vi.mock('../src/background/payment-client.js', () => ({
  initializePaymentClient: vi.fn(),
  createSignedPayload: vi.fn(),
  getPaymentClient: vi.fn(),
  clearPaymentClient: vi.fn(),
}));

vi.mock('../src/background/history.js', () => ({
  addPayment: vi.fn(),
  getHistory: vi.fn(),
  updatePaymentStatus: vi.fn(),
}));

import { handleMessage } from '../src/background/message-router.js';
import { getSupported, settle, verify } from '../src/background/facilitator.js';
import { fetchBalance } from '../src/background/balance.js';
import { createSignedPayload } from '../src/background/payment-client.js';
import { addPayment, updatePaymentStatus } from '../src/background/history.js';

// ── Helpers ──────────────────────────────────────────────────────────

function sendMessage(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleMessage(
      message,
      { tab: { id: 1 }, url: 'chrome-extension://test-extension-id/popup.html' } as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function setupUnlockedWallet(): Promise<string> {
  // Create wallet
  const result = await sendMessage({
    type: 'CREATE_WALLET',
    password: 'test-pw-123',
  });
  return result.address as string;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('payment-flow', () => {
  beforeEach(() => {
    localStorageMock._reset();
    sessionStorageMock._reset();
    vi.clearAllMocks();
    // Reset mock implementations for module mocks (clearAllMocks doesn't reset implementations)
    vi.mocked(fetchBalance).mockReset();
    vi.mocked(getSupported).mockReset();
    vi.mocked(verify).mockReset();
    vi.mocked(settle).mockReset();
    vi.mocked(createSignedPayload).mockReset();
    vi.mocked(addPayment).mockReset();
    vi.mocked(updatePaymentStatus).mockReset();
    tabsOnRemovedListeners.length = 0;
  });

  describe('PAGE_HAS_PAPERWALL', () => {
    it('stores ActivePageState and sets badge to "$"', async () => {
      const response = await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      expect(response.success).toBe(true);
      expect(setBadgeTextMock).toHaveBeenCalledWith(
        expect.objectContaining({ text: '$' }),
      );
    });
  });

  describe('GET_PAGE_STATE', () => {
    it('returns page info with canAfford computed', async () => {
      // Set up page state first
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      // Set up wallet with balance
      await setupUnlockedWallet();

      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '50000',
        formatted: '0.05',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      const response = await sendMessage({
        type: 'GET_PAGE_STATE',
        tabId: 1,
      });

      expect(response.success).toBe(true);
      expect(response.detected).toBe(true);
      expect(response.origin).toBe('https://example.com');
      expect(response.price).toBe('10000');
    });
  });

  describe('SIGN_AND_PAY', () => {
    it('with sufficient balance: sign -> settle -> PaymentRecord created -> success', async () => {
      // Setup wallet
      await setupUnlockedWallet();

      // Setup page state
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      // Mock balance check - sufficient
      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '50000',
        formatted: '0.05',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      // Mock getSupported
      vi.mocked(getSupported).mockResolvedValueOnce({
        kinds: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:324705682',
          extra: {
            name: 'USD Coin',
            version: '2',
            chainId: 324705682,
            verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          },
        }],
        extensions: [],
        signers: {},
      });

      // Mock createSignedPayload (x402 library)
      vi.mocked(createSignedPayload).mockResolvedValueOnce({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: { name: 'USD Coin', version: '2' },
        },
        payload: {
          signature: '0xsignature',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      });

      // Mock verify
      vi.mocked(verify).mockResolvedValueOnce({ isValid: true });

      // Mock settle
      vi.mocked(settle).mockResolvedValueOnce({
        success: true,
        transaction: '0xtxhash123',
        network: 'eip155:324705682',
      });

      const response = await sendMessage({
        type: 'SIGN_AND_PAY',
        tabId: 1,
      });

      expect(response.success).toBe(true);
      expect(response.transaction).toBe('0xtxhash123');
      expect(vi.mocked(createSignedPayload)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(verify)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(settle)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(addPayment)).toHaveBeenCalledTimes(1);
    });

    it('with insufficient balance: immediate error (no sign, no settle)', async () => {
      await setupUnlockedWallet();

      // Setup page state
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '100000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '100000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      // Mock balance check - insufficient
      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '5000',
        formatted: '0.005',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      const response = await sendMessage({
        type: 'SIGN_AND_PAY',
        tabId: 1,
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Insufficient');
      expect(vi.mocked(createSignedPayload)).not.toHaveBeenCalled();
      expect(vi.mocked(settle)).not.toHaveBeenCalled();
    });

    it('with locked wallet: error "Wallet locked"', async () => {
      // Create wallet but lock it
      await setupUnlockedWallet();
      sessionStorageMock._reset(); // lock

      // Setup page state
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      const response = await sendMessage({
        type: 'SIGN_AND_PAY',
        tabId: 1,
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('locked');
    });

    it('when settle fails: error forwarded, no confirmed PaymentRecord', async () => {
      await setupUnlockedWallet();

      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      // Sufficient balance for payment
      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000',
        formatted: '0.50',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      vi.mocked(getSupported).mockResolvedValueOnce({
        kinds: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:324705682',
          extra: {
            name: 'USD Coin',
            version: '2',
          },
        }],
        extensions: [],
        signers: {},
      });

      vi.mocked(createSignedPayload).mockResolvedValueOnce({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: { name: 'USD Coin', version: '2' },
        },
        payload: {
          signature: '0xsignature',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      });

      vi.mocked(verify).mockResolvedValueOnce({ isValid: true });

      // Settle fails
      vi.mocked(settle).mockRejectedValueOnce(
        new Error('Settlement failed'),
      );

      const response = await sendMessage({
        type: 'SIGN_AND_PAY',
        tabId: 1,
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Settlement failed');

      // addPayment should be called with 'failed' status (or not called with 'confirmed')
      if (vi.mocked(addPayment).mock.calls.length > 0) {
        const record = vi.mocked(addPayment).mock.calls[0]![0];
        expect(record.status).not.toBe('confirmed');
      }
    });
  });

  describe('badge updates', () => {
    it('turns green on successful payment', async () => {
      await setupUnlockedWallet();

      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000',
        formatted: '0.50',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });
      vi.mocked(getSupported).mockResolvedValue({
        kinds: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:324705682',
          extra: {
            name: 'USD Coin',
            version: '2',
            chainId: 324705682,
            verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          },
        }],
        extensions: [],
        signers: {},
      });
      vi.mocked(createSignedPayload).mockResolvedValue({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: { name: 'USD Coin', version: '2' },
        },
        payload: {
          signature: '0xsignature',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      });
      vi.mocked(verify).mockResolvedValue({ isValid: true });
      vi.mocked(settle).mockResolvedValue({
        success: true,
        transaction: '0xtxhash',
        network: 'eip155:324705682',
      });

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      // Badge should have been set to green at some point
      const bgColorCalls = setBadgeBackgroundColorMock.mock.calls;
      const greenCall = bgColorCalls.find(
        (call) => call[0]?.color === '#00b894',
      );
      expect(greenCall).toBeDefined();
    });

    it('shows amber badge when wallet cannot afford page', async () => {
      await setupUnlockedWallet();

      // Mock balance check - insufficient for amber badge
      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '5000',
        formatted: '0.005',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      const bgColorCalls = setBadgeBackgroundColorMock.mock.calls;
      const amberCall = bgColorCalls.find(
        (call) => call[0]?.color === '#fdcb6e',
      );
      expect(amberCall).toBeDefined();
    });
  });

  describe('verify gate', () => {
    it('verify failure prevents settle', async () => {
      await setupUnlockedWallet();

      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000',
        formatted: '0.50',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });
      vi.mocked(getSupported).mockResolvedValueOnce({
        kinds: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:324705682',
          extra: {
            name: 'USD Coin',
            version: '2',
          },
        }],
        extensions: [],
        signers: {},
      });
      vi.mocked(createSignedPayload).mockResolvedValueOnce({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: { name: 'USD Coin', version: '2' },
        },
        payload: {
          signature: '0xsignature',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      });

      // Verify fails
      vi.mocked(verify).mockResolvedValueOnce({ isValid: false });

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(response.success).toBe(false);
      expect(response.error).toContain('verification failed');
      expect(vi.mocked(settle)).not.toHaveBeenCalled();
    });
  });

  describe('canAfford in GET_PAGE_STATE', () => {
    it('returns canAfford: true when balance is sufficient', async () => {
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      await setupUnlockedWallet();
      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '50000',
        formatted: '0.05',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      const response = await sendMessage({ type: 'GET_PAGE_STATE', tabId: 1 });
      expect(response.canAfford).toBe(true);
    });

    it('returns canAfford: false when balance is insufficient', async () => {
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '100000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '100000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      await setupUnlockedWallet();
      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '5000',
        formatted: '0.005',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      const response = await sendMessage({ type: 'GET_PAGE_STATE', tabId: 1 });
      expect(response.canAfford).toBe(false);
    });
  });

  describe('concurrent payment prevention', () => {
    it('rejects second SIGN_AND_PAY while first is in progress for same tab', async () => {
      await setupUnlockedWallet();

      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0xreceiver',
          }],
        },
      });

      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000',
        formatted: '0.50',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });
      vi.mocked(getSupported).mockResolvedValue({
        kinds: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:324705682',
          extra: { name: 'USD Coin', version: '2' },
        }],
        extensions: [],
        signers: {},
      });
      vi.mocked(createSignedPayload).mockResolvedValue({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: { name: 'USD Coin', version: '2' },
        },
        payload: {
          signature: '0xsignature',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      });
      vi.mocked(verify).mockResolvedValue({ isValid: true });

      // Make settle slow so the first payment is still in progress
      vi.mocked(settle).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          success: true,
          transaction: '0xtxhash',
          network: 'eip155:324705682',
        }), 100)),
      );

      // Fire both payments concurrently
      const [first, second] = await Promise.all([
        sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 }),
        sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 }),
      ]);

      // One should succeed, one should be rejected
      const results = [first, second];
      const succeeded = results.filter((r) => r.success === true);
      const rejected = results.filter((r) => r.success === false);

      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.error).toContain('Payment already in progress');
    });
  });

  describe('skip-verify', () => {
    async function setupPaymentMocks() {
      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000', formatted: '0.50', network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', fetchedAt: Date.now(),
      });
      vi.mocked(getSupported).mockResolvedValue({
        kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:324705682', extra: { name: 'USD Coin', version: '2' } }],
        extensions: [], signers: {},
      });
      vi.mocked(createSignedPayload).mockResolvedValue({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: { scheme: 'exact', network: 'eip155:324705682', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', amount: '10000', payTo: '0xreceiver', maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } },
        payload: { signature: '0xsig', authorization: { from: '0xsender', to: '0xreceiver', value: '10000', validAfter: '0', validBefore: '99999999', nonce: '0x1234' } },
      });
      vi.mocked(verify).mockResolvedValue({ isValid: true });
      vi.mocked(settle).mockResolvedValue({ success: true, transaction: '0xtxhash', network: 'eip155:324705682' });
    }

    async function setupPageState(overrides?: Record<string, unknown>) {
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{ scheme: 'exact', network: 'eip155:324705682', amount: '10000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0xreceiver' }],
        },
        ...overrides,
      });
    }

    it('should skip verify call when skipVerify setting is true', async () => {
      await setupUnlockedWallet();
      localStorageMock.set({ settings: { skipVerify: true } });
      await setupPageState();
      await setupPaymentMocks();

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });
      expect(response.success).toBe(true);
      expect(vi.mocked(verify)).not.toHaveBeenCalled();
      expect(vi.mocked(settle)).toHaveBeenCalled();
    });

    it('should call verify when skipVerify is false (default)', async () => {
      await setupUnlockedWallet();
      await setupPageState();
      await setupPaymentMocks();

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });
      expect(response.success).toBe(true);
      expect(vi.mocked(verify)).toHaveBeenCalled();
    });
  });

  describe('optimistic payment flow', () => {
    async function setupPaymentMocks(settleDelay?: number) {
      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000', formatted: '0.50', network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', fetchedAt: Date.now(),
      });
      vi.mocked(getSupported).mockResolvedValue({
        kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:324705682', extra: { name: 'USD Coin', version: '2' } }],
        extensions: [], signers: {},
      });
      vi.mocked(createSignedPayload).mockResolvedValue({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: { scheme: 'exact', network: 'eip155:324705682', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', amount: '10000', payTo: '0xreceiver', maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } },
        payload: { signature: '0xsig', authorization: { from: '0xsender', to: '0xreceiver', value: '10000', validAfter: '0', validBefore: '99999999', nonce: '0x1234' } },
      });
      vi.mocked(verify).mockResolvedValue({ isValid: true });
      if (settleDelay) {
        vi.mocked(settle).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true, transaction: '0xtxhash', network: 'eip155:324705682' }), settleDelay)));
      } else {
        vi.mocked(settle).mockResolvedValue({ success: true, transaction: '0xtxhash', network: 'eip155:324705682' });
      }
    }

    async function setupOptimisticPageState() {
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'true',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{ scheme: 'exact', network: 'eip155:324705682', amount: '10000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0xreceiver' }],
        },
      });
    }

    it('should send PAYMENT_OPTIMISTIC immediately and return optimistic result', async () => {
      await setupUnlockedWallet();
      await setupOptimisticPageState();
      await setupPaymentMocks();

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });
      expect(response.success).toBe(true);
      expect(response.optimistic).toBe(true);

      // PAYMENT_OPTIMISTIC should have been sent to the tab
      expect(sendMessageToTabMock).toHaveBeenCalledWith(1, expect.objectContaining({
        type: 'PAYMENT_OPTIMISTIC',
      }));
    });

    it('should write history as pending for optimistic flow', async () => {
      await setupUnlockedWallet();
      await setupOptimisticPageState();
      await setupPaymentMocks();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(vi.mocked(addPayment)).toHaveBeenCalledWith(expect.objectContaining({
        status: 'pending',
        txHash: '',
      }));
    });

    it('should send PAYMENT_CONFIRMED after settlement succeeds', async () => {
      await setupUnlockedWallet();
      await setupOptimisticPageState();
      await setupPaymentMocks();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      // Wait for background settlement
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sendMessageToTabMock).toHaveBeenCalledWith(1, expect.objectContaining({
        type: 'PAYMENT_CONFIRMED',
        receipt: expect.objectContaining({ txHash: '0xtxhash' }),
      }));
    });

    it('should send PAYMENT_SETTLE_FAILED on settlement failure', async () => {
      await setupUnlockedWallet();
      await setupOptimisticPageState();
      await setupPaymentMocks();
      vi.mocked(settle).mockRejectedValue(new Error('RPC timeout'));

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      // Wait for background settlement
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sendMessageToTabMock).toHaveBeenCalledWith(1, expect.objectContaining({
        type: 'PAYMENT_SETTLE_FAILED',
        error: expect.stringContaining('RPC timeout'),
      }));
    });

    it('should use non-optimistic flow when optimistic=false', async () => {
      await setupUnlockedWallet();

      // Page state with optimistic=false
      await sendMessage({
        type: 'PAGE_HAS_PAPERWALL',
        origin: 'https://example.com',
        url: 'https://example.com/article',
        facilitatorUrl: 'https://gateway.kobaru.io',
        price: '10000',
        network: 'eip155:324705682',
        mode: 'client',
        optimistic: 'false',
        signal: {
          x402Version: 2,
          resource: { url: 'https://example.com/article' },
          accepts: [{ scheme: 'exact', network: 'eip155:324705682', amount: '10000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0xreceiver' }],
        },
      });
      await setupPaymentMocks();

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });
      expect(response.success).toBe(true);
      expect(response.optimistic).toBeUndefined();

      // Should NOT have sent PAYMENT_OPTIMISTIC
      const optimisticCalls = sendMessageToTabMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as Record<string, unknown>)?.type === 'PAYMENT_OPTIMISTIC',
      );
      expect(optimisticCalls).toHaveLength(0);

      // Should have sent PAYMENT_COMPLETE
      expect(sendMessageToTabMock).toHaveBeenCalledWith(1, expect.objectContaining({
        type: 'PAYMENT_COMPLETE',
      }));
    });
  });

  describe('SIGN_ONLY stub', () => {
    it('returns not-yet-implemented error', async () => {
      const response = await sendMessage({ type: 'SIGN_ONLY' });
      expect(response.success).toBe(false);
      expect(response.error).toContain('not yet implemented');
    });
  });
});
