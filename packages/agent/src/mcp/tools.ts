import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { orchestrateFetch } from '../server/request-orchestrator.js';
import { setBudget } from '../budget.js';
import { log } from '../logger.js';

// -- Public API ---

export function registerTools(server: McpServer): void {
  registerFetchUrl(server);
  registerSetBudget(server);
}

// -- Internal Helpers ---

function registerFetchUrl(server: McpServer): void {
  server.tool(
    'fetch_url',
    `Fetch web content from a URL, automatically handling payment if the content is paywalled.
Supports three payment modes: HTTP 402 (x402 protocol), client-mode (direct facilitator settlement), and server-mode (publisher-mediated settlement).

Use this tool when:
- You need to access content behind a paywall
- A URL returns HTTP 402 Payment Required
- The user asks you to fetch or read a paid article

Input:
- url (required): The full URL to fetch
- maxPrice (optional): Maximum USDC willing to pay (e.g., "0.10" for 10 cents)

Returns JSON with:
- ok: true/false
- content: The fetched HTML/text content (on success)
- payment: Payment details including amount, txHash, network (if payment was made)
- error: Error code and message (on failure)

Common failures:
- budget_exceeded: Spending limit reached. User needs to increase budget.
- no_wallet: No wallet configured. User needs to run "paperwall wallet create".
- no_budget: No budget set and no maxPrice given. Provide maxPrice or ask user to set budget.

Amounts are in USDC (1 USDC = $1 USD). Typical article costs: $0.01 - $0.10.`,
    {
      url: z.string().url().describe(
        'The URL to fetch. Supports HTTP 402, client-mode, and server-mode x402 payment flows.',
      ),
      maxPrice: z.string().optional().describe(
        'Maximum USDC amount willing to pay (e.g., "0.10" for 10 cents). ' +
        'If omitted, uses the per-request budget limit.',
      ),
    },
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ url, maxPrice }): Promise<CallToolResult> => {
      try {
        log(`fetch_url: ${url}${maxPrice ? ` (maxPrice: ${maxPrice})` : ''}`);

        const result = await orchestrateFetch({
          url,
          maxPrice,
          agentId: null,
          requestSource: 'mcp',
          authTtl: 0,
        });

        if (result.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                ok: true,
                url,
                statusCode: 200,
                contentType: result.contentType,
                content: result.content,
                payment: result.payment,
                receipt: { id: result.receipt.id, ap2Stage: result.receipt.ap2Stage },
              }),
            }],
          };
        }

        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: result.error,
              message: result.message,
              url,
            }),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log(`fetch_url error: ${message}`);

        if (message.includes('No wallet configured')) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error: 'no_wallet',
                message: 'No wallet configured. Run: paperwall wallet create',
              }),
            }],
          };
        }

        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: 'network_error',
              message: `Failed to fetch: ${message}`,
              url,
            }),
          }],
        };
      }
    },
  );
}

function registerSetBudget(server: McpServer): void {
  server.tool(
    'set_budget',
    `Set spending limits for Paperwall payments. At least one limit must be provided.
Limits persist across sessions in ~/.paperwall/budget.json.

Input:
- perRequest (optional): Max USDC per single payment (e.g., "0.10")
- daily (optional): Max USDC per day, resets at midnight UTC (e.g., "5.00")
- total (optional): Max USDC lifetime, never resets (e.g., "50.00")

Use this when the user wants to control spending or before using fetch_url for the first time.`,
    {
      perRequest: z.string().optional().describe(
        'Maximum USDC per single payment (e.g., "0.10"). Prevents any individual payment above this.',
      ),
      daily: z.string().optional().describe(
        'Maximum USDC to spend per day (e.g., "5.00"). Resets at midnight UTC.',
      ),
      total: z.string().optional().describe(
        'Maximum USDC to spend lifetime (e.g., "50.00"). Never resets.',
      ),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ perRequest, daily, total }): Promise<CallToolResult> => {
      try {
        const partial: Record<string, string> = {};
        if (perRequest) partial['perRequestMax'] = perRequest;
        if (daily) partial['dailyMax'] = daily;
        if (total) partial['totalMax'] = total;

        if (Object.keys(partial).length === 0) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error: 'invalid_input',
                message: 'At least one limit must be provided: perRequest, daily, or total',
              }),
            }],
          };
        }

        const result = setBudget(partial);
        log(`set_budget: ${JSON.stringify(result)}`);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              budget: {
                perRequest: result.perRequestMax ?? null,
                daily: result.dailyMax ?? null,
                total: result.totalMax ?? null,
              },
              message: 'Budget updated successfully',
            }),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log(`set_budget error: ${message}`);

        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: 'budget_error',
              message,
            }),
          }],
        };
      }
    },
  );
}
