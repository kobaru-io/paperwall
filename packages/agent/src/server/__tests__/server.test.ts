import { describe, it, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from '../index.js';
import { PaperwallExecutor } from '../executor.js';

describe('createServer', () => {
  let httpServer: Server | null = null;

  afterEach(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
      httpServer = null;
    }
  });

  it('starts and exposes health endpoint', async () => {
    const executor = new PaperwallExecutor({ authTtl: 300 });
    const instance = await createServer({
      port: 0, // random port
      host: '127.0.0.1',
      networks: ['eip155:324705682'],
      executor,
    });
    httpServer = instance.httpServer;

    const res = await fetch(`${instance.url}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('serves agent card at well-known path', async () => {
    const executor = new PaperwallExecutor({ authTtl: 300 });
    const instance = await createServer({
      port: 0,
      host: '127.0.0.1',
      networks: ['eip155:324705682'],
      executor,
    });
    httpServer = instance.httpServer;

    const res = await fetch(
      `${instance.url}/.well-known/agent-card.json`,
    );
    expect(res.status).toBe(200);
    const card = (await res.json()) as Record<string, unknown>;
    expect(card['name']).toBe('Paperwall Agent');
    expect(card['protocolVersion']).toBe('0.3.0');
    expect(card['skills']).toHaveLength(1);
  });

  it('serves receipt viewer page', async () => {
    const executor = new PaperwallExecutor({ authTtl: 300 });
    const instance = await createServer({
      port: 0,
      host: '127.0.0.1',
      networks: ['eip155:324705682'],
      executor,
    });
    httpServer = instance.httpServer;

    const res = await fetch(`${instance.url}/receipts`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const html = await res.text();
    expect(html).toContain('Paperwall');
  });

  it('rejects unauthenticated requests when access keys are configured', async () => {
    const executor = new PaperwallExecutor({ authTtl: 300 });
    const instance = await createServer({
      port: 0,
      host: '127.0.0.1',
      networks: ['eip155:324705682'],
      accessKeys: ['secret-key-1'],
      executor,
    });
    httpServer = instance.httpServer;

    // No auth header -> 401
    const noAuth = await fetch(`${instance.url}/receipts`);
    expect(noAuth.status).toBe(401);

    // Wrong key -> 401
    const wrongKey = await fetch(`${instance.url}/receipts`, {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(wrongKey.status).toBe(401);

    // Correct key -> 200
    const validKey = await fetch(`${instance.url}/receipts`, {
      headers: { Authorization: 'Bearer secret-key-1' },
    });
    expect(validKey.status).toBe(200);
  });

  it('allows agent card discovery without authentication', async () => {
    const executor = new PaperwallExecutor({ authTtl: 300 });
    const instance = await createServer({
      port: 0,
      host: '127.0.0.1',
      networks: ['eip155:324705682'],
      accessKeys: ['secret-key-1'],
      executor,
    });
    httpServer = instance.httpServer;

    // Agent card should be public even with access keys
    const res = await fetch(
      `${instance.url}/.well-known/agent-card.json`,
    );
    expect(res.status).toBe(200);
  });
});
