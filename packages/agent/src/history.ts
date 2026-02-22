import { appendJsonlFile, readJsonlFile } from './storage.js';

const HISTORY_FILENAME = 'history.jsonl';
const DEFAULT_RECENT_COUNT = 20;

export interface HistoryEntry {
  readonly ts: string;
  readonly url: string;
  readonly amount: string;
  readonly asset: string;
  readonly network: string;
  readonly txHash: string;
  readonly mode: 'client' | 'server' | '402';
}

/**
 * Append a payment entry to history.jsonl.
 */
export function appendPayment(entry: HistoryEntry): void {
  appendJsonlFile(HISTORY_FILENAME, entry);
}

/**
 * Read recent history entries, returning the last N (default 20).
 */
export function getRecent(count?: number): HistoryEntry[] {
  const entries = readJsonlFile<HistoryEntry>(HISTORY_FILENAME);
  const n = count ?? DEFAULT_RECENT_COUNT;

  if (entries.length <= n) {
    return entries;
  }

  return entries.slice(entries.length - n);
}

/**
 * Read history once and return both today's total and lifetime total.
 * Both values are in smallest units as strings.
 */
export function getSpendingTotals(): { today: string; lifetime: string; count: number } {
  const entries = readJsonlFile<HistoryEntry>(HISTORY_FILENAME);

  const now = new Date();
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0,
  ));

  let todayTotal = 0n;
  let lifetimeTotal = 0n;

  for (const entry of entries) {
    const amount = BigInt(entry.amount);
    lifetimeTotal += amount;
    const entryDate = new Date(entry.ts);
    if (entryDate.getTime() >= todayStart.getTime()) {
      todayTotal += amount;
    }
  }

  return {
    today: todayTotal.toString(),
    lifetime: lifetimeTotal.toString(),
    count: entries.length,
  };
}

/**
 * Sum all payment amounts where ts falls on today's date (UTC).
 * Returns the total in smallest units as a string.
 */
export function getTodayTotal(): string {
  return getSpendingTotals().today;
}

/**
 * Sum all payment amounts ever recorded.
 * Returns the total in smallest units as a string.
 */
export function getLifetimeTotal(): string {
  return getSpendingTotals().lifetime;
}
