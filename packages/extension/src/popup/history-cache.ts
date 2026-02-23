import type { PaymentRecord } from '../background/history.js';

// ── Internal State ─────────────────────────────────────────────────

let cache: readonly PaymentRecord[] | null = null;
// TODO(review): concurrent callers before first resolution both pass the null-check.
// Storing the pending promise ensures exactly one GET_HISTORY is sent. (code-reviewer, 2026-02-23, Low)
let pending: Promise<readonly PaymentRecord[]> | null = null;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Loads full payment history once per popup session.
 * Subsequent calls return the cached array without re-fetching.
 * Concurrent calls share a single in-flight request.
 */
export async function loadHistoryCache(): Promise<readonly PaymentRecord[]> {
  if (cache !== null) return cache;
  if (pending !== null) return pending;

  pending = (async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_HISTORY',
        limit: 1000,
        offset: 0,
      });

      if (response.success === true && Array.isArray(response.records)) {
        cache = response.records as PaymentRecord[];
      } else {
        cache = [];
      }
    } catch {
      cache = [];
    }
    pending = null;
    return cache!;
  })();

  return pending;
}

/**
 * Clears the in-memory cache. Used in tests and after wallet import.
 */
export function clearHistoryCache(): void {
  cache = null;
  pending = null;
}
