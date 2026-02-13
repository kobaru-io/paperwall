import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createWallet, getBalance } from './wallet.js';

describe('getBalance', () => {
  let originalHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-balance-test-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should parse hex RPC response into balance', async () => {
    await createWallet();

    // Mock fetch to return a known balance: 5000000 (5 USDC)
    const hexBalance = '0x' + (5_000_000).toString(16).padStart(64, '0');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getBalance();
    expect(result.balance).toBe('5000000');
    expect(result.balanceFormatted).toBe('5.00');
    expect(result.asset).toBe('USDC');
    expect(result.network).toBe('eip155:324705682');
  });

  it('should handle zero balance', async () => {
    await createWallet();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getBalance();
    expect(result.balance).toBe('0');
    expect(result.balanceFormatted).toBe('0.00');
  });

  it('should format fractional USDC correctly', async () => {
    await createWallet();

    // 10000 = 0.01 USDC
    const hexBalance = '0x' + (10_000).toString(16).padStart(64, '0');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getBalance();
    expect(result.balance).toBe('10000');
    expect(result.balanceFormatted).toBe('0.01');
  });

  it('should format large balance correctly', async () => {
    await createWallet();

    // 1234567890 = 1234.56789 USDC
    const hexBalance = '0x' + (1_234_567_890).toString(16).padStart(64, '0');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getBalance();
    expect(result.balance).toBe('1234567890');
    expect(result.balanceFormatted).toBe('1234.56789');
  });

  it('should use specified network override', async () => {
    await createWallet();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getBalance('eip155:1187947933');
    expect(result.network).toBe('eip155:1187947933');
  });

  it('should build correct ABI call data', async () => {
    await createWallet();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await getBalance();

    const [, fetchOptions] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOptions.body as string) as {
      method: string;
      params: [{ data: string }, string];
    };
    expect(body.method).toBe('eth_call');
    // data should start with balanceOf selector
    expect(body.params[0]?.data).toMatch(/^0x70a08231/);
    expect(body.params[1]).toBe('latest');
  });

  it('should throw when no wallet exists', async () => {
    await expect(getBalance()).rejects.toThrow('No wallet configured');
  });

  it('should throw on RPC error', async () => {
    await createWallet();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: 'Invalid Request' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(getBalance()).rejects.toThrow('RPC error');
  });

  it('should include address in result', async () => {
    const created = await createWallet();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getBalance();
    expect(result.address).toBe(created.address);
  });
});
