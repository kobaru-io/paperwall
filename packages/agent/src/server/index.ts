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

  // RPC endpoint protected by access gate
  // TODO: Add per-key rate limiting (future work — important for public deployments)
  app.use(
    '/rpc',
    accessGate,
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
