import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStorageMock } from './helpers/storage-mock.js';

// ── Chrome API Mocks ────────────────────────────────────────────────

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
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
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
  fetchBalances: vi.fn(),
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

import { handleMessage, _resetPageStateForTest } from '../src/background/message-router.js';
import { getSupported, settle, verify } from '../src/background/facilitator.js';
import { fetchBalance, fetchBalances } from '../src/background/balance.js';
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

async function setupUnlockedWallet(): Promise<string> {
  // Create wallet
  const result = await sendMessage({
    type: 'CREATE_WALLET',
    password: 'test-pw-123',
  });
  if (!result.success) {
    throw new Error(`setupUnlockedWallet: CREATE_WALLET failed: ${JSON.stringify(result)}`);
  }
  return result.address as string;
}

function mockBalancesMap(network: string, raw: string, formatted: string): Map<string, { raw: string; formatted: string; network: string; asset: string; fetchedAt: number }> {
  return new Map([[network, { raw, formatted, network, asset: 'USDC', fetchedAt: Date.now() }]]);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('payment-flow', () => {
  beforeEach(() => {
    localStorageMock._reset();
    sessionStorageMock._reset();
    _resetPageStateForTest();
    vi.clearAllMocks();
    // Restore getURL implementation after clearAllMocks wipes it
    vi.mocked(chrome.runtime.getURL).mockImplementation((path: string) =>
      `chrome-extension://test-extension-id/${path}`
    );
    // Reset mock implementations for module mocks (clearAllMocks doesn't reset implementations)
    vi.mocked(fetchBalance).mockReset();
    vi.mocked(fetchBalances).mockReset();
    vi.mocked(getSupported).mockReset();
    vi.mocked(verify).mockReset();
    vi.mocked(settle).mockReset();
    vi.mocked(createSignedPayload).mockReset();
    vi.mocked(addPayment).mockReset();
    vi.mocked(updatePaymentStatus).mockReset();
    tabsOnRemovedListeners.length = 0;

    // Default fetchBalances mock: delegates to fetchBalance for each network.
    // This mirrors the real implementation so existing fetchBalance mocks work.
    vi.mocked(fetchBalances).mockImplementation(async (address: string, networks: string[]) => {
      const results = new Map<string, { raw: string; formatted: string; network: string; asset: string; fetchedAt: number }>();
      const settlements = await Promise.allSettled(
        networks.map((network) => fetchBalance(address, network)),
      );
      for (let i = 0; i < networks.length; i++) {
        const settlement = settlements[i];
        const network = networks[i];
        if (settlement && settlement.status === 'fulfilled' && settlement.value && network) {
          results.set(network, settlement.value);
        }
      }
      return results;
    });
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

    it('when facilitator does not support the page network: error contains network name', async () => {
      await setupUnlockedWallet();

      // Setup page state with network eip155:324705682
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

      // Sufficient balance so we reach the getSupported check
      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '50000',
        formatted: '0.05',
        network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        fetchedAt: Date.now(),
      });

      // Facilitator only supports a DIFFERENT network (eip155:999)
      vi.mocked(getSupported).mockResolvedValueOnce({
        kinds: [{
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:999',
          extra: { name: 'USD Coin', version: '2' },
        }],
        extensions: [],
        signers: {},
      });

      const response = await sendMessage({
        type: 'SIGN_AND_PAY',
        tabId: 1,
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('eip155:324705682');
      expect(response.error).toContain('not supported by facilitator');
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

      // In the non-optimistic failure path, addPayment is only called after a
      // successful settle. Since settle threw, addPayment must NOT have been called.
      expect(vi.mocked(addPayment)).not.toHaveBeenCalled();
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

      // settleInBackground is a detached async function (not awaited before return).
      // Poll until the second sendMessage call (PAYMENT_CONFIRMED) arrives or 2s elapses.
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (sendMessageToTabMock.mock.calls.length >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }

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

      // settleInBackground is a detached async function (not awaited before return).
      // Poll until the second sendMessage call (PAYMENT_SETTLE_FAILED) arrives or 2s elapses.
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (sendMessageToTabMock.mock.calls.length >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }

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

  describe('multi-network selection', () => {
    it('calls fetchBalances for all networks in accepts[]', async () => {
      await setupUnlockedWallet();

      // Mock fetchBalances to track the call
      vi.mocked(fetchBalances).mockResolvedValueOnce(
        new Map([
          ['eip155:324705682', { raw: '50000', formatted: '0.05', network: 'eip155:324705682', asset: 'USDC', fetchedAt: Date.now() }],
          ['eip155:84532', { raw: '100000', formatted: '0.10', network: 'eip155:84532', asset: 'USDC', fetchedAt: Date.now() }],
        ]),
      );

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
          accepts: [
            { scheme: 'exact', network: 'eip155:324705682', amount: '10000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0xreceiver' },
            { scheme: 'exact', network: 'eip155:84532', amount: '10000', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: '0xreceiver' },
          ],
        },
      });

      // fetchBalances should have been called with both networks
      expect(vi.mocked(fetchBalances)).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['eip155:324705682', 'eip155:84532']),
      );
    });

    it('service worker calls selectNetwork and stores selected network in page state', async () => {
      await setupUnlockedWallet();

      // SKALE testnet has insufficient balance, Base Sepolia has sufficient
      vi.mocked(fetchBalances).mockResolvedValueOnce(
        new Map([
          ['eip155:324705682', { raw: '100', formatted: '0.0001', network: 'eip155:324705682', asset: 'USDC', fetchedAt: Date.now() }],
          ['eip155:84532', { raw: '100000', formatted: '0.10', network: 'eip155:84532', asset: 'USDC', fetchedAt: Date.now() }],
        ]),
      );

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
          accepts: [
            { scheme: 'exact', network: 'eip155:324705682', amount: '10000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0xreceiver' },
            { scheme: 'exact', network: 'eip155:84532', amount: '10000', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: '0xreceiver' },
          ],
        },
      });

      // GET_PAGE_STATE should return the selected network (Base Sepolia, since SKALE was insufficient)
      vi.mocked(fetchBalance).mockResolvedValueOnce({
        raw: '100000', formatted: '0.10', network: 'eip155:84532',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', fetchedAt: Date.now(),
      });

      const pageState = await sendMessage({ type: 'GET_PAGE_STATE', tabId: 1 });
      expect(pageState.success).toBe(true);
      expect(pageState.detected).toBe(true);
      expect(pageState.network).toBe('eip155:84532');
    });

    it('single-network signal still processed correctly (backwards compat)', async () => {
      await setupUnlockedWallet();

      // Mock fetchBalances for PAGE_HAS_PAPERWALL
      vi.mocked(fetchBalances).mockResolvedValueOnce(
        new Map([['eip155:324705682', { raw: '50000', formatted: '0.05', network: 'eip155:324705682', asset: 'USDC', fetchedAt: Date.now() }]]),
      );

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

      // Mock for SIGN_AND_PAY fetchBalances
      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '50000', formatted: '0.05', network: 'eip155:324705682',
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

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });
      expect(response.success).toBe(true);
      expect(response.transaction).toBe('0xtxhash');
    });

    it('payment retries on next network after failure on first', async () => {
      await setupUnlockedWallet();

      // Both networks have sufficient balance
      vi.mocked(fetchBalance).mockResolvedValue({
        raw: '500000', formatted: '0.50', network: 'eip155:324705682',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', fetchedAt: Date.now(),
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
          accepts: [
            { scheme: 'exact', network: 'eip155:324705682', amount: '10000', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', payTo: '0xreceiver' },
            { scheme: 'exact', network: 'eip155:84532', amount: '10000', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: '0xreceiver' },
          ],
        },
      });

      // getSupported: both networks supported
      vi.mocked(getSupported).mockResolvedValue({
        kinds: [
          { x402Version: 2, scheme: 'exact', network: 'eip155:324705682', extra: { name: 'USD Coin', version: '2' } },
          { x402Version: 2, scheme: 'exact', network: 'eip155:84532', extra: { name: 'USD Coin', version: '2' } },
        ],
        extensions: [], signers: {},
      });

      vi.mocked(createSignedPayload).mockResolvedValue({
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: { scheme: 'exact', network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount: '10000', payTo: '0xreceiver', maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } },
        payload: { signature: '0xsig', authorization: { from: '0xsender', to: '0xreceiver', value: '10000', validAfter: '0', validBefore: '99999999', nonce: '0x1234' } },
      });
      vi.mocked(verify).mockResolvedValue({ isValid: true });

      // Settlement fails on first network (SKALE testnet), succeeds on second (Base Sepolia)
      vi.mocked(settle)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({ success: true, transaction: '0xretry_txhash', network: 'eip155:84532' });

      const response = await sendMessage({ type: 'SIGN_AND_PAY', tabId: 1 });

      expect(response.success).toBe(true);
      expect(response.transaction).toBe('0xretry_txhash');
      // settle should have been called twice (first failed, second succeeded)
      expect(vi.mocked(settle)).toHaveBeenCalledTimes(2);
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
