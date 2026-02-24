import { Command } from 'commander';
import { createWallet, importWallet, getAddress, getBalance, getKeyStorage, migrateToKeychain, migrateToFile } from './wallet.js';
import { EncryptionModeDetector } from './modes.js';
import type { EncryptionModeName } from './modes.js';
import { setBudget, getBudget, smallestToUsdc, usdcToSmallest } from './budget.js';
import { getRecent, getSpendingTotals } from './history.js';
import { readJsonFile } from './storage.js';
import { outputJson, outputError } from './output.js';
import { getNetwork } from './networks.js';
import { fetchWithPayment, flushPendingSettlements } from './payment-engine.js';

import type { WalletFile } from './wallet.js';

// -- Internal Helpers ---

function handleError(
  error: unknown,
  defaultCode: string,
  exitCode: number,
  walletCheck?: boolean,
): void {
  const message = error instanceof Error ? error.message : String(error);
  if (walletCheck && message.includes('No wallet')) {
    outputError('no_wallet', message, 3);
  } else {
    outputError(defaultCode, message, exitCode);
  }
}

// -- Public API ---

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
    .description('Generate a new encrypted wallet')
    .option('-n, --network <caip2>', 'Default network (CAIP-2)', 'eip155:324705682')
    .option('-f, --force', 'Overwrite existing wallet')
    .option('--keychain', 'Store private key in OS keychain')
    .action(async (options: { network: string; force?: boolean; keychain?: boolean }) => {
      try {
        const result = await createWallet({ network: options.network, force: options.force, keychain: options.keychain });
        const walletFile = readJsonFile<WalletFile>('wallet.json');
        const keyStorage = walletFile ? getKeyStorage(walletFile) : 'file';
        outputJson({
          ok: true,
          address: result.address,
          network: result.network,
          storagePath: result.storagePath,
          keyStorage,
        });
      } catch (error: unknown) {
        handleError(error, 'wallet_create_failed', 1);
      }
    });

  wallet
    .command('import')
    .description('Import an existing private key')
    .requiredOption('-k, --key <hex>', 'Private key (0x-prefixed hex)')
    .option('-n, --network <caip2>', 'Default network (CAIP-2)', 'eip155:324705682')
    .option('-f, --force', 'Overwrite existing wallet')
    .option('--keychain', 'Store private key in OS keychain')
    .action(async (options: { key: string; network: string; force?: boolean; keychain?: boolean }) => {
      try {
        const result = await importWallet(options.key, { network: options.network, force: options.force, keychain: options.keychain });
        const walletFile = readJsonFile<WalletFile>('wallet.json');
        const keyStorage = walletFile ? getKeyStorage(walletFile) : 'file';
        outputJson({
          ok: true,
          address: result.address,
          network: result.network,
          storagePath: result.storagePath,
          keyStorage,
        });
      } catch (error: unknown) {
        handleError(error, 'wallet_import_failed', 1);
      }
    });

  wallet
    .command('balance')
    .description('Show USDC balance')
    .option('-n, --network <caip2>', 'Query specific network')
    .option('--json', 'Output as JSON')
    .action(async (options: { network?: string; json?: boolean }) => {
      try {
        const result = await getBalance(options.network);
        const networkConfig = getNetwork(result.network);
        if (options.json) {
          outputJson({
            ok: true,
            address: result.address,
            balanceFormatted: result.balanceFormatted,
            asset: result.asset,
            network: `${networkConfig.name} (${result.network})`,
          });
        } else {
          console.log('');
          console.log(`  Balance:  ${result.balanceFormatted} ${result.asset}`);
          console.log(`  Address:  ${result.address}`);
          console.log(`  Network:  ${networkConfig.name} (${result.network})`);
          console.log('');
        }
      } catch (error: unknown) {
        handleError(error, 'balance_error', 1, true);
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
        handleError(error, 'address_error', 1, true);
      }
    });

  wallet
    .command('info')
    .description('Show wallet storage and encryption info')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const walletFile = readJsonFile<WalletFile>('wallet.json');
        if (!walletFile) {
          outputError('no_wallet', 'No wallet configured. Run: paperwall wallet create', 3);
          return;
        }
        const storage = getKeyStorage(walletFile);
        const encryptionMode = storage === 'keychain' ? null : (walletFile.encryptionMode ?? 'machine-bound');
        const networkConfig = getNetwork(walletFile.networkId);
        if (options.json) {
          outputJson({
            ok: true,
            address: walletFile.address,
            network: `${networkConfig.name} (${walletFile.networkId})`,
            keyStorage: storage,
            encryptionMode,
          });
        } else {
          console.log('');
          console.log(`  Address:     ${walletFile.address}`);
          console.log(`  Network:     ${networkConfig.name} (${walletFile.networkId})`);
          console.log(`  Key storage: ${storage === 'keychain' ? 'OS keychain' : 'encrypted file'}`);
          if (encryptionMode) {
            console.log(`  Encryption:  ${encryptionMode}`);
          }
          console.log('');
        }
      } catch (error: unknown) {
        handleError(error, 'wallet_info_failed', 1);
      }
    });

  // ── Wallet migrate commands ────────────────────────────────

  const migrate = wallet
    .command('migrate')
    .description('Migrate wallet between storage backends');

  migrate
    .command('to-keychain')
    .description('Move private key from encrypted file to OS keychain')
    .action(async () => {
      try {
        const result = await migrateToKeychain();
        outputJson({ ok: true, ...result });
      } catch (error: unknown) {
        handleError(error, 'migration_failed', 1);
      }
    });

  migrate
    .command('to-file')
    .description('Move private key from OS keychain to encrypted file')
    .option('--mode <name>', 'Encryption mode for file storage (machine-bound, password)', 'machine-bound')
    .action(async (options: { mode: string }) => {
      try {
        if (!EncryptionModeDetector.isValidMode(options.mode)) {
          outputError('invalid_mode', `Unknown encryption mode: "${options.mode}". Valid modes: machine-bound, password, env-injected`, 1);
          return;
        }
        const result = await migrateToFile(options.mode);
        outputJson({ ok: true, ...result });
      } catch (error: unknown) {
        handleError(error, 'migration_failed', 1);
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
        handleError(error, 'budget_set_failed', 1);
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

        const totals = getSpendingTotals();

        const todayUsdc = smallestToUsdc(totals.today);
        const totalUsdc = smallestToUsdc(totals.lifetime);

        // Compute remaining for daily and total (clamped to 0)
        const dailyRaw = budgetConfig.dailyMax
          ? BigInt(usdcToSmallest(budgetConfig.dailyMax)) - BigInt(totals.today)
          : null;
        const dailyRemaining = dailyRaw !== null
          ? smallestToUsdc((dailyRaw < 0n ? 0n : dailyRaw).toString())
          : undefined;

        const totalRaw = budgetConfig.totalMax
          ? BigInt(usdcToSmallest(budgetConfig.totalMax)) - BigInt(totals.lifetime)
          : null;
        const totalRemaining = totalRaw !== null
          ? smallestToUsdc((totalRaw < 0n ? 0n : totalRaw).toString())
          : undefined;

        outputJson({
          ok: true,
          budget: budgetConfig,
          spent: {
            today: todayUsdc,
            total: totalUsdc,
            transactionCount: totals.count,
          },
          remaining: {
            daily: dailyRemaining ?? '0.00',
            total: totalRemaining ?? '0.00',
          },
        });
      } catch (error: unknown) {
        handleError(error, 'budget_status_failed', 1);
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
        const totals = getSpendingTotals();
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
          total: totals.count,
        });
      } catch (error: unknown) {
        handleError(error, 'history_error', 1);
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
    .option('--no-optimistic', 'Wait for settlement before returning content')
    .action(async (url: string, options: { maxPrice?: string; network?: string; timeout: string; optimistic?: boolean }) => {
      try {
        const result = await fetchWithPayment(url, {
          maxPrice: options.maxPrice,
          network: options.network,
          timeout: Number.isNaN(parseInt(options.timeout, 10)) ? 30000 : parseInt(options.timeout, 10),
          optimistic: options.optimistic ?? (process.env['PAPERWALL_OPTIMISTIC'] !== '0' && process.env['PAPERWALL_OPTIMISTIC'] !== 'false'),
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

        // Wait for any background optimistic settlements before exiting
        await flushPendingSettlements();
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
          handleError(error, 'server_error', 1, true);
        }
      },
    );

  // ── MCP server command ──────────────────────────────────────

  program
    .command('mcp')
    .description('Start MCP server for AI assistant integration (stdio transport)')
    .option('-n, --network <caip2>', 'Blockchain network (CAIP-2)')
    .action(
      async (options: { network?: string }) => {
        try {
          const { resolvePrivateKey } = await import('./wallet.js');
          await resolvePrivateKey();

          if (options.network) {
            const { getNetwork } = await import('./networks.js');
            getNetwork(options.network); // validates; throws if unsupported
            process.env['PAPERWALL_NETWORK'] = options.network;
          }

          const { startMcpServer } = await import('./mcp/index.js');
          await startMcpServer();
        } catch (error: unknown) {
          handleError(error, 'mcp_error', 1, true);
        }
      },
    );

  // ── Setup command ──────────────────────────────────────────────

  program
    .command('setup')
    .description('Interactive setup wizard (AI client, wallet, budget)')
    .option('--skip-wallet', 'Skip wallet setup')
    .option('--skip-budget', 'Skip budget setup')
    .option('--skip-ai', 'Skip AI client integration')
    .option('-f, --force', 'Re-run setup even if already configured')
    .action(async (options: { skipWallet?: boolean; skipBudget?: boolean; skipAi?: boolean; force?: boolean }) => {
      try {
        const { runSetup } = await import('./setup.js');
        await runSetup(options);
      } catch (error: unknown) {
        handleError(error, 'setup_failed', 1);
      }
    });

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
          handleError(error, 'demo_error', 1);
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
