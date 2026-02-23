import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Chrome Storage Mock ────────────────────────────────────────────

type StorageData = Record<string, unknown>;

function createStorageMock() {
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
    _getStore: () => store,
    _reset: () => { store = {}; },
  };
}

const localStorageMock = createStorageMock();

vi.stubGlobal('chrome', {
  storage: {
    local: localStorageMock,
  },
});

import { addPayment, getHistory, updatePaymentStatus, type PaymentRecord } from '../src/background/history.js';

// ── Tests ──────────────────────────────────────────────────────────

describe('history', () => {
  beforeEach(() => {
    localStorageMock._reset();
    vi.clearAllMocks();
  });

  function makeRecord(overrides?: Partial<PaymentRecord>): PaymentRecord {
    return {
      requestId: crypto.randomUUID(),
      origin: 'https://example.com',
      url: 'https://example.com/article',
      amount: '10000',
      formattedAmount: '0.01',
      network: 'eip155:324705682',
      asset: 'USDC',
      from: '0xsender',
      to: '0xreceiver',
      txHash: '0xdeadbeef',
      status: 'confirmed',
      timestamp: Date.now(),
      ...overrides,
    };
  }

  describe('addPayment', () => {
    it('appends a record to storage', async () => {
      const record = makeRecord();
      await addPayment(record);

      const store = localStorageMock._getStore();
      const records = store['paymentHistory'] as PaymentRecord[];
      expect(records).toHaveLength(1);
      expect(records[0]!.requestId).toBe(record.requestId);
    });

    it('prepends new records (most recent first)', async () => {
      const record1 = makeRecord({ requestId: 'first', timestamp: 1000 });
      const record2 = makeRecord({ requestId: 'second', timestamp: 2000 });

      await addPayment(record1);
      await addPayment(record2);

      const store = localStorageMock._getStore();
      const records = store['paymentHistory'] as PaymentRecord[];
      expect(records).toHaveLength(2);
      expect(records[0]!.requestId).toBe('second');
      expect(records[1]!.requestId).toBe('first');
    });
  });

  describe('getHistory', () => {
    it('returns most recent records with default limit', async () => {
      // Add 3 records
      for (let i = 0; i < 3; i++) {
        await addPayment(
          makeRecord({ requestId: `r-${i}`, timestamp: i * 1000 }),
        );
      }

      const result = await getHistory(10, 0);
      expect(result).toHaveLength(3);
      // Most recent first
      expect(result[0]!.requestId).toBe('r-2');
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await addPayment(makeRecord({ requestId: `r-${i}` }));
      }

      const result = await getHistory(2, 0);
      expect(result).toHaveLength(2);
    });

    it('respects offset parameter for pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await addPayment(
          makeRecord({ requestId: `r-${i}`, timestamp: i * 1000 }),
        );
      }

      const result = await getHistory(2, 2);
      expect(result).toHaveLength(2);
      // Records are [r-4, r-3, r-2, r-1, r-0] (most recent first)
      // offset 2, limit 2 should give [r-2, r-1]
      expect(result[0]!.requestId).toBe('r-2');
      expect(result[1]!.requestId).toBe('r-1');
    });

    it('returns empty array when no records', async () => {
      const result = await getHistory(10, 0);
      expect(result).toEqual([]);
    });
  });

  describe('updatePaymentStatus', () => {
    it('should store payment with pending status', async () => {
      await addPayment(makeRecord({ status: 'pending', txHash: '' }));
      const history = await getHistory();
      expect(history[0]!.status).toBe('pending');
    });

    it('should update payment status to confirmed', async () => {
      const record = makeRecord({ status: 'pending', txHash: '' });
      await addPayment(record);
      await updatePaymentStatus(record.requestId, 'confirmed', { txHash: '0xabc', settledAt: Date.now() });
      const history = await getHistory();
      expect(history[0]!.status).toBe('confirmed');
      expect(history[0]!.txHash).toBe('0xabc');
    });

    it('should update payment status to failed', async () => {
      const record = makeRecord({ status: 'pending', txHash: '' });
      await addPayment(record);
      await updatePaymentStatus(record.requestId, 'failed', { error: 'Settlement timeout' });
      const history = await getHistory();
      expect(history[0]!.status).toBe('failed');
      expect(history[0]!.error).toBe('Settlement timeout');
    });
  });

  describe('cap at 1000 records', () => {
    it('drops oldest records when cap is exceeded', async () => {
      // Pre-populate with 1000 records
      const records: PaymentRecord[] = [];
      for (let i = 0; i < 1000; i++) {
        records.push(
          makeRecord({ requestId: `old-${i}`, timestamp: i }),
        );
      }
      // Manually set storage to simulate full history
      await localStorageMock.set({ paymentHistory: records });

      // Add one more
      await addPayment(
        makeRecord({ requestId: 'newest', timestamp: 999999 }),
      );

      const store = localStorageMock._getStore();
      const storedRecords = store['paymentHistory'] as PaymentRecord[];
      expect(storedRecords).toHaveLength(1000);
      // Newest should be first
      expect(storedRecords[0]!.requestId).toBe('newest');
      // The very last original record (old-999) should have been dropped
      const hasDropped = storedRecords.some(
        (r) => r.requestId === 'old-999',
      );
      expect(hasDropped).toBe(false);
    });
  });
});
