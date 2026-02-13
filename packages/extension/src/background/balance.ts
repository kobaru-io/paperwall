import { getNetwork, DEFAULT_NETWORK } from '../shared/constants.js';
import { formatUsdc } from '../shared/format.js';

export interface BalanceResult {
  readonly raw: string;
  readonly formatted: string;
  readonly network: string;
  readonly asset: string;
  readonly fetchedAt: number;
}

// ── In-Memory Cache ─────────────────────────────────────────────────

interface CacheEntry {
  result: BalanceResult;
  timestamp: number;
}

const CACHE_TTL_MS = 30_000;
const balanceCache = new Map<string, CacheEntry>();

export function clearBalanceCache(): void {
  balanceCache.clear();
}

// ── Balance Fetching ────────────────────────────────────────────────

export async function fetchBalance(
  address: string,
  network: string = DEFAULT_NETWORK,
): Promise<BalanceResult> {
  const cacheKey = `${network}:${address}`;
  const cached = balanceCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const networkConfig = getNetwork(network);

  // ABI-encode balanceOf(address): selector 0x70a08231 + address padded to 32 bytes
  const addressWithoutPrefix = address.toLowerCase().replace('0x', '');
  const paddedAddress = addressWithoutPrefix.padStart(64, '0');
  const callData = `0x70a08231${paddedAddress}`;

  const response = await fetch(networkConfig.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: networkConfig.usdcAddress,
          data: callData,
        },
        'latest',
      ],
    }),
  });

  const json = (await response.json()) as {
    result?: string;
    error?: { message: string };
  };

  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }

  const hexBalance = json.result;
  const balance =
    !hexBalance || hexBalance === '0x' ? 0n : BigInt(hexBalance);
  const formatted = formatUsdc(balance);
  const now = Date.now();

  const result: BalanceResult = {
    raw: balance.toString(),
    formatted,
    network,
    asset: 'USDC',
    fetchedAt: now,
  };

  balanceCache.set(cacheKey, { result, timestamp: now });

  return result;
}

// Formatting functions moved to shared/format.ts
