import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Mock all business logic modules before importing the server
vi.mock('../../server/request-orchestrator.js', () => ({
  orchestrateFetch: vi.fn(),
}));

vi.mock('../../wallet.js', () => ({
  getAddress: vi.fn(),
  getBalance: vi.fn(),
  resolvePrivateKey: vi.fn(),
}));

vi.mock('../../budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../budget.js')>();
  return {
    ...actual,
    getBudget: vi.fn(),
    setBudget: vi.fn(),
  };
});

vi.mock('../../history.js', () => ({
  getTodayTotal: vi.fn(),
  getLifetimeTotal: vi.fn(),
  getRecent: vi.fn(),
  appendPayment: vi.fn(),
}));

vi.mock('../../storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage.js')>();
  return {
    ...actual,
    readJsonFile: vi.fn(),
  };
});

import { createMcpServer } from '../index.js';
import { orchestrateFetch } from '../../server/request-orchestrator.js';
import { getAddress, getBalance } from '../../wallet.js';
import { getBudget, setBudget } from '../../budget.js';
import { getTodayTotal, getLifetimeTotal, getRecent } from '../../history.js';
import { readJsonFile } from '../../storage.js';
import type { OrchestrateResult } from '../../server/request-orchestrator.js';

const MOCK_RECEIPT = {
  id: 'r-1',
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

describe('MCP server integration', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-mcp-int-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    // Default mocks
    vi.mocked(getAddress).mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28');
    vi.mocked(getBudget).mockReturnValue(null);
    vi.mocked(getTodayTotal).mockReturnValue('0');
    vi.mocked(getLifetimeTotal).mockReturnValue('0');
    vi.mocked(getRecent).mockReturnValue([]);
    vi.mocked(readJsonFile).mockReturnValue({
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
      networkId: 'eip155:324705682',
      encryptedKey: 'test',
      keySalt: 'test',
      keyIv: 'test',
    });

    // Create server and connect via in-memory transport
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    await client.close();
  });

  // -- Tool listing ---

  it('should list 2 tools with correct names', async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(2);

    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(['fetch_url', 'set_budget']);
  });

  it('should list fetch_url with correct schema', async () => {
    const result = await client.listTools();
    const fetchTool = result.tools.find((t) => t.name === 'fetch_url');

    expect(fetchTool).toBeDefined();
    expect(fetchTool?.inputSchema.properties).toHaveProperty('url');
    expect(fetchTool?.inputSchema.properties).toHaveProperty('maxPrice');
    expect(fetchTool?.inputSchema.required).toContain('url');
  });

  // -- Resource listing ---

  it('should list 4 resources with correct URIs', async () => {
    const result = await client.listResources();
    expect(result.resources).toHaveLength(4);

    const uris = result.resources.map((r) => r.uri).sort();
    expect(uris).toEqual([
      'paperwall://budget/status',
      'paperwall://history/recent',
      'paperwall://wallet/balance',
      'paperwall://wallet/info',
    ]);
  });

  // -- fetch_url tool ---

  it('should call fetch_url and return free content', async () => {
    const mockResult: OrchestrateResult = {
      ok: true,
      content: '<html>Free article</html>',
      contentType: 'text/html',
      payment: null,
      receipt: { ...MOCK_RECEIPT, ap2Stage: 'intent' },
    };

    vi.mocked(orchestrateFetch).mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'fetch_url',
      arguments: { url: 'https://example.com' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);

    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.content).toBe('<html>Free article</html>');
    expect(parsed.contentType).toBe('text/html');
    expect(parsed.payment).toBeNull();
  });

  it('should call fetch_url and return paid content with receipt', async () => {
    const mockResult: OrchestrateResult = {
      ok: true,
      content: '<html>Paid article</html>',
      contentType: 'text/html',
      payment: {
        mode: 'client',
        amount: '50000',
        amountFormatted: '0.05',
        network: 'eip155:324705682',
        txHash: '0xabc123',
        payee: '0xdef456',
      },
      receipt: { ...MOCK_RECEIPT, ap2Stage: 'settled' },
    };

    vi.mocked(orchestrateFetch).mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'fetch_url',
      arguments: { url: 'https://example.com/paid', maxPrice: '0.10' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.payment).not.toBeNull();
    expect(parsed.payment.txHash).toBe('0xabc123');
    expect(parsed.receipt.ap2Stage).toBe('settled');
  });

  it('should return isError on budget_exceeded', async () => {
    const mockResult: OrchestrateResult = {
      ok: false,
      error: 'budget_exceeded',
      message: 'Daily budget exceeded',
      receipt: { ...MOCK_RECEIPT, ap2Stage: 'declined' },
    };

    vi.mocked(orchestrateFetch).mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'fetch_url',
      arguments: { url: 'https://example.com/article' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('budget_exceeded');
  });

  it('should return isError on no_wallet', async () => {
    const mockResult: OrchestrateResult = {
      ok: false,
      error: 'no_wallet',
      message: 'No wallet configured. Run: paperwall wallet create',
      receipt: { ...MOCK_RECEIPT },
    };

    vi.mocked(orchestrateFetch).mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'fetch_url',
      arguments: { url: 'https://example.com' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.error).toBe('no_wallet');
  });

  // -- set_budget tool ---

  it('should call set_budget and return confirmation', async () => {
    vi.mocked(setBudget).mockReturnValue({
      perRequestMax: '0.10',
      dailyMax: '5.00',
      totalMax: '50.00',
    });

    const result = await client.callTool({
      name: 'set_budget',
      arguments: { perRequest: '0.10', daily: '5.00', total: '50.00' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.message).toBe('Budget updated successfully');
    expect(parsed.budget.perRequest).toBe('0.10');
  });

  it('should return isError when no limits provided to set_budget', async () => {
    const result = await client.callTool({
      name: 'set_budget',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.error).toBe('invalid_input');
  });

  // -- Resources ---

  it('should read wallet-info resource', async () => {
    const result = await client.readResource({ uri: 'paperwall://wallet/info' });

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28');
    expect(parsed.network).toBe('eip155:324705682');
    expect(parsed.networkName).toBe('SKALE Base Sepolia');
  });

  it('should read wallet-info resource with no wallet', async () => {
    vi.mocked(getAddress).mockRejectedValue(new Error('No wallet configured. Run: paperwall wallet create'));

    const result = await client.readResource({ uri: 'paperwall://wallet/info' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.error).toBe('no_wallet');
  });

  it('should read wallet-balance resource', async () => {
    vi.mocked(getBalance).mockResolvedValue({
      address: '0x742d35Cc',
      balance: '12500000',
      balanceFormatted: '12.50',
      asset: 'USDC',
      network: 'eip155:324705682',
    });

    const result = await client.readResource({ uri: 'paperwall://wallet/balance' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.balance).toBe('12.50');
    expect(parsed.currency).toBe('USDC');
  });

  it('should read wallet-balance resource with RPC error', async () => {
    vi.mocked(getBalance).mockRejectedValue(new Error('RPC error: connection refused'));

    const result = await client.readResource({ uri: 'paperwall://wallet/balance' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.error).toBe('rpc_error');
  });

  it('should read budget-status resource with no budget', async () => {
    vi.mocked(getBudget).mockReturnValue(null);

    const result = await client.readResource({ uri: 'paperwall://budget/status' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.configured).toBe(false);
  });

  it('should read budget-status resource with configured budget', async () => {
    vi.mocked(getBudget).mockReturnValue({
      perRequestMax: '0.10',
      dailyMax: '5.00',
      totalMax: '50.00',
    });
    vi.mocked(getTodayTotal).mockReturnValue('2300000');
    vi.mocked(getLifetimeTotal).mockReturnValue('15750000');

    const result = await client.readResource({ uri: 'paperwall://budget/status' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.configured).toBe(true);
    expect(parsed.limits.daily).toBe('5.00');
    expect(parsed.spending.today).toBe('2.30');
    expect(parsed.remaining.daily).toBe('2.70');
  });

  it('should read payment-history resource with no entries', async () => {
    vi.mocked(getRecent).mockReturnValue([]);

    const result = await client.readResource({ uri: 'paperwall://history/recent' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.count).toBe(0);
    expect(parsed.entries).toEqual([]);
  });

  it('should read payment-history resource with entries', async () => {
    vi.mocked(getRecent).mockReturnValue([
      {
        ts: '2026-02-19T10:00:00Z',
        url: 'https://example.com/article',
        amount: '50000',
        asset: 'USDC',
        network: 'eip155:324705682',
        txHash: '0xabc',
        mode: 'client',
      },
    ]);

    const result = await client.readResource({ uri: 'paperwall://history/recent' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.count).toBe(1);
    expect(parsed.entries[0].amountFormatted).toBe('0.05');
  });
});
