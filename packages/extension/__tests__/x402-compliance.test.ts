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
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onRemoved: { addListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
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
import { addPayment } from '../src/background/history.js';

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

async function setupUnlockedWallet(): Promise<string> {
  const result = await sendMessage({
    type: 'CREATE_WALLET',
    password: 'test-pw-123',
  });
  return result.address as string;
}

async function setupPaymentPage(): Promise<void> {
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
        maxTimeoutSeconds: 300,
        extra: {},
      }],
    },
  });
}

function mockSuccessfulPaymentFlow(): void {
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
    transaction: '0xabc123',
    network: 'eip155:324705682',
    payer: '0xsender',
  });
}

// ── x402 Compliance Tests ────────────────────────────────────────────

describe('x402 wire format compliance', () => {
  beforeEach(() => {
    localStorageMock._reset();
    sessionStorageMock._reset();
    vi.clearAllMocks();
    vi.mocked(fetchBalance).mockReset();
    vi.mocked(getSupported).mockReset();
    vi.mocked(verify).mockReset();
    vi.mocked(settle).mockReset();
    vi.mocked(createSignedPayload).mockReset();
    vi.mocked(addPayment).mockReset();
  });

  describe('verify() wire format', () => {
    it('calls verify with full PaymentPayload (x402Version, resource, accepted, payload)', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(vi.mocked(verify)).toHaveBeenCalledTimes(1);
      const [, , paymentPayload] = vi.mocked(verify).mock.calls[0]!;

      // Full x402 PaymentPayload envelope
      expect(paymentPayload).toHaveProperty('x402Version', 2);
      expect(paymentPayload).toHaveProperty('resource');
      expect(paymentPayload.resource).toHaveProperty('url', 'https://example.com/article');
      expect(paymentPayload.resource).toHaveProperty('description', '');
      expect(paymentPayload.resource).toHaveProperty('mimeType', '');
      expect(paymentPayload).toHaveProperty('accepted');
      expect(paymentPayload.accepted).toHaveProperty('scheme', 'exact');
      expect(paymentPayload).toHaveProperty('payload');
      expect(paymentPayload.payload).toHaveProperty('signature');
      expect(paymentPayload.payload).toHaveProperty('authorization');
    });

    it('calls verify with full PaymentRequirements (scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra)', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      const [, , , paymentRequirements] = vi.mocked(verify).mock.calls[0]!;

      expect(paymentRequirements).toHaveProperty('scheme', 'exact');
      expect(paymentRequirements).toHaveProperty('network', 'eip155:324705682');
      expect(paymentRequirements).toHaveProperty('asset', '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
      expect(paymentRequirements).toHaveProperty('amount', '10000');
      expect(paymentRequirements).toHaveProperty('payTo', '0xreceiver');
      expect(paymentRequirements).toHaveProperty('maxTimeoutSeconds', 300);
      expect(paymentRequirements).toHaveProperty('extra');
    });
  });

  describe('settle() wire format', () => {
    it('calls settle with same PaymentPayload and PaymentRequirements', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(vi.mocked(settle)).toHaveBeenCalledTimes(1);
      const [, , settlePayload, settleRequirements] = vi.mocked(settle).mock.calls[0]!;

      // Same full PaymentPayload
      expect(settlePayload).toHaveProperty('x402Version', 2);
      expect(settlePayload).toHaveProperty('resource');
      expect(settlePayload).toHaveProperty('accepted');
      expect(settlePayload).toHaveProperty('payload');

      // Same PaymentRequirements
      expect(settleRequirements).toHaveProperty('scheme', 'exact');
      expect(settleRequirements).toHaveProperty('network');
      expect(settleRequirements).toHaveProperty('asset');
      expect(settleRequirements).toHaveProperty('amount');
      expect(settleRequirements).toHaveProperty('payTo');
    });
  });

  describe('VerifyResponse uses isValid (not valid)', () => {
    it('reads isValid from verify response to gate settle', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      // Override verify to return isValid: false
      vi.mocked(verify).mockResolvedValue({ isValid: false, invalidReason: 'test-reason' });

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(response.success).toBe(false);
      expect(response.error).toContain('verification failed');
      expect(response.error).toContain('test-reason');
      expect(vi.mocked(settle)).not.toHaveBeenCalled();
    });
  });

  describe('SettleResponse uses transaction (not txHash)', () => {
    it('maps settleResult.transaction to receipt.txHash', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(response.success).toBe(true);
      expect(response.transaction).toBe('0xabc123');
      expect(response.network).toBe('eip155:324705682');

      // Receipt maps transaction correctly
      const receipt = response.receipt as Record<string, unknown>;
      expect(receipt.txHash).toBe('0xabc123');
      expect(receipt.network).toBe('eip155:324705682');
    });

    it('saves PaymentRecord with transaction as txHash', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(vi.mocked(addPayment)).toHaveBeenCalledTimes(1);
      const record = vi.mocked(addPayment).mock.calls[0]![0];
      expect(record.txHash).toBe('0xabc123');
    });
  });

  describe('SupportedResponse uses x402 shape', () => {
    it('merges facilitator extra into PaymentRequirements for signing', async () => {
      await setupUnlockedWallet();
      await setupPaymentPage();
      mockSuccessfulPaymentFlow();

      await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      // createSignedPayload should receive requirements with merged extra
      const [, requirements] = vi.mocked(createSignedPayload).mock.calls[0]!;
      expect(requirements).toHaveProperty('scheme', 'exact');
      expect(requirements).toHaveProperty('network', 'eip155:324705682');
      expect(requirements).toHaveProperty('extra');
      expect(requirements.extra).toHaveProperty('name', 'USD Coin');
      expect(requirements.extra).toHaveProperty('version', '2');
    });
  });
});
