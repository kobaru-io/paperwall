/**
 * Publisher client for server-mode x402 payment.
 *
 * In server mode, the agent signs the payment and POSTs it to the publisher's
 * paymentUrl. The publisher's backend calls the facilitator to verify + settle,
 * then returns the full gated content alongside the settlement receipt.
 */

import type { PaymentPayload } from './facilitator.js';
import { assertAllowedUrl } from './url-validation.js';

export interface PublisherPaymentResponse {
  readonly success: true;
  readonly txHash: string;
  readonly content: string;
  readonly contentType: string;
}

interface PublisherErrorResponse {
  readonly success: false;
  readonly error: string;
}

/**
 * Submit a signed payment to a publisher's paymentUrl.
 *
 * @param paymentUrl - The publisher's payment endpoint URL
 * @param paymentPayload - The signed payment payload (same format as /settle)
 * @returns Parsed success response with content and txHash
 * @throws Error if the request fails, HTTP status is not ok, or publisher returns error
 */
export async function submitPayment(
  paymentUrl: string,
  paymentPayload: PaymentPayload,
): Promise<PublisherPaymentResponse> {
  assertAllowedUrl(paymentUrl, 'Payment URL');
  const response = await fetch(paymentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentPayload }),
  });

  if (!response.ok) {
    throw new Error(`Payment URL HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as PublisherPaymentResponse | PublisherErrorResponse;

  if (!data.success) {
    throw new Error(`Payment URL error: ${data.error}`);
  }

  return {
    success: true,
    txHash: data.txHash,
    content: data.content,
    contentType: data.contentType,
  };
}
