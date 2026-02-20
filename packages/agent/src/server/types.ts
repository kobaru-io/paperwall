export interface Receipt {
  readonly id: string;
  readonly timestamp: string;
  readonly ap2Stage: 'intent' | 'settled' | 'declined';
  readonly url: string;
  readonly agentId: string | null;
  readonly authorization: AuthorizationContext;
  readonly settlement: SettlementContext | null;
  readonly decline: DeclineContext | null;
  readonly verification: VerificationInfo | null;
  readonly riskSignals: RiskSignals;
}

export interface AuthorizationContext {
  readonly perRequestLimit: string | null;
  readonly dailyLimit: string | null;
  readonly totalLimit: string | null;
  readonly dailySpent: string;
  readonly totalSpent: string;
  readonly requestedAmount: string;
  readonly authorizedAt: string;
  readonly expiresAt: string | null;
}

export interface SettlementContext {
  readonly txHash: string;
  readonly network: string;
  readonly amount: string;
  readonly amountFormatted: string;
  readonly currency: string;
  readonly payer: string;
  readonly payee: string;
}

export interface DeclineContext {
  readonly reason: 'budget_exceeded' | 'max_price_exceeded';
  readonly limit: 'per_request' | 'daily' | 'total' | 'max_price';
  readonly limitValue: string;
  readonly requestedAmount: string | null;
}

export interface VerificationInfo {
  readonly explorerUrl: string;
  readonly network: string;
}

export interface RiskSignals {
  readonly requestSource: 'cli' | 'a2a-rpc' | 'direct-api' | 'mcp';
  readonly timestamp: string;
  readonly agentFirstSeen: string | null;
  readonly agentRequestCount: number;
}

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly accessKeys: string[];
  readonly network: string;
  readonly authTtl: number;
}
