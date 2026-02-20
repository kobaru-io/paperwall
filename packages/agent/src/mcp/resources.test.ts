import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock business logic before importing the server
vi.mock('../wallet.js', () => ({
  getAddress: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock('../budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budget.js')>();
  return {
    ...actual,
    getBudget: vi.fn(),
  };
});

vi.mock('../history.js', () => ({
  getTodayTotal: vi.fn(),
  getLifetimeTotal: vi.fn(),
  getRecent: vi.fn(),
}));

vi.mock('../storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage.js')>();
  return {
    ...actual,
    readJsonFile: vi.fn(),
  };
});

// Mock orchestrateFetch to prevent any side effects
vi.mock('../server/request-orchestrator.js', () => ({
  orchestrateFetch: vi.fn(),
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './index.js';
import { getAddress, getBalance } from '../wallet.js';
import { getBudget } from '../budget.js';
import { getTodayTotal, getLifetimeTotal, getRecent } from '../history.js';
import { readJsonFile } from '../storage.js';
import type { HistoryEntry } from '../history.js';

describe('wallet-info resource', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-res-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    vi.mocked(getTodayTotal).mockReturnValue('0');
    vi.mocked(getLifetimeTotal).mockReturnValue('0');
    vi.mocked(getRecent).mockReturnValue([]);
    vi.mocked(getBudget).mockReturnValue(null);
    vi.mocked(readJsonFile).mockReturnValue({
      address: '0xWallet',
      networkId: 'eip155:324705682',
      encryptedKey: 'x',
      keySalt: 'x',
      keyIv: 'x',
    });

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

  it('returns address and network when wallet exists', async () => {
    vi.mocked(getAddress).mockResolvedValue('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28');

    const result = await client.readResource({ uri: 'paperwall://wallet/info' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28');
    expect(parsed.network).toBe('eip155:324705682');
    expect(parsed.networkName).toBe('SKALE Base Sepolia');
  });

  it('returns error when no wallet', async () => {
    vi.mocked(getAddress).mockRejectedValue(new Error('No wallet configured. Run: paperwall wallet create'));

    const result = await client.readResource({ uri: 'paperwall://wallet/info' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.error).toBe('no_wallet');
    expect(parsed.message).toContain('No wallet configured');
  });
});

describe('wallet-balance resource', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-bal-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    vi.mocked(getTodayTotal).mockReturnValue('0');
    vi.mocked(getLifetimeTotal).mockReturnValue('0');
    vi.mocked(getRecent).mockReturnValue([]);
    vi.mocked(getBudget).mockReturnValue(null);
    vi.mocked(readJsonFile).mockReturnValue(null);
    vi.mocked(getAddress).mockResolvedValue('0xWallet');

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

  it('returns balance info', async () => {
    vi.mocked(getBalance).mockResolvedValue({
      address: '0xWallet',
      balance: '12500000',
      balanceFormatted: '12.50',
      asset: 'USDC',
      network: 'eip155:324705682',
    });

    const result = await client.readResource({ uri: 'paperwall://wallet/balance' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.balance).toBe('12.50');
    expect(parsed.currency).toBe('USDC');
    expect(parsed.network).toBe('eip155:324705682');
  });

  it('returns no_wallet error', async () => {
    vi.mocked(getBalance).mockRejectedValue(new Error('No wallet configured. Run: paperwall wallet create'));

    const result = await client.readResource({ uri: 'paperwall://wallet/balance' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.error).toBe('no_wallet');
  });

  it('returns rpc_error on RPC failure', async () => {
    vi.mocked(getBalance).mockRejectedValue(new Error('RPC error: connection timeout'));

    const result = await client.readResource({ uri: 'paperwall://wallet/balance' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.error).toBe('rpc_error');
    expect(parsed.message).toContain('Failed to query balance');
  });
});

describe('budget-status resource', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-bud-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    vi.mocked(getAddress).mockResolvedValue('0xWallet');
    vi.mocked(getRecent).mockReturnValue([]);
    vi.mocked(readJsonFile).mockReturnValue(null);

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

  it('returns configured: false when no budget', async () => {
    vi.mocked(getBudget).mockReturnValue(null);

    const result = await client.readResource({ uri: 'paperwall://budget/status' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.configured).toBe(false);
    expect(parsed.message).toContain('No budget configured');
  });

  it('returns budget status with remaining amounts', async () => {
    vi.mocked(getBudget).mockReturnValue({ perRequestMax: '0.10', dailyMax: '5.00', totalMax: '50.00' });
    vi.mocked(getTodayTotal).mockReturnValue('2300000');
    vi.mocked(getLifetimeTotal).mockReturnValue('15750000');

    const result = await client.readResource({ uri: 'paperwall://budget/status' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.configured).toBe(true);
    expect(parsed.limits.perRequest).toBe('0.10');
    expect(parsed.limits.daily).toBe('5.00');
    expect(parsed.spending.today).toBe('2.30');
    expect(parsed.spending.lifetime).toBe('15.75');
    expect(parsed.remaining.daily).toBe('2.70');
    expect(parsed.remaining.total).toBe('34.25');
  });

  it('returns null remaining when limits not configured', async () => {
    vi.mocked(getBudget).mockReturnValue({ perRequestMax: '0.10' });
    vi.mocked(getTodayTotal).mockReturnValue('0');
    vi.mocked(getLifetimeTotal).mockReturnValue('0');

    const result = await client.readResource({ uri: 'paperwall://budget/status' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.remaining.daily).toBeNull();
    expect(parsed.remaining.total).toBeNull();
  });

  it('clamps remaining to 0.00 when spending exceeds limit', async () => {
    vi.mocked(getBudget).mockReturnValue({ dailyMax: '5.00', totalMax: '50.00' });
    vi.mocked(getTodayTotal).mockReturnValue('5500000'); // spent $5.50 vs $5.00 limit
    vi.mocked(getLifetimeTotal).mockReturnValue('50100000'); // spent $50.10 vs $50.00 limit

    const result = await client.readResource({ uri: 'paperwall://budget/status' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.remaining.daily).toBe('0.00');
    expect(parsed.remaining.total).toBe('0.00');
  });
});

describe('payment-history resource', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let client: Client;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-hist-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.paperwall'), { mode: 0o700 });

    vi.mocked(getAddress).mockResolvedValue('0xWallet');
    vi.mocked(getBudget).mockReturnValue(null);
    vi.mocked(getTodayTotal).mockReturnValue('0');
    vi.mocked(getLifetimeTotal).mockReturnValue('0');
    vi.mocked(readJsonFile).mockReturnValue(null);

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

  it('returns empty history', async () => {
    vi.mocked(getRecent).mockReturnValue([]);

    const result = await client.readResource({ uri: 'paperwall://history/recent' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.count).toBe(0);
    expect(parsed.entries).toEqual([]);
  });

  it('returns history entries with amountFormatted', async () => {
    const entries: HistoryEntry[] = [
      { ts: '2026-02-19T10:00:00Z', url: 'https://example.com', amount: '50000', asset: 'USDC', network: 'eip155:324705682', txHash: '0xabc', mode: 'client' },
      { ts: '2026-02-19T09:00:00Z', url: 'https://other.com', amount: '100000', asset: 'USDC', network: 'eip155:324705682', txHash: '0xdef', mode: '402' },
    ];
    vi.mocked(getRecent).mockReturnValue(entries);

    const result = await client.readResource({ uri: 'paperwall://history/recent' });
    const parsed = JSON.parse(result.contents[0]!.text as string);
    expect(parsed.count).toBe(2);
    expect(parsed.entries[0].amountFormatted).toBe('0.05');
    expect(parsed.entries[1].amountFormatted).toBe('0.10');
    expect(parsed.entries[0].mode).toBe('client');
  });
});
