import { describe, it, expect } from 'vitest';
import { renderReceiptPage } from '../receipt-viewer.js';
import type { Receipt } from '../types.js';

const settledReceipt: Receipt = {
  id: 'abc-123',
  timestamp: '2026-02-11T14:30:00.000Z',
  ap2Stage: 'settled',
  url: 'https://example.com/article',
  agentId: 'agent-01',
  authorization: {
    perRequestLimit: '0.10',
    dailyLimit: '5.00',
    totalLimit: null,
    dailySpent: '0.50',
    totalSpent: '5.00',
    requestedAmount: '0.01',
  },
  settlement: {
    txHash: '0xabc123def456',
    network: 'eip155:324705682',
    amount: '10000',
    amountFormatted: '0.01',
    currency: 'USDC',
    payer: '0xPAYER',
    payee: '0xPAYEE',
  },
  decline: null,
  verification: {
    explorerUrl: 'https://explorer.example.com/tx/0xabc123def456',
    network: 'eip155:324705682',
  },
};

describe('renderReceiptPage', () => {
  it('renders HTML with settled receipt', () => {
    const html = renderReceiptPage([settledReceipt], {
      total: 1,
      totalSpent: '0.01',
      totalDeclined: 0,
    });

    expect(html).toContain('Paperwall');
    expect(html).toContain('settled');
    expect(html).toContain('0xabc123de');
    expect(html).toContain(
      'https://explorer.example.com/tx/0xabc123def456',
    );
    expect(html).toContain('agent-01');
  });

  it('renders empty state', () => {
    const html = renderReceiptPage([], {
      total: 0,
      totalSpent: '0.00',
      totalDeclined: 0,
    });
    expect(html).toContain('No receipts yet');
  });

  it('renders declined receipt with reason', () => {
    const declined: Receipt = {
      ...settledReceipt,
      id: 'def-456',
      ap2Stage: 'declined',
      settlement: null,
      verification: null,
      decline: {
        reason: 'budget_exceeded',
        limit: 'daily',
        limitValue: '5.00',
        requestedAmount: '0.10',
      },
    };
    const html = renderReceiptPage([declined], {
      total: 1,
      totalSpent: '0.00',
      totalDeclined: 1,
    });

    expect(html).toContain('declined');
    expect(html).toContain('budget_exceeded');
  });

  it('escapes HTML in user-controlled fields', () => {
    const xssReceipt: Receipt = {
      ...settledReceipt,
      url: 'https://example.com/<script>alert(1)</script>',
      agentId: '<img onerror=alert(1)>',
    };
    const html = renderReceiptPage([xssReceipt], {
      total: 1,
      totalSpent: '0.01',
      totalDeclined: 0,
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
