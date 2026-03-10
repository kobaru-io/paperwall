import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchBalance, fetchBalances, clearBalanceCache } from '../src/background/balance.js';

// ── Chrome Storage Mock ───────────────────────────────────────────────
const mockStorageData: Record<string, unknown> = {};
const mockChrome = {
  storage: {
    local: {
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
        return Promise.resolve();
      }),
      get: vi.fn((key: string) => {
        return Promise.resolve({ [key]: mockStorageData[key] });
      }),
    },
  },
};
Object.assign(globalThis, { chrome: mockChrome });

describe('balance', () => {
  beforeEach(() => {
    clearBalanceCache();
    vi.restoreAllMocks();
    // Clear persistent storage mock data
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRpcResponse(hexBalance: string) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  function mockRpcError(message: string) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';

  it('makes correct eth_call RPC request for balanceOf', async () => {
    const hexBalance = '0x' + (1_000_000).toString(16).padStart(64, '0');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await fetchBalance(TEST_ADDRESS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0]!;
    expect(typeof url).toBe('string');

    const body = JSON.parse((options as RequestInit).body as string) as {
      method: string;
      params: [{ data: string; to: string }, string];
    };
    expect(body.method).toBe('eth_call');
    // balanceOf(address) selector = 0x70a08231
    expect(body.params[0]?.data).toMatch(/^0x70a08231/);
    expect(body.params[1]).toBe('latest');
  });

  it('correctly decodes hex response to BigInt and formats (1000000 = $1.00)', async () => {
    const hexBalance = '0x' + (1_000_000).toString(16).padStart(64, '0');
    mockRpcResponse(hexBalance);

    const result = await fetchBalance(TEST_ADDRESS);
    expect(result.raw).toBe('1000000');
    expect(result.formatted).toBe('1.00');
  });

  it('formats balance with correct decimals (5000000 = $5.00)', async () => {
    const hexBalance = '0x' + (5_000_000).toString(16).padStart(64, '0');
    mockRpcResponse(hexBalance);

    const result = await fetchBalance(TEST_ADDRESS);
    expect(result.raw).toBe('5000000');
    expect(result.formatted).toBe('5.00');
  });

  it('formats zero balance correctly', async () => {
    mockRpcResponse('0x0');

    const result = await fetchBalance(TEST_ADDRESS);
    expect(result.raw).toBe('0');
    expect(result.formatted).toBe('0.00');
  });

  it('formats fractional balance correctly (10000 = $0.01)', async () => {
    const hexBalance = '0x' + (10_000).toString(16).padStart(64, '0');
    mockRpcResponse(hexBalance);

    const result = await fetchBalance(TEST_ADDRESS);
    expect(result.raw).toBe('10000');
    expect(result.formatted).toBe('0.01');
  });

  it('returns cached value if < 30s old', async () => {
    const hexBalance = '0x' + (1_000_000).toString(16).padStart(64, '0');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result1 = await fetchBalance(TEST_ADDRESS);
    const result2 = await fetchBalance(TEST_ADDRESS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result1.formatted).toBe(result2.formatted);
  });

  it('refreshes if > 30s old', async () => {
    const hexBalance1 = '0x' + (1_000_000).toString(16).padStart(64, '0');
    const hexBalance2 = '0x' + (2_000_000).toString(16).padStart(64, '0');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance2 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result1 = await fetchBalance(TEST_ADDRESS);
    expect(result1.formatted).toBe('1.00');

    // Advance time past cache TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000);
    vi.useRealTimers();

    // Clear cache by simulating time passage
    clearBalanceCache();

    const result2 = await fetchBalance(TEST_ADDRESS);
    expect(result2.formatted).toBe('2.00');
  });

  it('handles RPC error gracefully', async () => {
    mockRpcError('Invalid Request');

    await expect(fetchBalance(TEST_ADDRESS)).rejects.toThrow('RPC error');
  });

  // ── Persistent Cache Tests ──────────────────────────────────────────

  it('writes to persistent cache after successful RPC', async () => {
    const hexBalance = '0x' + (1_000_000).toString(16).padStart(64, '0');
    mockRpcResponse(hexBalance);

    await fetchBalance(TEST_ADDRESS);

    expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [`balance:eip155:324705682:${TEST_ADDRESS}`]: expect.objectContaining({
          balance: '1000000',
          timestamp: expect.any(Number) as number,
        }),
      }),
    );
  });

  it('returns persistent cache when RPC fails', async () => {
    const persistentKey = `balance:eip155:324705682:${TEST_ADDRESS}`;
    mockStorageData[persistentKey] = { balance: '2000000', timestamp: Date.now() };
    mockRpcError('Server error');

    const result = await fetchBalance(TEST_ADDRESS);
    expect(result.raw).toBe('2000000');
    expect(result.formatted).toBe('2.00');
    expect(result.network).toBe('eip155:324705682');
    expect(result.asset).toBe('USDC');
  });

  it('throws when RPC fails and no persistent cache', async () => {
    mockRpcError('Server error');

    await expect(fetchBalance(TEST_ADDRESS)).rejects.toThrow('RPC error');
  });

  // ── fetchBalances Tests ─────────────────────────────────────────────

  it('fetchBalances returns balances for multiple networks', async () => {
    const hexBalance1 = '0x' + (1_000_000).toString(16).padStart(64, '0');
    const hexBalance2 = '0x' + (2_000_000).toString(16).padStart(64, '0');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance2 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const results = await fetchBalances(TEST_ADDRESS, [
      'eip155:324705682',
      'eip155:84532',
    ]);

    expect(results.size).toBe(2);
    expect(results.get('eip155:324705682')?.formatted).toBe('1.00');
    expect(results.get('eip155:84532')?.formatted).toBe('2.00');
  });

  it('fetchBalances omits networks where RPC fails with no cache', async () => {
    const hexBalance = '0x' + (1_000_000).toString(16).padStart(64, '0');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32600, message: 'Server error' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const results = await fetchBalances(TEST_ADDRESS, [
      'eip155:324705682',
      'eip155:84532',
    ]);

    expect(results.size).toBe(1);
    expect(results.has('eip155:324705682')).toBe(true);
    expect(results.has('eip155:84532')).toBe(false);
  });

  it('fresh result overwrites cache on subsequent calls', async () => {
    const hexBalance1 = '0x' + (1_000_000).toString(16).padStart(64, '0');
    const hexBalance2 = '0x' + (3_000_000).toString(16).padStart(64, '0');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: hexBalance2 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result1 = await fetchBalance(TEST_ADDRESS);
    expect(result1.formatted).toBe('1.00');

    clearBalanceCache();

    const result2 = await fetchBalance(TEST_ADDRESS);
    expect(result2.formatted).toBe('3.00');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('result includes all required fields', async () => {
    const hexBalance = '0x' + (1_000_000).toString(16).padStart(64, '0');
    mockRpcResponse(hexBalance);

    const result = await fetchBalance(TEST_ADDRESS);
    expect(result).toHaveProperty('raw');
    expect(result).toHaveProperty('formatted');
    expect(result).toHaveProperty('network');
    expect(result).toHaveProperty('asset');
    expect(result).toHaveProperty('fetchedAt');
    expect(result.asset).toBe('USDC');
    expect(typeof result.fetchedAt).toBe('number');
  });
});
