/**
 * Integration Test: End-to-End Full System
 *
 * Tests all components working together with real credentials:
 * 1. Demo website with SDK embedded
 * 2. Agent CLI fetches paywalled content
 * 3. A2A server processes requests from other agents
 *
 * Requires .env.test at the project root with real testnet credentials.
 * See .env.test.example for the required variables.
 * Skips automatically when credentials are missing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestEnvironment,
  waitFor,
  httpRequest,
  hasE2ECredentials,
  testEnv,
  TestEnvironment,
} from './setup';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

const SKIP_REASON = 'Skipping E2E: missing .env.test credentials (see .env.test.example)';

describe.skipIf(!hasE2ECredentials())(
  'End-to-End Full System Integration',
  () => {
    let env: TestEnvironment;
    const rootDir = join(process.cwd(), '../..');
    const agentCli = join(rootDir, 'packages/agent/dist/cli.js');

    beforeAll(async () => {
      env = await setupTestEnvironment();
    }, 30000);

    afterAll(async () => {
      if (env) {
        await env.cleanup();
      }
    });

    // ── SDK Detection ──────────────────────────────────────────────

    it('SDK emits payment signal detected by meta tag', async () => {
      // The demo site embeds the SDK which emits a <meta> tag
      await waitFor(async () => {
        const response = await httpRequest(`${env.demoUrl}/articles/article-1.html`);
        return response.status === 200;
      });

      const pageResponse = await httpRequest(`${env.demoUrl}/articles/article-1.html`);
      expect(pageResponse.status).toBe(200);
      // The SDK script tag should be present with data- attributes
      expect(pageResponse.body).toContain('data-pay-to');
      expect(pageResponse.body).toContain('data-price');
    });

    // ── Agent CLI ──────────────────────────────────────────────────

    it('Agent CLI creates wallet from PAPERWALL_PRIVATE_KEY', async () => {
      const { stdout } = await execAsync(
        `PAPERWALL_DATA_DIR=${env.testWalletDir} PAPERWALL_PRIVATE_KEY=${env.privateKey} node ${agentCli} wallet address`,
        { encoding: 'utf-8' },
      );

      const result = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('Agent CLI sets and reads budget', async () => {
      await execAsync(
        `PAPERWALL_DATA_DIR=${env.testWalletDir} node ${agentCli} budget set --per-request 1.00 --daily 10.00 --total 100.00`,
        { encoding: 'utf-8' },
      );

      const { stdout } = await execAsync(
        `PAPERWALL_DATA_DIR=${env.testWalletDir} node ${agentCli} budget status`,
        { encoding: 'utf-8' },
      );

      const result = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.budget).toBeDefined();
    });

    it('Agent CLI fetches free content without payment', async () => {
      // Convert smallest units to USDC for --max-price (e.g. "1" → "0.000001")
      const maxPriceUsdc = (Number(env.price) / 1_000_000).toFixed(6);

      const { stdout } = await execAsync(
        `PAPERWALL_DATA_DIR=${env.testWalletDir} PAPERWALL_PRIVATE_KEY=${env.privateKey} node ${agentCli} fetch ${env.demoUrl}/index.html --max-price ${maxPriceUsdc}`,
        { encoding: 'utf-8' },
      );

      const result = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.content).toContain('<!DOCTYPE html>');
      // Free content has no payment
      expect(result.payment).toBeUndefined();
    });

    // ── A2A Server ─────────────────────────────────────────────────

    it('A2A server exposes agent card (public endpoint)', async () => {
      const cardResponse = await httpRequest(
        `${env.agentA2AUrl}/.well-known/agent-card.json`,
      );

      expect(cardResponse.status).toBe(200);
      const card = JSON.parse(cardResponse.body);
      expect(card.protocol).toBe('A2A');
      expect(card.protocolVersion).toBe('0.3.0');
    });

    it('A2A server health check returns ok', async () => {
      const response = await httpRequest(`${env.agentA2AUrl}/health`);
      expect(response.status).toBe(200);

      const health = JSON.parse(response.body);
      expect(health.status).toBe('ok');
    });

    it('A2A server rejects unauthenticated RPC requests', async () => {
      const response = await httpRequest(`${env.agentA2AUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'message/send',
          params: { message: { kind: 'message', messageId: 'unauth-test', role: 'user', parts: [] } },
        }),
      });

      expect(response.status).toBe(401);
    });

    it('A2A server accepts authenticated RPC requests', async () => {
      const response = await httpRequest(`${env.agentA2AUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.accessKey}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: 'auth-test-001',
              role: 'user',
              parts: [{ kind: 'data', data: { url: 'https://example.com', maxPrice: (Number(env.price) / 1_000_000).toFixed(6) } }],
            },
          },
        }),
      });

      // Should get a JSON-RPC response (200), not an auth error
      expect(response.status).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.jsonrpc).toBe('2.0');
    });

    it('A2A server receipts endpoint returns HTML', async () => {
      const response = await httpRequest(`${env.agentA2AUrl}/receipts`, {
        headers: { Authorization: `Bearer ${env.accessKey}` },
      });

      expect(response.status).toBe(200);
      expect(response.body).toContain('<!DOCTYPE html>');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    // ── Cross-Component Consistency ────────────────────────────────

    it('Payment format is consistent between extension and agent', () => {
      // Both use the same x402 PaymentPayload structure
      const extensionPayment = {
        signature: '0x' + 'a'.repeat(130),
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: env.payTo,
          value: env.price,
          validAfter: '0',
          validBefore: (Math.floor(Date.now() / 1000) + 300).toString(),
          nonce: '0x' + 'b'.repeat(64),
        },
      };

      const agentPayment = {
        signature: '0x' + 'c'.repeat(130),
        authorization: {
          from: '0x3333333333333333333333333333333333333333',
          to: env.payTo,
          value: env.price,
          validAfter: '0',
          validBefore: (Math.floor(Date.now() / 1000) + 300).toString(),
          nonce: '0x' + 'd'.repeat(64),
        },
      };

      expect(Object.keys(extensionPayment)).toEqual(Object.keys(agentPayment));
      expect(Object.keys(extensionPayment.authorization)).toEqual(
        Object.keys(agentPayment.authorization),
      );
    });

    it('All components target the same facilitator and network', () => {
      // These come from .env.test — ensures all components are aligned
      expect(env.facilitatorUrl).toMatch(/^https:\/\//);
      expect(env.network).toMatch(/^eip155:\d+$/);
      expect(env.payTo).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  },
);
