import { fetchWithPayment } from '../payment-engine.js';
import { getBudget, smallestToUsdc } from '../budget.js';
import { getTodayTotal, getLifetimeTotal } from '../history.js';
import { createReceipt, appendReceipt } from './receipt-manager.js';
import { recordAgentRequest } from './agent-registry.js';
import type { Receipt, AuthorizationContext, RiskSignals } from './types.js';
import type { PaymentEvent } from './receipt-manager.js';

interface OrchestrateOptions {
  readonly url: string;
  readonly maxPrice?: string;
  readonly agentId: string | null;
  readonly network?: string;
  readonly timeout?: number;
  readonly requestSource: RiskSignals['requestSource'];
  readonly authTtl: number;
}

interface OrchestrateSuccess {
  readonly ok: true;
  readonly content: string;
  readonly contentType: string;
  readonly payment: {
    readonly mode: string;
    readonly amount: string;
    readonly amountFormatted: string;
    readonly network: string;
    readonly txHash: string;
    readonly payee: string;
  } | null;
  readonly receipt: Receipt;
}

interface OrchestrateFailure {
  readonly ok: false;
  readonly error: string;
  readonly message: string;
  readonly receipt: Receipt;
}

export type OrchestrateResult = OrchestrateSuccess | OrchestrateFailure;

export async function orchestrateFetch(
  options: OrchestrateOptions,
): Promise<OrchestrateResult> {
  const now = new Date().toISOString();
  const authContext = buildAuthorizationContext(options.maxPrice, now, options.authTtl);
  const agentActivity = recordAgentRequest(options.agentId);
  const riskSignals: RiskSignals = {
    requestSource: options.requestSource,
    timestamp: now,
    agentFirstSeen: agentActivity?.firstSeen ?? null,
    agentRequestCount: agentActivity?.requestCount ?? 0,
  };

  const result = await fetchWithPayment(options.url, {
    maxPrice: options.maxPrice,
    network: options.network,
    timeout: options.timeout,
  });

  if (result.ok) {
    const payment = result.payment;

    let event: PaymentEvent;
    if (payment) {
      event = {
        type: 'settled',
        url: result.url,
        agentId: options.agentId,
        authorization: {
          ...authContext,
          requestedAmount: smallestToUsdc(payment.amount),
        },
        settlement: {
          txHash: payment.txHash,
          network: payment.network,
          amount: payment.amount,
          amountFormatted: payment.amountFormatted,
          currency: payment.asset,
          payer: payment.payer,
          payee: payment.payTo,
        },
        riskSignals,
      };
    } else {
      event = {
        type: 'intent',
        url: result.url,
        agentId: options.agentId,
        authorization: { ...authContext, requestedAmount: '0.00' },
        riskSignals,
      };
    }

    const receipt = createReceipt(event);
    appendReceipt(receipt);

    return {
      ok: true,
      content: result.content,
      contentType: result.contentType,
      payment: payment
        ? {
            mode: payment.mode,
            amount: payment.amount,
            amountFormatted: payment.amountFormatted,
            network: payment.network,
            txHash: payment.txHash,
            payee: payment.payTo,
          }
        : null,
      receipt,
    };
  }

  // Failure: declined or error
  const isDecline =
    result.error === 'budget_exceeded' ||
    result.error === 'max_price_exceeded';

  let event: PaymentEvent;
  if (isDecline) {
    const requestedAmount =
      'requestedAmountFormatted' in result
        ? (result.requestedAmountFormatted ?? '0.00')
        : '0.00';
    event = {
      type: 'declined',
      url: result.url,
      agentId: options.agentId,
      authorization: { ...authContext, requestedAmount },
      decline: {
        reason: result.error as 'budget_exceeded' | 'max_price_exceeded',
        limit: mapErrorToLimit(result.error),
        limitValue:
          authContext.perRequestLimit ??
          authContext.dailyLimit ??
          authContext.totalLimit ??
          '0.00',
        requestedAmount:
          'requestedAmountFormatted' in result
            ? (result.requestedAmountFormatted ?? null)
            : null,
      },
      riskSignals,
    };
  } else {
    event = {
      type: 'intent',
      url: result.url,
      agentId: options.agentId,
      authorization: { ...authContext, requestedAmount: '0.00' },
      riskSignals,
    };
  }

  const receipt = createReceipt(event);
  appendReceipt(receipt);

  return {
    ok: false,
    error: result.error,
    message: result.message,
    receipt,
  };
}

function buildAuthorizationContext(
  maxPrice: string | undefined,
  authorizedAt: string,
  authTtl: number,
): Omit<AuthorizationContext, 'requestedAmount'> {
  const budget = getBudget();
  const dailySpent = smallestToUsdc(getTodayTotal());
  const totalSpent = smallestToUsdc(getLifetimeTotal());

  const expiresAt =
    authTtl > 0
      ? new Date(Date.now() + authTtl * 1000).toISOString()
      : null;

  return {
    perRequestLimit: maxPrice ?? budget?.perRequestMax ?? null,
    dailyLimit: budget?.dailyMax ?? null,
    totalLimit: budget?.totalMax ?? null,
    dailySpent,
    totalSpent,
    authorizedAt,
    expiresAt,
  };
}

function mapErrorToLimit(
  error: string,
): 'per_request' | 'daily' | 'total' | 'max_price' {
  if (error === 'max_price_exceeded') return 'max_price';
  return 'per_request';
}
