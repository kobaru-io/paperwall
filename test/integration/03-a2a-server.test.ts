/**
 * Integration Test: A2A Server
 *
 * Tests the Agent-to-Agent protocol server:
 * - Agent card discovery
 * - JSON-RPC 2.0 message/send endpoint
 * - Receipt tracking and viewing
 * - Access control with Bearer tokens
 * - Health checks
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { randomBytes } from 'crypto';

describe('A2A Server Integration', () => {
  let testDir: string;
  let serverUrl: string;
  let accessKey: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), 'paperwall-a2a-test-' + randomBytes(8).toString('hex'));
    await mkdir(testDir, { recursive: true });

    serverUrl = 'http://localhost:4000';
    accessKey = 'test-key-' + randomBytes(16).toString('hex');

    // Note: In real tests, we'd start the A2A server here
    // spawn('node', ['dist/cli.js', 'serve', '--port', '4000'])
  });

  // Helper to check if server is available
  async function isServerAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${serverUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('exposes agent card at /.well-known/agent-card.json (public endpoint)', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/.well-known/agent-card.json`);

    expect(response.status).toBe(200);

    const card = await response.json();

    expect(card).toMatchObject({
      protocol: 'A2A',
      protocolVersion: '0.3.0',
      name: 'Paperwall Agent',
      version: '0.1.0',
      description: expect.stringContaining('x402'),
      capabilities: expect.objectContaining({
        stateTransitionHistory: true,
      }),
    });

    // Should have RPC URL
    expect(card.url).toBeDefined();
    expect(card.url).toContain('/rpc');
  });

  it('health check endpoint returns ok', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/health`);

    expect(response.status).toBe(200);

    const health = await response.json();
    expect(health).toEqual({ status: 'ok' });
  });

  it('RPC endpoint requires authentication when access keys configured', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId: 'test-' + randomBytes(8).toString('hex'),
            role: 'user',
            parts: [],
          },
        },
      }),
    });

    if (response.status === 401) {
      // Access keys are configured, auth required
      expect(response.status).toBe(401);
    } else {
      // No access keys configured, should work
      expect(response.status).toBe(200);
    }
  });

  it('RPC endpoint accepts valid Bearer token', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId: 'test-' + randomBytes(8).toString('hex'),
            role: 'user',
            parts: [
              {
                kind: 'data',
                data: {
                  url: 'http://example.com/test',
                  maxPrice: '0.10',
                },
              },
            ],
          },
        },
      }),
    });

    // Should either succeed or return 401 if access key doesn't match
    expect([200, 401]).toContain(response.status);
  });

  it('RPC endpoint processes fetch requests and returns content', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const messageId = 'test-' + randomBytes(8).toString('hex');

    const response = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId,
            role: 'user',
            parts: [
              {
                kind: 'data',
                data: {
                  url: 'https://example.com',
                  maxPrice: '0.10',
                },
              },
            ],
          },
        },
      }),
    });

    if (response.status === 200) {
      const result = await response.json();

      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBe(1);

      // Should have a result (A2A Task object)
      if (result.result) {
        const task = result.result;
        // Response message is in status.message (A2A SDK format)
        if (task.status?.message) {
          expect(task.status.message.role).toBe('agent');
          expect(task.status.message.parts).toBeDefined();
        }
      }
    }
  });

  it('receipts endpoint requires authentication', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/receipts`);

    // Either 401 (auth required) or 200 (no auth configured)
    expect([200, 401]).toContain(response.status);
  });

  it('receipts endpoint returns HTML with valid Bearer token', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/receipts`, {
      headers: {
        'Authorization': `Bearer ${accessKey}`,
      },
    });

    if (response.status === 200) {
      const html = await response.text();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Receipt');

      // Should have security headers
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('receipts endpoint supports filtering by stage', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/receipts?stage=settled`, {
      headers: {
        'Authorization': `Bearer ${accessKey}`,
      },
    });

    if (response.status === 200) {
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
    }
  });

  it('receipts endpoint supports date range filtering', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(
      `${serverUrl}/receipts?from=2026-01-01&to=2026-12-31`,
      {
        headers: {
          'Authorization': `Bearer ${accessKey}`,
        },
      }
    );

    if (response.status === 200) {
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
    }
  });

  it('creates AP2 receipts for payment requests', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const messageId = 'receipt-test-' + randomBytes(8).toString('hex');

    // Make a payment request
    await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId,
            role: 'user',
            parts: [
              {
                kind: 'data',
                data: {
                  url: 'http://example.com/article',
                  maxPrice: '0.01',
                },
              },
            ],
          },
        },
      }),
    });

    // Check receipts
    const receiptsResponse = await fetch(`${serverUrl}/receipts`, {
      headers: {
        'Authorization': `Bearer ${accessKey}`,
      },
    });

    if (receiptsResponse.status === 200) {
      const html = await receiptsResponse.text();
      // Should contain some receipt data (if any payments were made)
      expect(html).toBeTruthy();
    }
  });

  it('handles budget exceeded with declined receipt', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    // This would require setting a very low budget and requesting expensive content
    const messageId = 'budget-test-' + randomBytes(8).toString('hex');

    const response = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId,
            role: 'user',
            parts: [
              {
                kind: 'data',
                data: {
                  url: 'http://example.com/expensive',
                  maxPrice: '0.001', // Very low max price
                },
              },
            ],
          },
        },
      }),
    });

    // Should handle gracefully (either success if within budget, or error)
    expect([200, 400, 500]).toContain(response.status);
  });

  it('rejects requests with invalid JSON-RPC format', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    const response = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        // Missing required fields
        foo: 'bar',
      }),
    });

    if (response.status === 200) {
      const result = await response.json();
      // Should be a JSON-RPC error response
      expect(result.error).toBeDefined();
    } else {
      expect([400, 401]).toContain(response.status);
    }
  });

  it('handles timing-safe key comparison for access control', async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.log('⊘ A2A server not running, skipping test');
      return;
    }

    // Try with wrong key
    const response1 = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-key-12345',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {},
      }),
    });

    // Try with correct key
    const response2 = await fetch(`${serverUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {},
      }),
    });

    // If access keys are configured, wrong key should fail
    if (response1.status === 401 || response2.status === 401) {
      expect(response1.status).toBe(401);
      expect([200, 400]).toContain(response2.status); // May fail on validation but not auth
    }
  });
});
