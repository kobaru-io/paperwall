import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAddress, getBalance } from '../wallet.js';
import { getBudget, smallestToUsdc, usdcToSmallest } from '../budget.js';
import { getTodayTotal, getLifetimeTotal, getRecent } from '../history.js';
import { getNetwork } from '../networks.js';
import { readJsonFile } from '../storage.js';
import { log } from '../logger.js';

import type { WalletFile } from '../wallet.js';

// -- Public API ---

export function registerResources(server: McpServer): void {
  registerWalletInfo(server);
  registerWalletBalance(server);
  registerBudgetStatus(server);
  registerPaymentHistory(server);
}

// -- Internal Helpers ---

function registerWalletInfo(server: McpServer): void {
  server.resource(
    'wallet-info',
    'paperwall://wallet/info',
    {
      description: 'Paperwall wallet address and configured network',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const address = await getAddress();
        const wallet = readJsonFile<WalletFile>('wallet.json');
        const networkId = wallet?.networkId ?? 'eip155:324705682';

        let networkName = networkId;
        try {
          const config = getNetwork(networkId);
          networkName = config.name;
        } catch {
          // Unknown network — use raw ID
        }

        return {
          contents: [{
            uri: 'paperwall://wallet/info',
            mimeType: 'application/json',
            text: JSON.stringify({
              address,
              network: networkId,
              networkName,
            }),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log(`wallet-info error: ${message}`);
        return {
          contents: [{
            uri: 'paperwall://wallet/info',
            mimeType: 'application/json',
            text: JSON.stringify({
              error: 'no_wallet',
              message: message.includes('No wallet')
                ? 'No wallet configured. Run: paperwall wallet create'
                : message,
            }),
          }],
        };
      }
    },
  );
}

function registerWalletBalance(server: McpServer): void {
  server.resource(
    'wallet-balance',
    'paperwall://wallet/balance',
    {
      description: 'Current USDC balance on the configured network',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const balance = await getBalance();

        return {
          contents: [{
            uri: 'paperwall://wallet/balance',
            mimeType: 'application/json',
            text: JSON.stringify({
              address: balance.address,
              balance: balance.balanceFormatted,
              currency: balance.asset,
              network: balance.network,
            }),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const errorCode = message.includes('No wallet') ? 'no_wallet' : 'rpc_error';
        log(`wallet-balance error: ${message}`);
        return {
          contents: [{
            uri: 'paperwall://wallet/balance',
            mimeType: 'application/json',
            text: JSON.stringify({
              error: errorCode,
              message: errorCode === 'no_wallet'
                ? 'No wallet configured. Run: paperwall wallet create'
                : `Failed to query balance: ${message}`,
            }),
          }],
        };
      }
    },
  );
}

function registerBudgetStatus(server: McpServer): void {
  server.resource(
    'budget-status',
    'paperwall://budget/status',
    {
      description: 'Current budget limits, daily spending, and lifetime spending',
      mimeType: 'application/json',
    },
    async () => {
      const budget = getBudget();

      if (!budget) {
        return {
          contents: [{
            uri: 'paperwall://budget/status',
            mimeType: 'application/json',
            text: JSON.stringify({
              configured: false,
              message: 'No budget configured. Use the set_budget tool or run: paperwall budget set',
            }),
          }],
        };
      }

      const todaySmallest = getTodayTotal();
      const lifetimeSmallest = getLifetimeTotal();
      const todayUsdc = smallestToUsdc(todaySmallest);
      const lifetimeUsdc = smallestToUsdc(lifetimeSmallest);

      const dailyRaw = budget.dailyMax
        ? BigInt(usdcToSmallest(budget.dailyMax)) - BigInt(todaySmallest)
        : null;
      const dailyRem = dailyRaw !== null
        ? smallestToUsdc((dailyRaw < 0n ? 0n : dailyRaw).toString())
        : null;

      const totalRaw = budget.totalMax
        ? BigInt(usdcToSmallest(budget.totalMax)) - BigInt(lifetimeSmallest)
        : null;
      const totalRem = totalRaw !== null
        ? smallestToUsdc((totalRaw < 0n ? 0n : totalRaw).toString())
        : null;

      return {
        contents: [{
          uri: 'paperwall://budget/status',
          mimeType: 'application/json',
          text: JSON.stringify({
            configured: true,
            limits: {
              perRequest: budget.perRequestMax ?? null,
              daily: budget.dailyMax ?? null,
              total: budget.totalMax ?? null,
            },
            spending: {
              today: todayUsdc,
              lifetime: lifetimeUsdc,
            },
            remaining: {
              daily: dailyRem,
              total: totalRem,
            },
          }),
        }],
      };
    },
  );
}

function registerPaymentHistory(server: McpServer): void {
  server.resource(
    'payment-history',
    'paperwall://history/recent',
    {
      description: 'Last 20 payment transactions',
      mimeType: 'application/json',
    },
    async () => {
      const entries = getRecent(20);

      const formatted = entries.map((entry) => ({
        ts: entry.ts,
        url: entry.url,
        amount: entry.amount,
        amountFormatted: smallestToUsdc(entry.amount),
        asset: entry.asset,
        network: entry.network,
        txHash: entry.txHash,
        mode: entry.mode,
      }));

      return {
        contents: [{
          uri: 'paperwall://history/recent',
          mimeType: 'application/json',
          text: JSON.stringify({
            count: formatted.length,
            entries: formatted,
          }),
        }],
      };
    },
  );
}
