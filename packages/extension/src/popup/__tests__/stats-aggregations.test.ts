// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  filterByDays,
  sumAmountFormatted,
  groupByDay,
  topSites,
  groupByMonth,
} from '../screens/stats.js';
import type { PaymentRecord } from '../../background/history.js';

function rec(origin: string, amount: string, daysAgo: number): PaymentRecord {
  return {
    requestId: Math.random().toString(),
    origin,
    url: `https://${origin}/article`,
    amount,
    formattedAmount: (Number(amount) / 1_000_000).toFixed(6),
    network: 'eip155:324705682',
    asset: '0x0',
    from: '0xA',
    to: '0xB',
    txHash: '0x0',
    status: 'confirmed',
    timestamp: Date.now() - daysAgo * 86_400_000,
  };
}

describe('filterByDays', () => {
  it('returns records within the window', () => {
    const records = [rec('a.com', '100', 5), rec('b.com', '200', 35)];
    expect(filterByDays(records, 30)).toHaveLength(1);
  });

  it('returns all records when all are within window', () => {
    const records = [rec('a.com', '100', 1), rec('b.com', '200', 7)];
    expect(filterByDays(records, 30)).toHaveLength(2);
  });
});

describe('sumAmountFormatted', () => {
  it('sums amounts using BigInt precision', () => {
    const records = [rec('a.com', '1000000', 1), rec('b.com', '500000', 1)];
    expect(sumAmountFormatted(records)).toBe('1.500000');
  });

  it('returns zero string for empty array', () => {
    expect(sumAmountFormatted([])).toBe('0.000000');
  });
});

describe('topSites', () => {
  it('returns sites sorted by total spend descending', () => {
    const records = [
      rec('cheap.com', '100000', 1),
      rec('expensive.com', '500000', 1),
      rec('expensive.com', '300000', 1),
    ];
    const result = topSites(records, 5);
    expect(result[0]?.origin).toBe('expensive.com');
    expect(result[1]?.origin).toBe('cheap.com');
  });

  it('respects the limit parameter', () => {
    const records = [
      rec('a.com', '100', 1), rec('b.com', '200', 1),
      rec('c.com', '300', 1), rec('d.com', '400', 1),
    ];
    expect(topSites(records, 2)).toHaveLength(2);
  });

  it('counts payments per site', () => {
    const records = [rec('a.com', '100', 1), rec('a.com', '200', 1)];
    expect(topSites(records, 5)[0]?.count).toBe(2);
  });
});

describe('groupByMonth', () => {
  it('groups records by calendar month', () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const records = [rec('a.com', '100000', 1)];
    const result = groupByMonth(records, 6);
    const thisMonthEntry = result.find((r) => r.month === thisMonth);
    expect(thisMonthEntry).toBeDefined();
    expect(thisMonthEntry?.count).toBe(1);
  });
});

describe('groupByDay', () => {
  it('returns exactly N buckets for N days', () => {
    expect(groupByDay([], 7)).toHaveLength(7);
    expect(groupByDay([], 30)).toHaveLength(30);
  });

  it('accumulates amounts for records on the same day', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const records = [
      rec('a.com', '100000', 0),
      rec('b.com', '200000', 0),
    ];
    const result = groupByDay(records, 7);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayBucket = result.find((r) => r.date === todayKey);
    expect(todayBucket?.totalMicro).toBe(300000n);
  });

  it('excludes records outside the window', () => {
    const records = [rec('a.com', '100000', 40)]; // 40 days ago
    const result = groupByDay(records, 7);
    const total = result.reduce((acc, r) => acc + r.totalMicro, 0n);
    expect(total).toBe(0n);
  });
});
