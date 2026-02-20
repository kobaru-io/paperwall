import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock business logic before importing the server
vi.mock('../server/request-orchestrator.js', () => ({
  orchestrateFetch: vi.fn(),
}));

vi.mock('../budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budget.js')>();
  return {
    ...actual,
    setBudget: vi.fn(),
    getBudget: vi.fn(),
    getTodayTotal: vi.fn().mockReturnValue('0'),
    getLifetimeTotal: vi.fn().mockReturnValue('0'),
  };
});

vi.mock('../wallet.js', () => ({
  getAddress: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock('../storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage.js')>();
  return {
    ...actual,
    readJsonFile: vi.fn(),
  };
});

vi.mock('../history.js', () => ({
  getTodayTotal: vi.fn().mockReturnValue('0'),
  getLifetimeTotal: vi.fn().mockReturnValue('0'),
  getRecent: vi.fn().mockReturnValue([]),
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './index.js';
import { orchestrateFetch } from '../server/request-orchestrator.js';
import { setBudget } from '../budget.js';
import type { OrchestrateResult } from '../server/request-orchestrator.js';

const BASE_RECEIPT = {
  id: 'r-test',
  timestamp: '2026-02-19T10:00:00Z',
  ap2Stage: 'intent' as const,
  url: 'https://example.com',
  agentId: null,
  authorization: {
    perRequestLimit: null,
    dailyLimit: null,
    totalLimit: null,
    dailySpent: '0.00',
    totalSpent: '0.00',
    requestedAmount: '0.00',
    authorizedAt: '2026-02-19T10:00:00Z',
    expiresAt: null,
  },
  settlement: null,
  decline: null,
  verification: null,
  riskSignals: {
    requestSource: 'mcp' as const,
    timestamp: '2026-02-19T10:00:00Z',
    agentFirstSeen: null,
    agentRequestCount: 0,
  },
};

describe('fetch_url tool', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-tools-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    await client.close();
  });

  it('success — free content (no payment)', async () => {
    const mock: OrchestrateResult = {
      ok: true,
      content: 'Hello world',
      contentType: 'text/plain',
      payment: null,
      receipt: BASE_RECEIPT,
    };
    vi.mocked(orchestrateFetch).mockResolvedValue(mock);

    const result = await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com' } });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.content).toBe('Hello world');
    expect(parsed.payment).toBeNull();
  });

  it('success — with payment', async () => {
    const mock: OrchestrateResult = {
      ok: true,
      content: 'Paid content',
      contentType: 'text/html',
      payment: { mode: 'client', amount: '10000', amountFormatted: '0.01', network: 'eip155:324705682', txHash: '0xtx', payee: '0xpayee' },
      receipt: { ...BASE_RECEIPT, ap2Stage: 'settled' },
    };
    vi.mocked(orchestrateFetch).mockResolvedValue(mock);

    const result = await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com/paid', maxPrice: '0.05' } });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.payment.txHash).toBe('0xtx');
    expect(parsed.receipt.ap2Stage).toBe('settled');
  });

  it('error — budget_exceeded', async () => {
    const mock: OrchestrateResult = {
      ok: false,
      error: 'budget_exceeded',
      message: 'Daily budget exceeded',
      receipt: { ...BASE_RECEIPT, ap2Stage: 'declined' },
    };
    vi.mocked(orchestrateFetch).mockResolvedValue(mock);

    const result = await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com' } });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.error).toBe('budget_exceeded');
  });

  it('error — no_wallet from orchestrateFetch', async () => {
    const mock: OrchestrateResult = {
      ok: false,
      error: 'no_wallet',
      message: 'No wallet configured. Run: paperwall wallet create',
      receipt: BASE_RECEIPT,
    };
    vi.mocked(orchestrateFetch).mockResolvedValue(mock);

    const result = await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com' } });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.error).toBe('no_wallet');
  });

  it('error — payment_error', async () => {
    const mock: OrchestrateResult = {
      ok: false,
      error: 'payment_error',
      message: 'Settlement failed',
      receipt: BASE_RECEIPT,
    };
    vi.mocked(orchestrateFetch).mockResolvedValue(mock);

    const result = await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com' } });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.error).toBe('payment_error');
  });

  it('error — network_error from thrown exception', async () => {
    vi.mocked(orchestrateFetch).mockRejectedValue(new Error('connection refused'));

    const result = await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com' } });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.error).toBe('network_error');
  });

  it('passes requestSource as mcp to orchestrateFetch', async () => {
    vi.mocked(orchestrateFetch).mockResolvedValue({
      ok: true,
      content: '',
      contentType: 'text/plain',
      payment: null,
      receipt: BASE_RECEIPT,
    });

    await client.callTool({ name: 'fetch_url', arguments: { url: 'https://example.com' } });
    expect(vi.mocked(orchestrateFetch)).toHaveBeenCalledWith(
      expect.objectContaining({ requestSource: 'mcp', agentId: null }),
    );
  });
});

describe('set_budget tool', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-budget-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    await client.close();
  });

  it('success — sets all limits', async () => {
    vi.mocked(setBudget).mockReturnValue({ perRequestMax: '0.10', dailyMax: '5.00', totalMax: '50.00' });

    const result = await client.callTool({ name: 'set_budget', arguments: { perRequest: '0.10', daily: '5.00', total: '50.00' } });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.budget.perRequest).toBe('0.10');
    expect(parsed.message).toBe('Budget updated successfully');
  });

  it('success — sets only daily limit', async () => {
    vi.mocked(setBudget).mockReturnValue({ dailyMax: '5.00' });

    const result = await client.callTool({ name: 'set_budget', arguments: { daily: '5.00' } });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.ok).toBe(true);
  });

  it('error — no limits provided', async () => {
    const result = await client.callTool({ name: 'set_budget', arguments: {} });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.error).toBe('invalid_input');
    expect(parsed.message).toContain('At least one limit');
  });
});
