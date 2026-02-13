import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  appendPayment,
  getRecent,
  getTodayTotal,
  getLifetimeTotal,
} from './history.js';

import type { HistoryEntry } from './history.js';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    ts: '2026-02-11T10:00:00.000Z',
    url: 'https://example.com/article',
    amount: '10000',
    asset: 'USDC',
    network: 'eip155:324705682',
    txHash: '0xabc123',
    mode: 'client',
    ...overrides,
  };
}

describe('history', () => {
  let originalHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-history-test-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('appendPayment', () => {
    it('should append a payment entry to history file', () => {
      const entry = makeEntry();
      appendPayment(entry);

      const filePath = path.join(tmpDir, '.paperwall', 'history.jsonl');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim()) as HistoryEntry;
      expect(parsed.ts).toBe('2026-02-11T10:00:00.000Z');
      expect(parsed.amount).toBe('10000');
      expect(parsed.txHash).toBe('0xabc123');
    });

    it('should append multiple entries as separate lines', () => {
      appendPayment(makeEntry({ amount: '10000' }));
      appendPayment(makeEntry({ amount: '20000' }));
      appendPayment(makeEntry({ amount: '30000' }));

      const filePath = path.join(tmpDir, '.paperwall', 'history.jsonl');
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim().length > 0);
      expect(lines).toHaveLength(3);
    });
  });

  describe('getRecent', () => {
    it('should return empty array when no history file exists', () => {
      const entries = getRecent();
      expect(entries).toEqual([]);
    });

    it('should return last 20 entries by default', () => {
      for (let i = 0; i < 25; i++) {
        appendPayment(makeEntry({ amount: String(i * 1000) }));
      }

      const entries = getRecent();
      expect(entries).toHaveLength(20);
      // Should be the LAST 20 entries (indices 5-24)
      expect(entries[0]?.amount).toBe('5000');
      expect(entries[19]?.amount).toBe('24000');
    });

    it('should return last N entries when count specified', () => {
      for (let i = 0; i < 10; i++) {
        appendPayment(makeEntry({ amount: String(i * 1000) }));
      }

      const entries = getRecent(3);
      expect(entries).toHaveLength(3);
      expect(entries[0]?.amount).toBe('7000');
      expect(entries[2]?.amount).toBe('9000');
    });

    it('should return all entries if count exceeds total', () => {
      appendPayment(makeEntry({ amount: '10000' }));
      appendPayment(makeEntry({ amount: '20000' }));

      const entries = getRecent(50);
      expect(entries).toHaveLength(2);
    });
  });

  describe('getTodayTotal', () => {
    it('should return "0" when no history exists', () => {
      const total = getTodayTotal();
      expect(total).toBe('0');
    });

    it('should sum amounts from today only (UTC)', () => {
      const today = new Date();
      const todayStr = today.toISOString();
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString();

      appendPayment(makeEntry({ ts: todayStr, amount: '10000' }));
      appendPayment(makeEntry({ ts: todayStr, amount: '20000' }));
      appendPayment(makeEntry({ ts: yesterdayStr, amount: '50000' }));

      const total = getTodayTotal();
      expect(total).toBe('30000');
    });

    it('should handle entries at midnight boundary', () => {
      // Entry at start of today UTC
      const todayMidnight = new Date();
      todayMidnight.setUTCHours(0, 0, 0, 0);

      // Entry at end of yesterday UTC
      const yesterdayEnd = new Date(todayMidnight.getTime() - 1);

      appendPayment(makeEntry({ ts: todayMidnight.toISOString(), amount: '10000' }));
      appendPayment(makeEntry({ ts: yesterdayEnd.toISOString(), amount: '50000' }));

      const total = getTodayTotal();
      expect(total).toBe('10000');
    });

    it('should return "0" when all entries are from other days', () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      appendPayment(makeEntry({ ts: yesterday.toISOString(), amount: '10000' }));
      appendPayment(makeEntry({ ts: yesterday.toISOString(), amount: '20000' }));

      const total = getTodayTotal();
      expect(total).toBe('0');
    });
  });

  describe('getLifetimeTotal', () => {
    it('should return "0" when no history exists', () => {
      const total = getLifetimeTotal();
      expect(total).toBe('0');
    });

    it('should sum all amounts regardless of date', () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      appendPayment(makeEntry({ ts: new Date().toISOString(), amount: '10000' }));
      appendPayment(makeEntry({ ts: yesterday.toISOString(), amount: '20000' }));
      appendPayment(makeEntry({ ts: '2025-01-01T00:00:00.000Z', amount: '30000' }));

      const total = getLifetimeTotal();
      expect(total).toBe('60000');
    });

    it('should handle large amounts without overflow', () => {
      // 50 USDC = 50,000,000 smallest units
      appendPayment(makeEntry({ amount: '50000000' }));
      appendPayment(makeEntry({ amount: '50000000' }));

      const total = getLifetimeTotal();
      expect(total).toBe('100000000');
    });
  });

  describe('round-trip', () => {
    it('should correctly round-trip append and read', () => {
      const entry = makeEntry({
        ts: '2026-02-11T15:30:00.000Z',
        url: 'https://special.example.com/path?query=1',
        amount: '12345',
        txHash: '0xdeadbeef',
        mode: 'server',
      });

      appendPayment(entry);
      const entries = getRecent(1);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });
  });
});
