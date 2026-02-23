import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before import
vi.mock('../../payment-engine.js', () => ({
  fetchWithPayment: vi.fn(),
}));

vi.mock('../../budget.js', () => ({
  getBudget: vi.fn(() => ({
    perRequestMax: '0.10',
    dailyMax: '5.00',
    totalMax: '50.00',
  })),
  smallestToUsdc: vi.fn((v: string) => {
    const n = BigInt(v);
    const whole = n / 1000000n;
    const frac = n % 1000000n;
    const full = frac.toString().padStart(6, '0');
    const trimmed = full.replace(/0+$/, '');
    const dec = trimmed.length < 2 ? full.slice(0, 2) : trimmed;
    return `${whole}.${dec}`;
  }),
}));

vi.mock('../../history.js', () => ({
  getTodayTotal: vi.fn(() => '500000'), // 0.50
  getLifetimeTotal: vi.fn(() => '5000000'), // 5.00
}));

vi.mock('../receipt-manager.js', () => ({
  createReceipt: vi.fn((event: Record<string, unknown>) => ({
    id: 'mock-receipt-id',
    timestamp: '2026-02-11T00:00:00.000Z',
    ap2Stage: event['type'],
    url: event['url'],
    agentId: event['agentId'],
    authorization: event['authorization'],
    settlement: event['settlement'] ?? null,
    decline: event['decline'] ?? null,
    verification: null,
  })),
  appendReceipt: vi.fn(),
}));

import { orchestrateFetch } from '../request-orchestrator.js';
import { fetchWithPayment } from '../../payment-engine.js';
import { appendReceipt, createReceipt } from '../receipt-manager.js';

const mockFetch = vi.mocked(fetchWithPayment);

describe('orchestrateFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with payment for paid content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/paid',
      content: '<html>Paid content</html>',
      contentType: 'text/html',
      payment: {
        mode: 'http402',
        amount: '10000',
        amountFormatted: '0.01',
        network: 'eip155:324705682',
        txHash: '0xabc123',
        asset: 'USDC',
        payer: '0xPAYER',
        payTo: '0xPAYEE',
      },
    } as never);

    const result = await orchestrateFetch({
      url: 'https://example.com/paid',
      agentId: 'agent-01',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain('Paid content');
      expect(result.payment).not.toBeNull();
      expect(result.payment!.txHash).toBe('0xabc123');
      expect(result.receipt).toBeDefined();
    }
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'settled' }),
    );
    expect(appendReceipt).toHaveBeenCalled();
  });

  it('returns success without payment for free content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/free',
      content: '<html>Free content</html>',
      contentType: 'text/html',
      payment: null,
    } as never);

    const result = await orchestrateFetch({
      url: 'https://example.com/free',
      agentId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payment).toBeNull();
    }
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'intent' }),
    );
  });

  it('returns failure for budget exceeded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      url: 'https://example.com/expensive',
      error: 'budget_exceeded',
      message: 'Exceeds per-request budget',
      requestedAmountFormatted: '1.00',
    } as never);

    const result = await orchestrateFetch({
      url: 'https://example.com/expensive',
      maxPrice: '0.10',
      agentId: 'agent-01',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('budget_exceeded');
      expect(result.receipt).toBeDefined();
    }
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'declined' }),
    );
  });

  it('returns failure for general error (non-decline)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      url: 'https://example.com/error',
      error: 'network_error',
      message: 'Connection timed out',
    } as never);

    const result = await orchestrateFetch({
      url: 'https://example.com/error',
      agentId: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('network_error');
    }
    // Non-decline errors create intent receipts
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'intent' }),
    );
  });

  it('passes maxPrice and network to fetchWithPayment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/test',
      content: 'ok',
      contentType: 'text/plain',
      payment: null,
    } as never);

    await orchestrateFetch({
      url: 'https://example.com/test',
      maxPrice: '0.05',
      network: 'eip155:1187947933',
      agentId: null,
    });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/test', {
      maxPrice: '0.05',
      network: 'eip155:1187947933',
      timeout: undefined,
    });
  });
});
