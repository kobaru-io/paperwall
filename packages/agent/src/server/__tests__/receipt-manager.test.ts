import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getExplorerUrl,
  createReceipt,
  appendReceipt,
  listReceipts,
  getReceipt,
} from '../receipt-manager.js';

describe('getExplorerUrl', () => {
  it('constructs SKALE testnet explorer URL', () => {
    const url = getExplorerUrl('eip155:324705682', '0xabc123');
    expect(url).toContain('0xabc123');
    expect(url).toContain('explorer');
  });

  it('constructs SKALE mainnet explorer URL', () => {
    const url = getExplorerUrl('eip155:1187947933', '0xdef456');
    expect(url).toContain('0xdef456');
  });

  it('returns generic URL for unknown network', () => {
    const url = getExplorerUrl('eip155:1', '0x123');
    expect(url).toContain('0x123');
    expect(url).toContain('blockscan.com');
  });
});

describe('createReceipt', () => {
  it('creates settled receipt with settlement context', () => {
    const receipt = createReceipt({
      type: 'settled',
      url: 'https://example.com/article',
      agentId: 'agent-01',
      authorization: {
        perRequestLimit: '0.10',
        dailyLimit: '5.00',
        totalLimit: '50.00',
        dailySpent: '1.00',
        totalSpent: '10.00',
        requestedAmount: '0.01',
      },
      settlement: {
        txHash: '0xabc123',
        network: 'eip155:324705682',
        amount: '10000',
        amountFormatted: '0.01',
        currency: 'USDC',
        payer: '0xPAYER',
        payee: '0xPAYEE',
      },
    });

    expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.ap2Stage).toBe('settled');
    expect(receipt.settlement).not.toBeNull();
    expect(receipt.settlement!.txHash).toBe('0xabc123');
    expect(receipt.decline).toBeNull();
    expect(receipt.verification).not.toBeNull();
    expect(receipt.verification!.explorerUrl).toContain('0xabc123');
  });

  it('creates declined receipt with decline context', () => {
    const receipt = createReceipt({
      type: 'declined',
      url: 'https://example.com/expensive',
      agentId: null,
      authorization: {
        perRequestLimit: '0.10',
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0.00',
        totalSpent: '0.00',
        requestedAmount: '1.00',
      },
      decline: {
        reason: 'budget_exceeded',
        limit: 'per_request',
        limitValue: '0.10',
        requestedAmount: '1.00',
      },
    });

    expect(receipt.ap2Stage).toBe('declined');
    expect(receipt.decline).not.toBeNull();
    expect(receipt.decline!.reason).toBe('budget_exceeded');
    expect(receipt.settlement).toBeNull();
    expect(receipt.verification).toBeNull();
  });

  it('creates intent receipt for free content', () => {
    const receipt = createReceipt({
      type: 'intent',
      url: 'https://example.com/free',
      agentId: 'agent-02',
      authorization: {
        perRequestLimit: '0.10',
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0.00',
        totalSpent: '0.00',
        requestedAmount: '0.00',
      },
    });

    expect(receipt.ap2Stage).toBe('intent');
    expect(receipt.settlement).toBeNull();
    expect(receipt.decline).toBeNull();
    expect(receipt.verification).toBeNull();
  });
});

describe('receipt storage', () => {
  let originalHome: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    originalHome = process.env['HOME'];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
    process.env['HOME'] = tempDir;
    fs.mkdirSync(path.join(tempDir, '.paperwall'), { recursive: true });
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env['HOME'] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('appends and lists receipts', () => {
    const r1 = createReceipt({
      type: 'intent',
      url: 'https://a.com',
      agentId: null,
      authorization: {
        perRequestLimit: null,
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0',
        totalSpent: '0',
        requestedAmount: '0',
      },
    });
    const r2 = createReceipt({
      type: 'settled',
      url: 'https://b.com',
      agentId: 'bot',
      authorization: {
        perRequestLimit: null,
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0',
        totalSpent: '0',
        requestedAmount: '10000',
      },
      settlement: {
        txHash: '0x1',
        network: 'eip155:324705682',
        amount: '10000',
        amountFormatted: '0.01',
        currency: 'USDC',
        payer: '0xA',
        payee: '0xB',
      },
    });

    appendReceipt(r1);
    appendReceipt(r2);

    const all = listReceipts({});
    expect(all.receipts).toHaveLength(2);
    expect(all.total).toBe(2);
    // Newest first
    expect(all.receipts[0]!.url).toBe('https://b.com');
  });

  it('filters by ap2Stage', () => {
    const r1 = createReceipt({
      type: 'intent',
      url: 'https://a.com',
      agentId: null,
      authorization: {
        perRequestLimit: null,
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0',
        totalSpent: '0',
        requestedAmount: '0',
      },
    });
    const r2 = createReceipt({
      type: 'declined',
      url: 'https://b.com',
      agentId: null,
      authorization: {
        perRequestLimit: null,
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0',
        totalSpent: '0',
        requestedAmount: '10000',
      },
      decline: {
        reason: 'budget_exceeded',
        limit: 'daily',
        limitValue: '1.00',
        requestedAmount: '10000',
      },
    });

    appendReceipt(r1);
    appendReceipt(r2);

    const declined = listReceipts({ ap2Stage: 'declined' });
    expect(declined.receipts).toHaveLength(1);
    expect(declined.receipts[0]!.ap2Stage).toBe('declined');
  });

  it('gets receipt by ID', () => {
    const r1 = createReceipt({
      type: 'intent',
      url: 'https://a.com',
      agentId: null,
      authorization: {
        perRequestLimit: null,
        dailyLimit: null,
        totalLimit: null,
        dailySpent: '0',
        totalSpent: '0',
        requestedAmount: '0',
      },
    });
    appendReceipt(r1);

    const found = getReceipt(r1.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(r1.id);

    const notFound = getReceipt('nonexistent');
    expect(notFound).toBeNull();
  });

  it('applies limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      appendReceipt(
        createReceipt({
          type: 'intent',
          url: `https://example.com/${i}`,
          agentId: null,
          authorization: {
            perRequestLimit: null,
            dailyLimit: null,
            totalLimit: null,
            dailySpent: '0',
            totalSpent: '0',
            requestedAmount: '0',
          },
        }),
      );
    }

    const page = listReceipts({ limit: 2, offset: 1 });
    expect(page.receipts).toHaveLength(2);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(true);
  });
});
