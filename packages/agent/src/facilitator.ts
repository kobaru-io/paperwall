/**
 * Facilitator client for x402 payment settlement (client mode).
 *
 * In client mode, the agent calls the facilitator directly — the same role
 * that the browser extension plays. Uses the publisher's site key (pwk_*)
 * for authentication.
 */

import type {
  PaymentPayload as X402PaymentPayload,
  PaymentRequirements as X402PaymentRequirements,
  SettleResponse as X402SettleResponse,
  SupportedResponse as X402SupportedResponse,
} from '@x402/core/types';

export type { X402PaymentPayload as PaymentPayload, X402PaymentRequirements as PaymentRequirements };

export interface EIP712DomainInfo {
  readonly name: string;
  readonly version: string;
  readonly verifyingContract: string;
  readonly extra: Record<string, unknown>;
}

export interface SettleResult {
  readonly success: true;
  readonly txHash: string;
  readonly network: string;
  readonly payer?: string;
}

/**
 * Fetch EIP-712 domain info from the facilitator's /supported endpoint.
 *
 * @param facilitatorUrl - Base URL of the facilitator (e.g., "https://gateway.kobaru.io")
 * @param siteKey - Publisher site key (pwk_*)
 * @param network - CAIP-2 network identifier to match
 * @returns EIP-712 domain info (name, version, verifyingContract)
 */
export async function getSupported(
  facilitatorUrl: string,
  siteKey: string,
  network: string,
): Promise<EIP712DomainInfo> {
  const url = `${facilitatorUrl}/supported`;

  const headers: Record<string, string> = {};
  if (siteKey) {
    headers['Authorization'] = `Bearer ${siteKey}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Facilitator /supported failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as X402SupportedResponse;

  // Find the kind matching the requested network
  const matchingKind = data.kinds.find(
    (kind) => kind.network === network && kind.scheme === 'exact',
  );

  if (!matchingKind) {
    throw new Error(`No supported kind found for network ${network}`);
  }

  const extra = matchingKind.extra as Record<string, unknown> | undefined;
  if (!extra) {
    throw new Error(`No EIP-712 domain info for network ${network}`);
  }

  return {
    name: extra['name'] as string,
    version: extra['version'] as string,
    verifyingContract: extra['asset'] as string,
    extra,
  };
}

/**
 * Submit a signed payment to the facilitator's /settle endpoint.
 *
 * @param facilitatorUrl - Base URL of the facilitator
 * @param siteKey - Publisher site key (pwk_*)
 * @param paymentPayload - Signed payment payload (x402 v2 envelope)
 * @param paymentRequirements - The payment requirements for settlement
 * @returns Settlement result with txHash
 * @throws Error if settlement fails or server returns error
 */
export async function settle(
  facilitatorUrl: string,
  siteKey: string,
  paymentPayload: X402PaymentPayload,
  paymentRequirements: X402PaymentRequirements,
): Promise<SettleResult> {
  const url = `${facilitatorUrl}/settle`;

  const settleHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (siteKey) {
    settleHeaders['Authorization'] = `Bearer ${siteKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: settleHeaders,
    body: JSON.stringify({ paymentPayload, paymentRequirements }),
  });

  if (!response.ok) {
    throw new Error(`Facilitator /settle failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as X402SettleResponse;

  if (!data.success) {
    throw new Error(`Settlement failed: ${data.errorReason ?? data.errorMessage ?? 'unknown'}`);
  }

  return {
    success: true,
    txHash: data.transaction,
    network: data.network,
    payer: data.payer,
  };
}
