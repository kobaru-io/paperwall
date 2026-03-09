import { vi } from 'vitest';

// ── Shared Storage Mock ───────────────────────────────────────────────
// Canonical implementation shared across all extension test files to avoid
// copy-paste duplication across message-router.test.ts, payment-flow.test.ts,
// x402-compliance.test.ts, and src/background/__tests__/export-import.test.ts.

type StorageData = Record<string, unknown>;

export function createStorageMock() {
  let store: StorageData = {};
  return {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (!keys || keys === null) return { ...store };
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      const result: StorageData = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (items: StorageData) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = typeof keys === 'string' ? [keys] : keys;
      for (const k of arr) delete store[k];
    }),
    clear: vi.fn(async () => { store = {}; }),
    _getStore: () => store,
    _reset: () => { store = {}; },
  };
}
