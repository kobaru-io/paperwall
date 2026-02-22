import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import { buildAgentCard } from './agent-card.js';
import { PaperwallExecutor } from './executor.js';
import { checkAccess } from './access-gate.js';
import { listReceipts } from './receipt-manager.js';
import { renderReceiptPage } from './receipt-viewer.js';
import { smallestToUsdc } from '../budget.js';

export interface CreateServerOptions {
  readonly port: number;
  readonly host?: string;
  readonly networks: string[];
  readonly accessKeys?: string[];
  readonly authTtl?: number;
  readonly executor?: PaperwallExecutor;
}

export interface ServerInstance {
  readonly httpServer: Server;
  readonly port: number;
  readonly url: string;
}

export async function createServer(
  options: CreateServerOptions,
): Promise<ServerInstance> {
  const host = options.host ?? '0.0.0.0';
  const app = express();

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // A2A protocol setup
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const agentCard = buildAgentCard({
    url: `http://${displayHost}:${options.port}`,
    networks: options.networks,
  });

  // Access gate middleware for protected routes
  const accessKeys = options.accessKeys ?? [];
  function accessGate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const result = checkAccess(accessKeys, token);
    if (!result.allowed) {
      res.status(401).json({ error: result.reason ?? 'unauthorized' });
      return;
    }
    next();
  }

  const authTtl = options.authTtl ?? 300;
  const executor = options.executor ?? new PaperwallExecutor({ authTtl });
  const taskStore = new InMemoryTaskStore();
  const handler = new DefaultRequestHandler(agentCard, taskStore, executor);

  // Agent card is public (discovery endpoint)
  app.use(
    '/.well-known/agent-card.json',
    agentCardHandler({ agentCardProvider: handler }),
  );

  // RPC rate limiter: 30 requests per minute per IP
  const rpcRateLimit = createRateLimiter(30, 60_000);
  function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    if (!rpcRateLimit(ip)) {
      res.status(429).json({ error: 'rate_limit_exceeded', message: 'Too many requests' });
      return;
    }
    next();
  }

  // RPC endpoint protected by access gate + rate limiter
  app.use(
    '/rpc',
    accessGate,
    rateLimitMiddleware,
    jsonRpcHandler({
      requestHandler: handler,
      userBuilder: UserBuilder.noAuthentication,
    }),
  );

  // Receipt viewer protected by access gate
  app.get('/receipts', accessGate, (req, res) => {
    const filter: Record<string, string | undefined> = {};
    if (typeof req.query['stage'] === 'string')
      filter['ap2Stage'] = req.query['stage'];
    if (typeof req.query['from'] === 'string')
      filter['startDate'] = req.query['from'];
    if (typeof req.query['to'] === 'string')
      filter['endDate'] = req.query['to'];

    // Get all matching receipts for accurate totals, then paginated page
    const allResult = listReceipts({
      ...(filter as Parameters<typeof listReceipts>[0]),
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
    });
    const result = listReceipts(filter as Parameters<typeof listReceipts>[0]);

    const totalSpent = allResult.receipts
      .filter((r) => r.settlement)
      .reduce((sum, r) => sum + BigInt(r.settlement!.amount), 0n);
    const totalDeclined = allResult.receipts.filter(
      (r) => r.ap2Stage === 'declined',
    ).length;

    const html = renderReceiptPage(result.receipts, {
      total: result.total,
      totalSpent: smallestToUsdc(totalSpent.toString()),
      totalDeclined,
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    res.send(html);
  });

  // Start listening
  const httpServer = await new Promise<Server>((resolve) => {
    const srv = app.listen(options.port, host, () => resolve(srv));
  });

  const addr = httpServer.address();
  const actualPort =
    typeof addr === 'object' && addr ? addr.port : options.port;
  const url = `http://${displayHost}:${actualPort}`;

  return { httpServer, port: actualPort, url };
}

// -- Internal Helpers ---

/**
 * Simple in-memory sliding-window rate limiter.
 * Returns a function that returns true if the request is allowed.
 */
function createRateLimiter(
  maxRequests: number,
  windowMs: number,
): (key: string) => boolean {
  const windows = new Map<string, number[]>();

  // Periodic cleanup to prevent memory leaks from stale IPs
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of windows) {
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        windows.delete(key);
      } else {
        windows.set(key, filtered);
      }
    }
  }, windowMs).unref();
  // Keep reference to allow cleanup in tests if needed
  void cleanupInterval;

  return (key: string): boolean => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (windows.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= maxRequests) {
      windows.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    windows.set(key, timestamps);
    return true;
  };
}
