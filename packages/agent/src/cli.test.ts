import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildProgram } from './cli.js';
import { bigintReplacer, outputJson } from './output.js';
import { appendPayment } from './history.js';

describe('CLI', () => {
  let originalHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-cli-test-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('wallet create', () => {
    it('should create a wallet and output JSON with address', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync(['node', 'test', 'wallet', 'create']);

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const output = JSON.parse(logs[0] as string) as { ok: boolean; address: string; network: string; storagePath: string };
      expect(output.ok).toBe(true);
      expect(output.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(output.network).toBe('eip155:324705682');
      expect(output.storagePath).toContain('wallet.json');
    });

    it('should accept custom network', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync([
        'node', 'test', 'wallet', 'create',
        '--network', 'eip155:1187947933',
      ]);

      const output = JSON.parse(logs[0] as string) as { network: string };
      expect(output.network).toBe('eip155:1187947933');
    });
  });

  describe('wallet import', () => {
    it('should import a private key and output JSON with address', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync([
        'node', 'test', 'wallet', 'import',
        '--key', '0x' + 'a'.repeat(64),
      ]);

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const output = JSON.parse(logs[0] as string) as { ok: boolean; address: string; network: string; storagePath: string };
      expect(output.ok).toBe(true);
      expect(output.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(output.network).toBe('eip155:324705682');
      expect(output.storagePath).toContain('wallet.json');
    });

    it('should accept custom network on import', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync([
        'node', 'test', 'wallet', 'import',
        '--key', '0x' + 'b'.repeat(64),
        '--network', 'eip155:1187947933',
      ]);

      const output = JSON.parse(logs[0] as string) as { network: string };
      expect(output.network).toBe('eip155:1187947933');
    });

    it('should error on invalid key', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });
      vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const program = buildProgram();
      await program.parseAsync([
        'node', 'test', 'wallet', 'import',
        '--key', '0xbadkey',
      ]);

      const output = JSON.parse(logs[0] as string) as { ok: boolean; error: string };
      expect(output.ok).toBe(false);
      expect(output.error).toBe('wallet_import_failed');
    });
  });

  describe('wallet address', () => {
    it('should output wallet address as JSON', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      // First create a wallet
      const program1 = buildProgram();
      await program1.parseAsync(['node', 'test', 'wallet', 'create']);

      logs.length = 0;

      // Then get address
      const program2 = buildProgram();
      await program2.parseAsync(['node', 'test', 'wallet', 'address']);

      const output = JSON.parse(logs[0] as string) as { ok: boolean; address: string };
      expect(output.ok).toBe(true);
      expect(output.address).toMatch(/^0x/);
    });
  });

  describe('wallet balance', () => {
    it('should output balance as JSON', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      // Create wallet first
      const program1 = buildProgram();
      await program1.parseAsync(['node', 'test', 'wallet', 'create']);
      logs.length = 0;

      // Mock RPC response
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x4c4b40' }), // 5000000 = 5 USDC
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const program2 = buildProgram();
      await program2.parseAsync(['node', 'test', 'wallet', 'balance']);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        balance: string;
        balanceFormatted: string;
        asset: string;
      };
      expect(output.ok).toBe(true);
      expect(output.balance).toBe('5000000');
      expect(output.balanceFormatted).toBe('5.00');
      expect(output.asset).toBe('USDC');
    });
  });

  describe('budget set', () => {
    it('should output JSON with budget config matching API spec', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync([
        'node', 'test', 'budget', 'set',
        '--daily', '5.00',
        '--total', '50.00',
      ]);

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        budget: { dailyMax: string; totalMax: string };
      };
      expect(output.ok).toBe(true);
      expect(output.budget.dailyMax).toBe('5.00');
      expect(output.budget.totalMax).toBe('50.00');
    });

    it('should set per-request limit', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync([
        'node', 'test', 'budget', 'set',
        '--per-request', '1.00',
      ]);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        budget: { perRequestMax: string };
      };
      expect(output.ok).toBe(true);
      expect(output.budget.perRequestMax).toBe('1.00');
    });

    it('should merge with existing budget on subsequent calls', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program1 = buildProgram();
      await program1.parseAsync([
        'node', 'test', 'budget', 'set',
        '--per-request', '1.00',
      ]);

      logs.length = 0;

      const program2 = buildProgram();
      await program2.parseAsync([
        'node', 'test', 'budget', 'set',
        '--daily', '5.00',
        '--total', '50.00',
      ]);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        budget: { perRequestMax: string; dailyMax: string; totalMax: string };
      };
      expect(output.ok).toBe(true);
      expect(output.budget.perRequestMax).toBe('1.00');
      expect(output.budget.dailyMax).toBe('5.00');
      expect(output.budget.totalMax).toBe('50.00');
    });
  });

  describe('budget status', () => {
    it('should output status JSON matching API spec format', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      // Set budget
      const program1 = buildProgram();
      await program1.parseAsync([
        'node', 'test', 'budget', 'set',
        '--per-request', '1.00',
        '--daily', '5.00',
        '--total', '50.00',
      ]);

      // Add a payment for today
      appendPayment({
        ts: new Date().toISOString(),
        url: 'https://example.com/article',
        amount: '450000', // 0.45 USDC
        asset: 'USDC',
        network: 'eip155:324705682',
        txHash: '0xabc',
        mode: 'client',
      });

      // Add an older payment (counts for lifetime only)
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      appendPayment({
        ts: yesterday.toISOString(),
        url: 'https://example.com/old',
        amount: '11850000', // 11.85 USDC
        asset: 'USDC',
        network: 'eip155:324705682',
        txHash: '0xdef',
        mode: 'client',
      });

      logs.length = 0;

      const program2 = buildProgram();
      await program2.parseAsync(['node', 'test', 'budget', 'status']);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        budget: { perRequestMax: string; dailyMax: string; totalMax: string };
        spent: { today: string; total: string; transactionCount: number };
        remaining: { daily: string; total: string };
      };

      expect(output.ok).toBe(true);
      expect(output.budget.perRequestMax).toBe('1.00');
      expect(output.budget.dailyMax).toBe('5.00');
      expect(output.budget.totalMax).toBe('50.00');
      expect(output.spent.today).toBe('0.45');
      expect(output.spent.total).toBe('12.30');
      expect(output.spent.transactionCount).toBe(2);
      expect(output.remaining.daily).toBe('4.55');
      expect(output.remaining.total).toBe('37.70');
    });

    it('should handle no budget configured', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync(['node', 'test', 'budget', 'status']);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        error: string;
      };
      expect(output.ok).toBe(false);
      expect(output.error).toBe('no_budget');
    });
  });

  describe('history', () => {
    it('should output history entries matching API spec format', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      // Add some payments
      appendPayment({
        ts: '2026-02-11T10:00:00.000Z',
        url: 'https://example.com/article1',
        amount: '10000',
        asset: 'USDC',
        network: 'eip155:324705682',
        txHash: '0xaaa',
        mode: 'client',
      });
      appendPayment({
        ts: '2026-02-11T11:00:00.000Z',
        url: 'https://example.com/article2',
        amount: '20000',
        asset: 'USDC',
        network: 'eip155:324705682',
        txHash: '0xbbb',
        mode: 'server',
      });

      const program = buildProgram();
      await program.parseAsync(['node', 'test', 'history']);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        payments: Array<{
          timestamp: string;
          url: string;
          amount: string;
          amountFormatted: string;
          asset: string;
          network: string;
          txHash: string;
          mode: string;
        }>;
        total: number;
      };

      expect(output.ok).toBe(true);
      expect(output.payments).toHaveLength(2);
      expect(output.total).toBe(2);

      // Check first payment matches API spec format
      const first = output.payments[0];
      expect(first?.timestamp).toBe('2026-02-11T10:00:00.000Z');
      expect(first?.url).toBe('https://example.com/article1');
      expect(first?.amount).toBe('10000');
      expect(first?.amountFormatted).toBe('0.01');
      expect(first?.asset).toBe('USDC');
      expect(first?.network).toBe('eip155:324705682');
      expect(first?.txHash).toBe('0xaaa');
      expect(first?.mode).toBe('client');
    });

    it('should respect --last flag', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      for (let i = 0; i < 5; i++) {
        appendPayment({
          ts: `2026-02-11T1${i}:00:00.000Z`,
          url: `https://example.com/article${i}`,
          amount: String((i + 1) * 10000),
          asset: 'USDC',
          network: 'eip155:324705682',
          txHash: `0x${i}`,
          mode: 'client',
        });
      }

      const program = buildProgram();
      await program.parseAsync(['node', 'test', 'history', '--last', '2']);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        payments: Array<{ amount: string }>;
        total: number;
      };

      expect(output.ok).toBe(true);
      expect(output.payments).toHaveLength(2);
      expect(output.total).toBe(5);
      // Should be last 2 entries
      expect(output.payments[0]?.amount).toBe('40000');
      expect(output.payments[1]?.amount).toBe('50000');
    });

    it('should output empty array when no history', async () => {
      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const program = buildProgram();
      await program.parseAsync(['node', 'test', 'history']);

      const output = JSON.parse(logs[0] as string) as {
        ok: boolean;
        payments: unknown[];
        total: number;
      };

      expect(output.ok).toBe(true);
      expect(output.payments).toEqual([]);
      expect(output.total).toBe(0);
    });
  });
});

describe('output helpers', () => {
  describe('bigintReplacer', () => {
    it('should convert BigInt to string in JSON', () => {
      const data = { value: 5000000n, name: 'test' };
      const json = JSON.stringify(data, bigintReplacer);
      const parsed = JSON.parse(json) as { value: string; name: string };
      expect(parsed.value).toBe('5000000');
      expect(parsed.name).toBe('test');
    });

    it('should handle nested BigInts', () => {
      const data = { outer: { inner: 123n } };
      const json = JSON.stringify(data, bigintReplacer);
      const parsed = JSON.parse(json) as { outer: { inner: string } };
      expect(parsed.outer.inner).toBe('123');
    });
  });
});
