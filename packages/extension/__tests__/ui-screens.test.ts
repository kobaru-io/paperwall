// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPaymentPrompt } from '../src/popup/screens/payment.js';
import { renderSetup } from '../src/popup/screens/setup.js';
import { renderHistoryFull } from '../src/popup/screens/history-full.js';
import type { PaymentRecord } from '../src/background/history.js';

// ── Chrome API Mocks ────────────────────────────────────────────────

const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1 }]),
  },
};

Object.assign(globalThis, { chrome: chromeMock });

// ── Helpers ─────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    requestId: 'req-1',
    origin: 'example.com',
    url: 'https://example.com/article',
    amount: '50000',
    formattedAmount: '0.05',
    network: 'eip155:324705682',
    asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
    from: '0xABC',
    to: '0xDEF',
    txHash: '0x123abc',
    status: 'confirmed',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Payment Screen ──────────────────────────────────────────────────

describe('Payment screen — network display', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    chromeMock.runtime.sendMessage.mockReset();
    chromeMock.tabs.query.mockResolvedValue([{ id: 1 }]);
  });

  it('shows "via [network name]" when network is selected', () => {
    renderPaymentPrompt(
      container,
      {
        origin: 'example.com',
        price: '50000',
        network: 'eip155:324705682',
        facilitatorUrl: 'https://gateway.kobaru.io',
      },
      () => {},
    );

    const viaElement = container.querySelector('.network-via');
    expect(viaElement).not.toBeNull();
    expect(viaElement?.textContent).toContain('via');
    expect(viaElement?.textContent).toContain('SKALE Testnet');
  });

  it('shows TEST badge for testnet network in payment screen', () => {
    renderPaymentPrompt(
      container,
      {
        origin: 'example.com',
        price: '50000',
        network: 'eip155:324705682',
        facilitatorUrl: 'https://gateway.kobaru.io',
      },
      () => {},
    );

    const viaElement = container.querySelector('.network-via');
    const testBadge = viaElement?.querySelector('.badge-test');
    expect(testBadge).not.toBeNull();
    expect(testBadge?.textContent).toBe('TEST');
  });

  it('does not show TEST badge for mainnet network', () => {
    renderPaymentPrompt(
      container,
      {
        origin: 'example.com',
        price: '50000',
        network: 'eip155:8453',
        facilitatorUrl: 'https://gateway.kobaru.io',
      },
      () => {},
    );

    const viaElement = container.querySelector('.network-via');
    expect(viaElement?.textContent).toContain('via');
    expect(viaElement?.textContent).toContain('Base Mainnet');
    const testBadge = viaElement?.querySelector('.badge-test');
    expect(testBadge).toBeNull();
  });

  it('shows per-network breakdown on insufficient balance', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValueOnce({
      success: false,
      error: 'Insufficient balance: have 0.01, need 0.05',
      networkBalances: {
        'eip155:324705682': { network: 'eip155:324705682', formatted: '0.01' },
        'eip155:84532': { network: 'eip155:84532', formatted: '0.00' },
      },
      needed: '0.05',
    });

    renderPaymentPrompt(
      container,
      {
        origin: 'example.com',
        price: '50000',
        network: 'eip155:324705682',
        facilitatorUrl: 'https://gateway.kobaru.io',
      },
      () => {},
    );

    // Click approve button to trigger payment
    const approveBtn = container.querySelector('.btn-primary') as HTMLButtonElement;
    approveBtn.click();

    // Wait for async handler
    await vi.waitFor(() => {
      const breakdown = container.querySelector('.network-breakdown');
      expect(breakdown).not.toBeNull();
    });

    const breakdown = container.querySelector('.network-breakdown');
    expect(breakdown?.textContent).toContain('0.05');
    expect(breakdown?.textContent).toContain('0.01');
    expect(breakdown?.textContent).toContain('0.00');
  });
});

// ── Top-Up / Setup Screen ───────────────────────────────────────────

describe('Setup screen — network support text', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('shows "USDC on Base and SKALE" text', () => {
    renderSetup(container, () => {});
    expect(container.textContent).toContain('USDC on Base and SKALE');
  });
});

// ── History Screen ──────────────────────────────────────────────────

describe('History screen — network badges', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('shows network badge on history entry', () => {
    renderHistoryFull(container, [makeRecord({ network: 'eip155:324705682' })]);

    const badge = container.querySelector('.network-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('SKALE Testnet');
  });

  it('shows TEST badge for testnet entry', () => {
    renderHistoryFull(container, [makeRecord({ network: 'eip155:324705682' })]);

    const networkBadge = container.querySelector('.network-badge');
    const testBadge = networkBadge?.querySelector('.badge-test');
    expect(testBadge).not.toBeNull();
    expect(testBadge?.textContent).toBe('TEST');
  });

  it('does not show TEST badge for mainnet entry', () => {
    renderHistoryFull(container, [makeRecord({ network: 'eip155:8453' })]);

    const networkBadge = container.querySelector('.network-badge');
    expect(networkBadge).not.toBeNull();
    expect(networkBadge?.textContent).toContain('Base Mainnet');
    const testBadge = networkBadge?.querySelector('.badge-test');
    expect(testBadge).toBeNull();
  });
});
