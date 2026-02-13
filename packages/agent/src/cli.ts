import { Command } from 'commander';
import { createWallet, importWallet, getAddress, getBalance } from './wallet.js';
import { setBudget, getBudget, smallestToUsdc, usdcToSmallest } from './budget.js';
import { getRecent, getTodayTotal, getLifetimeTotal } from './history.js';
import { readJsonlFile } from './storage.js';
import { outputJson, outputError } from './output.js';
import { fetchWithPayment } from './payment-engine.js';

import type { HistoryEntry } from './history.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('paperwall')
    .version('0.1.0')
    .description('Paperwall agent CLI — x402 payment wallet for AI agents');

  // ── Wallet commands ──────────────────────────────────────────

  const wallet = program
    .command('wallet')
    .description('Wallet management commands');

  wallet
    .command('create')
    .description('Generate a new machine-bound encrypted wallet')
    .option('-n, --network <caip2>', 'Default network (CAIP-2)', 'eip155:324705682')
    .option('-f, --force', 'Overwrite existing wallet')
    .action(async (options: { network: string; force?: boolean }) => {
      try {
        const result = await createWallet({ network: options.network, force: options.force });
        outputJson({
          ok: true,
          address: result.address,
          network: result.network,
          storagePath: result.storagePath,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        outputError('wallet_create_failed', message, 1);
      }
    });

  wallet
    .command('import')
    .description('Import an existing private key with machine-bound encryption')
    .requiredOption('-k, --key <hex>', 'Private key (0x-prefixed hex)')
    .option('-n, --network <caip2>', 'Default network (CAIP-2)', 'eip155:324705682')
    .option('-f, --force', 'Overwrite existing wallet')
    .action(async (options: { key: string; network: string; force?: boolean }) => {
      try {
        const result = await importWallet(options.key, { network: options.network, force: options.force });
        outputJson({
          ok: true,
          address: result.address,
          network: result.network,
          storagePath: result.storagePath,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        outputError('wallet_import_failed', message, 1);
      }
    });

  wallet
    .command('balance')
    .description('Show USDC balance')
    .option('-n, --network <caip2>', 'Query specific network')
    .action(async (options: { network?: string }) => {
      try {
        const result = await getBalance(options.network);
        outputJson({
          ok: true,
          address: result.address,
          balance: result.balance,
          balanceFormatted: result.balanceFormatted,
          asset: result.asset,
          network: result.network,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('No wallet configured')) {
          outputError('no_wallet', message, 3);
        } else {
          outputError('balance_error', message, 1);
        }
      }
    });

  wallet
    .command('address')
    .description('Show wallet public address')
    .action(async () => {
      try {
        const address = await getAddress();
        outputJson({ ok: true, address });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('No wallet configured')) {
          outputError('no_wallet', message, 3);
        } else {
          outputError('address_error', message, 1);
        }
      }
    });

  // ── Budget commands ──────────────────────────────────────────

  const budget = program
    .command('budget')
    .description('Budget management commands');

  budget
    .command('set')
    .description('Set spending limits')
    .option('--per-request <amount>', 'Max USDC per single payment')
    .option('--daily <amount>', 'Max USDC per UTC calendar day')
    .option('--total <amount>', 'Lifetime max USDC')
    .action((options: { perRequest?: string; daily?: string; total?: string }) => {
      try {
        const partial: Record<string, string> = {};

        if (options.perRequest) {
          partial['perRequestMax'] = options.perRequest;
        }
        if (options.daily) {
          partial['dailyMax'] = options.daily;
        }
        if (options.total) {
          partial['totalMax'] = options.total;
        }

        if (Object.keys(partial).length === 0) {
          outputError('invalid_args', 'At least one limit must be provided: --per-request, --daily, or --total', 1);
          return;
        }

        const result = setBudget(partial);
        outputJson({ ok: true, budget: result });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        outputError('budget_set_failed', message, 1);
      }
    });

  budget
    .command('status')
    .description('Show budget status and spending summary')
    .action(() => {
      try {
        const budgetConfig = getBudget();

        if (!budgetConfig) {
          outputJson({
            ok: false,
            error: 'no_budget',
            message: 'No budget configured. Run: paperwall budget set',
          });
          return;
        }

        const todaySmallest = getTodayTotal();
        const lifetimeSmallest = getLifetimeTotal();
        const allEntries = readJsonlFile<HistoryEntry>('history.jsonl');

        const todayUsdc = smallestToUsdc(todaySmallest);
        const totalUsdc = smallestToUsdc(lifetimeSmallest);

        // Compute remaining for daily and total (if configured)
        const dailyRemaining = budgetConfig.dailyMax
          ? smallestToUsdc(
              (BigInt(usdcToSmallest(budgetConfig.dailyMax)) - BigInt(todaySmallest)).toString(),
            )
          : undefined;

        const totalRemaining = budgetConfig.totalMax
          ? smallestToUsdc(
              (BigInt(usdcToSmallest(budgetConfig.totalMax)) - BigInt(lifetimeSmallest)).toString(),
            )
          : undefined;

        outputJson({
          ok: true,
          budget: budgetConfig,
          spent: {
            today: todayUsdc,
            total: totalUsdc,
            transactionCount: allEntries.length,
          },
          remaining: {
            daily: dailyRemaining ?? '0.00',
            total: totalRemaining ?? '0.00',
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        outputError('budget_status_failed', message, 1);
      }
    });

  // ── History command ──────────────────────────────────────────

  program
    .command('history')
    .description('Show payment history')
    .option('--last <count>', 'Show only last N entries', '20')
    .action((options: { last: string }) => {
      try {
        const count = parseInt(options.last, 10);
        const allEntries = readJsonlFile<HistoryEntry>('history.jsonl');
        const entries = getRecent(count);

        const payments = entries.map((entry) => ({
          timestamp: entry.ts,
          url: entry.url,
          amount: entry.amount,
          amountFormatted: smallestToUsdc(entry.amount),
          asset: entry.asset,
          network: entry.network,
          txHash: entry.txHash,
          mode: entry.mode,
        }));

        outputJson({
          ok: true,
          payments,
          total: allEntries.length,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        outputError('history_error', message, 1);
      }
    });

  // ── Fetch command ───────────────────────────────────────────

  program
    .command('fetch')
    .description('Fetch URL with automatic x402 payment handling')
    .argument('<url>', 'URL to fetch (http:// or https://)')
    .option('-m, --max-price <amount>', 'Maximum USDC to pay per request')
    .option('-n, --network <caip2>', 'Force specific network (CAIP-2)')
    .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
    .action(async (url: string, options: { maxPrice?: string; network?: string; timeout: string }) => {
      try {
        const result = await fetchWithPayment(url, {
          maxPrice: options.maxPrice,
          network: options.network,
          timeout: parseInt(options.timeout, 10),
        });

        if (result.ok) {
          outputJson(result);
        } else {
          // Determine exit code based on error type
          const exitCode = getExitCode(result.error);
          outputJson(result);
          if (exitCode !== 0) {
            process.exitCode = exitCode;
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        outputError('unexpected_error', message, 1);
      }
    });

  // ── Serve command (A2A server) ────────────────────────────────

  program
    .command('serve')
    .description('Start A2A server for agent-to-agent communication')
    .option('-p, --port <number>', 'listening port')
    .option('-H, --host <string>', 'listening interface')
    .option('-n, --network <caip2>', 'blockchain network')
    .option('-t, --auth-ttl <seconds>', 'authorization TTL in seconds')
    .action(
      async (options: {
        port?: string;
        host?: string;
        network?: string;
        authTtl?: string;
      }) => {
        try {
          const { resolvePrivateKey, getAddress: getWalletAddress } =
            await import('./wallet.js');
          await resolvePrivateKey();
          const address = await getWalletAddress();

          const { resolveServerConfig } = await import(
            './server/config.js'
          );
          const { createServer } = await import('./server/index.js');

          const config = resolveServerConfig(options);
          const { url, httpServer } = await createServer({
            port: config.port,
            host: config.host,
            networks: [config.network],
            accessKeys: config.accessKeys,
            authTtl: config.authTtl,
          });

          console.error(`[paperwall] A2A Server started`);
          console.error(`[paperwall]   URL: ${url}`);
          console.error(
            `[paperwall]   Discovery: ${url}/.well-known/agent-card.json`,
          );
          console.error(`[paperwall]   Receipts: ${url}/receipts`);
          console.error(`[paperwall]   Wallet: ${address}`);
          console.error(`[paperwall]   Network: ${config.network}`);
          console.error(`[paperwall]   Auth TTL: ${config.authTtl}s`);
          console.error(
            `[paperwall]   Access control: ${config.accessKeys.length > 0 ? `${config.accessKeys.length} key(s)` : 'open'}`,
          );

          const shutdown = () => {
            console.error('\n[paperwall] Shutting down...');
            httpServer.close(() => {
              console.error('[paperwall] Server stopped.');
              process.exit(0);
            });
            setTimeout(() => process.exit(1), 30000).unref();
          };

          process.on('SIGTERM', shutdown);
          process.on('SIGINT', shutdown);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.includes('No wallet')) {
            outputError('no_wallet', message, 3);
          } else {
            outputError(
              'server_error',
              `Failed to start server: ${message}`,
              1,
            );
          }
        }
      },
    );

  // ── Demo command ───────────────────────────────────────────────

  program
    .command('demo')
    .description('Run AP2 lifecycle demo against a Paperwall A2A server')
    .requiredOption('-s, --server <url>', 'Paperwall server URL')
    .option('-a, --articles <urls...>', 'Article URLs to fetch')
    .option('-k, --agent-key <key>', 'Agent authentication key')
    .option('-v, --verbose', 'Show detailed AP2 stage output')
    .action(
      async (options: {
        server: string;
        articles?: string[];
        agentKey?: string;
        verbose?: boolean;
      }) => {
        try {
          const { runDemo } = await import('./server/demo-client.js');
          await runDemo(options);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          outputError('demo_error', message, 1);
        }
      },
    );

  return program;
}

/**
 * Map error codes to exit codes per API spec.
 */
function getExitCode(errorCode: string): number {
  switch (errorCode) {
    case 'budget_exceeded':
    case 'max_price_exceeded':
    case 'unsupported_network':
    case 'no_budget':
      return 2;
    case 'no_wallet':
    case 'decrypt_failed':
      return 3;
    default:
      return 1;
  }
}

// Only parse when run directly (not imported in tests).
// Resolve symlinks so `paperwall` (a symlink to dist/cli.js) is detected.
import { realpathSync } from 'node:fs';
const resolvedArgv = process.argv[1] ? realpathSync(process.argv[1]) : '';
const isDirectRun = resolvedArgv.endsWith('cli.ts') || resolvedArgv.endsWith('cli.js');

if (isDirectRun) {
  const program = buildProgram();
  program.parseAsync().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    outputError('unexpected_error', message, 1);
  });
}
