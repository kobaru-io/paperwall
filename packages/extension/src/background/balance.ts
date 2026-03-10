import { getNetwork, DEFAULT_NETWORK } from '../shared/constants.js';
import { formatUsdc } from '../shared/format.js';

export interface BalanceResult {
  readonly raw: string;
  readonly formatted: string;
  readonly network: string;
  readonly asset: string;
  readonly fetchedAt: number;
}

// ── Persistent Cache ────────────────────────────────────────────────

interface PersistentCacheEntry {
  balance: string;
  timestamp: number;
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

// ── Persistent Cache Helpers ────────────────────────────────────────

function persistentCacheKey(network: string, address: string): string {
  return `balance:${network}:${address}`;
}

function writePersistentCache(
  network: string,
  address: string,
  balance: string,
  timestamp: number,
): void {
  const key = persistentCacheKey(network, address);
  const entry: PersistentCacheEntry = { balance, timestamp };
  void chrome.storage.local.set({ [key]: entry });
}

async function readPersistentCache(
  network: string,
  address: string,
): Promise<PersistentCacheEntry | undefined> {
  const key = persistentCacheKey(network, address);
  const stored: Record<string, unknown> = await chrome.storage.local.get(key);
  const raw = stored[key];
  if (
    raw !== null &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>)['balance'] === 'string' &&
    typeof (raw as Record<string, unknown>)['timestamp'] === 'number'
  ) {
    return raw as PersistentCacheEntry;
  }
  return undefined;
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
    // Try persistent cache as fallback
    const entry = await readPersistentCache(network, address);
    if (entry) {
      const cachedBalance = BigInt(entry.balance);
      const result: BalanceResult = {
        raw: entry.balance,
        formatted: formatUsdc(cachedBalance),
        network,
        asset: 'USDC',
        fetchedAt: entry.timestamp,
      };
      balanceCache.set(cacheKey, { result, timestamp: entry.timestamp });
      return result;
    }
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
  writePersistentCache(network, address, balance.toString(), now);

  return result;
}

// ── Multi-Network Balance Fetching ──────────────────────────────────

export async function fetchBalances(
  address: string,
  networks: string[],
): Promise<Map<string, BalanceResult>> {
  const results = new Map<string, BalanceResult>();
  const settlements = await Promise.allSettled(
    networks.map((network) => fetchBalance(address, network)),
  );

  for (let i = 0; i < networks.length; i++) {
    const settlement = settlements[i];
    if (settlement && settlement.status === 'fulfilled') {
      const network = networks[i];
      if (network) {
        results.set(network, settlement.value);
      }
    }
  }

  return results;
}

// Formatting functions moved to shared/format.ts
