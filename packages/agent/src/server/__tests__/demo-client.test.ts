import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDemoStep,
  buildDemoSummary,
  runDemo,
} from '../demo-client.js';

// -- Fixtures ---

const SETTLED_RESULT = {
  url: 'https://example.com/article-1',
  outcome: 'fetched' as const,
  payment: {
    amountFormatted: '0.05',
    txHash: '0xabc1234567890def',
    network: 'eip155:324705682',
    payer: '0x1111111111111111111111111111111111111111',
    payee: '0x2222222222222222222222222222222222222222',
  },
  receipt: { id: 'r1-uuid-goes-here', ap2Stage: 'settled' as const },
  authorization: {
    perRequestLimit: '0.10',
    dailyLimit: '5.00',
    totalLimit: '50.00',
    dailySpent: '0.25',
    totalSpent: '1.50',
    requestedAmount: '0.05',
  },
  verification: {
    explorerUrl: 'https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xabc1234567890def',
    network: 'eip155:324705682',
  },
};

const DECLINED_RESULT = {
  url: 'https://example.com/article-4',
  outcome: 'declined' as const,
  error: 'budget_exceeded',
  receipt: { id: 'r4-uuid-goes-here', ap2Stage: 'declined' as const },
  authorization: {
    perRequestLimit: '0.10',
    dailyLimit: '5.00',
    totalLimit: '50.00',
    dailySpent: '4.80',
    totalSpent: '45.00',
    requestedAmount: '0.50',
  },
  decline: {
    reason: 'budget_exceeded',
    limit: 'daily',
    limitValue: '5.00',
    requestedAmount: '0.50',
  },
};

const FREE_RESULT = {
  url: 'https://example.com/free-article',
  outcome: 'fetched' as const,
  receipt: { id: 'r2-uuid-goes-here', ap2Stage: 'intent' as const },
};

// -- Receipt fixture for RPC responses ---

const FULL_RECEIPT_SETTLED = {
  id: 'r1-settled-uuid',
  ap2Stage: 'settled',
  authorization: {
    perRequestLimit: '0.10',
    dailyLimit: '5.00',
    totalLimit: '50.00',
    dailySpent: '0.25',
    totalSpent: '1.50',
    requestedAmount: '0.05',
  },
  verification: {
    explorerUrl: 'https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xabc123',
    network: 'eip155:324705682',
  },
};

const FULL_RECEIPT_DECLINED = {
  id: 'r1-declined-uuid',
  ap2Stage: 'declined',
  authorization: {
    perRequestLimit: '0.10',
    dailyLimit: '5.00',
    totalLimit: '50.00',
    dailySpent: '4.80',
    totalSpent: '45.00',
    requestedAmount: '0.50',
  },
  decline: {
    reason: 'budget_exceeded',
    limit: 'daily',
    limitValue: '5.00',
    requestedAmount: '0.50',
  },
};

describe('formatDemoStep', () => {
  it('formats settled step with authorization context (default)', () => {
    const output = formatDemoStep(SETTLED_RESULT);

    expect(output).toContain('AP2 Intent: requesting $0.05 USDC');
    expect(output).toContain('AP2 Authorization: passed (daily $0.25/$5.00)');
    expect(output).toContain('AP2 Settlement: $0.05 USDC');
    expect(output).toContain('tx 0xabc1234567...');
    expect(output).toContain('AP2 Receipt: r1-uuid-goes...');
    expect(output).toContain('[settled]');
    // Default should NOT show payer/payee or explorer
    expect(output).not.toContain('0x1111');
    expect(output).not.toContain('AP2 Verification:');
  });

  it('formats settled step with authorization context (verbose)', () => {
    const result = {
      ...SETTLED_RESULT,
      content: '<p>Article content here</p>',
    };
    const output = formatDemoStep(result, true);

    expect(output).toContain('AP2 Intent: requesting $0.05 USDC');
    expect(output).toContain(
      'AP2 Authorization: passed (per-request: $0.10, daily: $0.25/$5.00, total: $1.50/$50.00)',
    );
    expect(output).toContain('AP2 Settlement: $0.05 USDC');
    expect(output).toContain('0x1111...1111');
    expect(output).toContain('0x2222...2222');
    expect(output).toContain(
      'AP2 Verification: https://base-sepolia-testnet-explorer.skalenodes.com/tx/0xabc1234567890def',
    );
    expect(output).toContain('Preview: Article content here');
  });

  it('formats declined step with decline context (default)', () => {
    const output = formatDemoStep(DECLINED_RESULT);

    expect(output).toContain('AP2 Intent: requesting $0.50 USDC');
    expect(output).toContain('DENIED');
    expect(output).toContain('daily ($5.00) exceeded');
    expect(output).toContain('[declined]');
    // Default should NOT show spent details
    expect(output).not.toContain('daily spent:');
  });

  it('formats declined step with decline context (verbose)', () => {
    const output = formatDemoStep(DECLINED_RESULT, true);

    expect(output).toContain('AP2 Intent: requesting $0.50 USDC');
    expect(output).toContain('DENIED');
    expect(output).toContain('daily ($5.00) exceeded');
    expect(output).toContain('requested: $0.50');
    expect(output).toContain('daily spent: $4.80');
  });

  it('formats free content step', () => {
    const output = formatDemoStep(FREE_RESULT);

    expect(output).toContain('free');
    expect(output).toContain('AP2 Receipt');
  });

  it('formats declined step with default error (no decline context)', () => {
    const output = formatDemoStep({
      url: 'https://example.com/x',
      outcome: 'declined',
      receipt: { id: 'dec-id-xxxxx', ap2Stage: 'declined' as const },
    });

    expect(output).toContain('DENIED');
    expect(output).toContain('budget_exceeded');
  });

  it('formats error step', () => {
    const output = formatDemoStep({
      url: 'https://example.com/broken',
      outcome: 'error',
      error: 'connection refused',
      receipt: { id: 'err-id', ap2Stage: 'intent' as const },
    });

    expect(output).toContain('Error');
    expect(output).toContain('connection refused');
  });

  it('formats settled step without authorization (fallback)', () => {
    const result = {
      url: 'https://example.com/article-1',
      outcome: 'fetched' as const,
      payment: {
        amountFormatted: '0.01',
        txHash: '0xabc123456789',
        network: 'eip155:324705682',
      },
      receipt: { id: 'r1-uuid-goes-here', ap2Stage: 'settled' as const },
    };
    const output = formatDemoStep(result);

    expect(output).toContain('settled');
    expect(output).toContain('AP2 Settlement');
    expect(output).toContain('budget check passed');
  });
});

describe('buildDemoSummary', () => {
  it('builds summary with totalUsdcSpent and explorer URLs', () => {
    const summary = buildDemoSummary([
      {
        ...SETTLED_RESULT,
        payment: { ...SETTLED_RESULT.payment, amountFormatted: '0.01' },
      },
      {
        url: 'https://b.com',
        outcome: 'fetched' as const,
        payment: {
          amountFormatted: '0.02',
          txHash: '0x2',
          network: 'eip155:324705682',
        },
        receipt: { id: 'r2', ap2Stage: 'settled' as const },
        verification: {
          explorerUrl: 'https://explorer.example.com/tx/0x2',
          network: 'eip155:324705682',
        },
      },
      DECLINED_RESULT,
    ]);

    expect(summary.totalRequests).toBe(3);
    expect(summary.successfulFetches).toBe(2);
    expect(summary.declinedFetches).toBe(1);
    expect(summary.totalUsdcSpent).toBe('0.03');
    expect(summary.explorerLinks).toHaveLength(2);
    expect(summary.explorerLinks[0]).toContain('skalenodes.com');
    expect(summary.explorerLinks[1]).toContain('explorer.example.com');
  });

  it('falls back to tx hashes when no verification', () => {
    const summary = buildDemoSummary([
      {
        url: 'https://a.com',
        outcome: 'fetched' as const,
        payment: {
          amountFormatted: '0.01',
          txHash: '0xfallback',
          network: 'eip155:324705682',
        },
        receipt: { id: 'r1', ap2Stage: 'settled' as const },
      },
    ]);

    expect(summary.explorerLinks).toEqual(['0xfallback']);
    expect(summary.totalUsdcSpent).toBe('0.01');
  });

  it('handles empty results', () => {
    const summary = buildDemoSummary([]);
    expect(summary.totalRequests).toBe(0);
    expect(summary.successfulFetches).toBe(0);
    expect(summary.declinedFetches).toBe(0);
    expect(summary.totalUsdcSpent).toBe('0.00');
    expect(summary.explorerLinks).toHaveLength(0);
  });
});

describe('runDemo', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('discovers agent card and sends JSON-RPC requests', async () => {
    const agentCard = {
      name: 'Paperwall Agent',
      protocolVersion: '0.3.0',
      skills: [{ id: 'fetch-content' }],
    };
    const rpcResult = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        kind: 'task',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'agent',
            parts: [
              {
                kind: 'data',
                data: {
                  ok: true,
                  url: 'https://example.com/article-1',
                  payment: {
                    amountFormatted: '0.01',
                    txHash: '0xabc',
                    network: 'eip155:324705682',
                    payer: '0x1111111111111111111111111111111111111111',
                    payee: '0x2222222222222222222222222222222222222222',
                  },
                  receipt: FULL_RECEIPT_SETTLED,
                },
              },
            ],
          },
        ],
      },
    };

    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        // Agent card discovery
        return new Response(JSON.stringify(agentCard), { status: 200 });
      }
      // RPC call
      return new Response(JSON.stringify(rpcResult), { status: 200 });
    }) as typeof fetch;

    await runDemo({
      server: 'http://localhost:4000',
      articles: ['https://example.com/article-1'],
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    // Verify console.log was called with JSON output
    expect(console.log).toHaveBeenCalled();
    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['ok']).toBe(true);

    // Verify enriched fields in JSON output
    const results = parsed['results'] as Array<Record<string, unknown>>;
    const first = results[0]!;
    expect(first['authorization']).not.toBeNull();
    expect(first['verification']).not.toBeNull();
    expect(first['decline']).toBeNull();

    // Verify summary has totalUsdcSpent
    const summary = parsed['summary'] as Record<string, unknown>;
    expect(summary['totalUsdcSpent']).toBe('0.01');
  });

  it('throws when agent card discovery fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    await expect(
      runDemo({ server: 'http://localhost:4000', articles: [] }),
    ).rejects.toThrow('Failed to discover agent');
  });

  it('handles RPC error response', async () => {
    const agentCard = { name: 'Test', protocolVersion: '0.3.0' };
    const rpcError = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32600, message: 'Invalid request' },
    };

    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify(agentCard), { status: 200 });
      }
      return new Response(JSON.stringify(rpcError), { status: 200 });
    }) as typeof fetch;

    await runDemo({
      server: 'http://localhost:4000/',
      articles: ['https://example.com/a'],
    });

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as { results: Array<{ outcome: string }> };
    expect(parsed.results[0]!.outcome).toBe('error');
  });

  it('handles fetch throwing during RPC call', async () => {
    const agentCard = { name: 'Test', protocolVersion: '0.3.0' };

    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify(agentCard), { status: 200 });
      }
      throw new Error('Connection refused');
    }) as typeof fetch;

    await runDemo({
      server: 'http://localhost:4000',
      articles: ['https://example.com/a'],
    });

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as { results: Array<{ outcome: string }> };
    expect(parsed.results[0]!.outcome).toBe('error');
  });

  it('handles declined response with full receipt', async () => {
    const agentCard = { name: 'Test', protocolVersion: '0.3.0' };
    const rpcResult = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        kind: 'task',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'agent',
            parts: [
              {
                kind: 'data',
                data: {
                  ok: false,
                  error: 'budget_exceeded',
                  receipt: FULL_RECEIPT_DECLINED,
                },
              },
            ],
          },
        ],
      },
    };

    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify(agentCard), { status: 200 });
      }
      return new Response(JSON.stringify(rpcResult), { status: 200 });
    }) as typeof fetch;

    await runDemo({
      server: 'http://localhost:4000',
      articles: ['https://example.com/a'],
    });

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    const parsed = JSON.parse(output) as {
      results: Array<{
        outcome: string;
        authorization: Record<string, unknown> | null;
        decline: Record<string, unknown> | null;
        verification: unknown;
      }>;
    };
    expect(parsed.results[0]!.outcome).toBe('declined');
    expect(parsed.results[0]!.authorization).not.toBeNull();
    expect(parsed.results[0]!.decline).not.toBeNull();
    expect(parsed.results[0]!.decline!['reason']).toBe('budget_exceeded');
    expect(parsed.results[0]!.decline!['limit']).toBe('daily');
    expect(parsed.results[0]!.verification).toBeNull();
  });

  it('sends agent key header when provided', async () => {
    const agentCard = { name: 'Test', protocolVersion: '0.3.0' };
    const rpcResult = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        kind: 'task',
        status: { state: 'completed' },
        history: [
          {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'data', data: { ok: true, receipt: { id: 'r1', ap2Stage: 'settled' } } }],
          },
        ],
      },
    };

    let rpcHeaders: HeadersInit | undefined;
    let callIndex = 0;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify(agentCard), { status: 200 });
      }
      rpcHeaders = init?.headers;
      return new Response(JSON.stringify(rpcResult), { status: 200 });
    }) as typeof fetch;

    await runDemo({
      server: 'http://localhost:4000',
      articles: ['https://example.com/a'],
      agentKey: 'test-key-123',
    });

    expect(rpcHeaders).toMatchObject({
      Authorization: 'Bearer test-key-123',
    });
  });
});
