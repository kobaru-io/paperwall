import type {
  Receipt,
  AuthorizationContext,
  SettlementContext,
  DeclineContext,
} from './types.js';
import { appendJsonlFile, readJsonlFile } from '../storage.js';

const RECEIPTS_FILENAME = 'receipts.jsonl';

const EXPLORER_URLS: ReadonlyMap<string, string> = new Map([
  [
    'eip155:324705682',
    'https://base-sepolia-testnet-explorer.skalenodes.com/tx/',
  ],
  [
    'eip155:1187947933',
    'https://skale-base-explorer.skalenodes.com/tx/',
  ],
]);

export function getExplorerUrl(network: string, txHash: string): string {
  const base = EXPLORER_URLS.get(network);
  if (base) {
    return `${base}${txHash}`;
  }
  return `https://blockscan.com/tx/${txHash}`;
}

// --- Receipt creation ---

interface SettledEvent {
  readonly type: 'settled';
  readonly url: string;
  readonly agentId: string | null;
  readonly authorization: AuthorizationContext;
  readonly settlement: SettlementContext;
  readonly riskSignals: import('./types.js').RiskSignals;
}

interface DeclinedEvent {
  readonly type: 'declined';
  readonly url: string;
  readonly agentId: string | null;
  readonly authorization: AuthorizationContext;
  readonly decline: DeclineContext;
  readonly riskSignals: import('./types.js').RiskSignals;
}

interface IntentEvent {
  readonly type: 'intent';
  readonly url: string;
  readonly agentId: string | null;
  readonly authorization: AuthorizationContext;
  readonly riskSignals: import('./types.js').RiskSignals;
}

export type PaymentEvent = SettledEvent | DeclinedEvent | IntentEvent;

export function createReceipt(event: PaymentEvent): Receipt {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const base = {
    id,
    timestamp,
    url: event.url,
    agentId: event.agentId,
    authorization: event.authorization,
    riskSignals: event.riskSignals,
  };

  if (event.type === 'settled') {
    return {
      ...base,
      ap2Stage: 'settled',
      settlement: event.settlement,
      decline: null,
      verification: {
        explorerUrl: getExplorerUrl(
          event.settlement.network,
          event.settlement.txHash,
        ),
        network: event.settlement.network,
      },
    };
  }

  if (event.type === 'declined') {
    return {
      ...base,
      ap2Stage: 'declined',
      settlement: null,
      decline: event.decline,
      verification: null,
    };
  }

  // intent (free content)
  return {
    ...base,
    ap2Stage: 'intent',
    settlement: null,
    decline: null,
    verification: null,
  };
}

// --- Receipt storage ---

export function appendReceipt(receipt: Receipt): void {
  try {
    appendJsonlFile(RECEIPTS_FILENAME, receipt);
  } catch (error: unknown) {
    console.error(
      `[paperwall] Warning: failed to write receipt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface ListReceiptsFilter {
  readonly startDate?: string;
  readonly endDate?: string;
  readonly ap2Stage?: Receipt['ap2Stage'];
  readonly agentId?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListReceiptsResult {
  readonly receipts: Receipt[];
  readonly total: number;
  readonly hasMore: boolean;
}

export function listReceipts(filter: ListReceiptsFilter): ListReceiptsResult {
  let entries = readJsonlFile<Receipt>(RECEIPTS_FILENAME);

  if (filter.ap2Stage) {
    entries = entries.filter((r) => r.ap2Stage === filter.ap2Stage);
  }
  if (filter.agentId) {
    entries = entries.filter((r) => r.agentId === filter.agentId);
  }
  if (filter.startDate) {
    const start = new Date(filter.startDate).getTime();
    entries = entries.filter((r) => new Date(r.timestamp).getTime() >= start);
  }
  if (filter.endDate) {
    const end = new Date(filter.endDate).getTime();
    entries = entries.filter((r) => new Date(r.timestamp).getTime() <= end);
  }

  // Newest first
  entries.reverse();

  const total = entries.length;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  const page = entries.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return { receipts: page, total, hasMore };
}

export function getReceipt(id: string): Receipt | null {
  const entries = readJsonlFile<Receipt>(RECEIPTS_FILENAME);
  return entries.find((r) => r.id === id) ?? null;
}
