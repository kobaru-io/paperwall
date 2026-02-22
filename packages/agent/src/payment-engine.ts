/**
 * Payment engine — orchestrates the full x402 payment flow.
 *
 * Detection priority:
 *   1. HTTP 402 → @x402/fetch handles it (fallback for non-Paperwall servers)
 *   2. HTTP 200 + meta tag mode="client" → agent calls facilitator directly
 *   3. HTTP 200 + meta tag mode="server" → agent signs + POSTs to paymentUrl
 *   4. HTTP 200 + no meta tag → return content as-is (no payment)
 */

import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { parseMetaTag, parseScriptTag, parseInitCall } from './meta-tag.js';
import { getSupported, settle } from './facilitator.js';
import { submitPayment } from './publisher-client.js';
import { resolvePrivateKey } from './wallet.js';
import { checkBudget, smallestToUsdc } from './budget.js';
import { appendPayment } from './history.js';
import { acquireLock } from './storage.js';
import { log } from './logger.js';
import { getExpectedAsset } from './networks.js';

export interface FetchOptions {
  readonly maxPrice?: string;
  readonly network?: string;
  readonly timeout?: number;
}

interface PaymentInfo {
  readonly mode: 'client' | 'server' | '402';
  readonly amount: string;
  readonly amountFormatted: string;
  readonly asset: string;
  readonly network: string;
  readonly txHash: string;
  readonly payTo: string;
  readonly payer: string;
}

interface FetchSuccess {
  readonly ok: true;
  readonly url: string;
  readonly statusCode: number;
  readonly contentType: string;
  readonly content: string;
  readonly payment?: PaymentInfo;
}

interface FetchDeclined {
  readonly ok: false;
  readonly error: string;
  readonly message: string;
  readonly url: string;
  readonly requestedAmount?: string;
  readonly requestedAmountFormatted?: string;
  readonly budgetReason?: 'per_request' | 'daily' | 'total' | 'max_price' | 'no_budget';
}

interface FetchError {
  readonly ok: false;
  readonly error: string;
  readonly message: string;
  readonly url: string;
}

export type FetchResult = FetchSuccess | FetchDeclined | FetchError;

/**
 * Captured payment info from the @x402/fetch hooks during 402 flow.
 */
interface CapturedX402Payment {
  amount: string;
  network: string;
  payTo: string;
  asset: string;
  payer: string;
}

/**
 * Fetch a URL with automatic x402 payment handling.
 *
 * Detection priority:
 *   1. HTTP 402 → use @x402/fetch with budget hooks
 *   2. HTTP 200 + meta tag → client or server mode
 *   3. HTTP 200 + no meta tag → return content as-is
 */
export async function fetchWithPayment(
  url: string,
  options: FetchOptions,
): Promise<FetchResult> {
  const timeout = options.timeout ?? 30000;

  // Step 1: Make the initial fetch to detect what we're dealing with
  log(`Fetching ${url}...`);
  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = message.includes('aborted') ? 'timeout' : 'network_error';
    return {
      ok: false,
      error: errorCode,
      message: `Failed to fetch: ${message}`,
      url,
    };
  }

  // Step 2: If HTTP 402, handle via @x402/fetch flow
  if (response.status === 402) {
    return handle402Fallback(url, response, options, timeout);
  }

  // Step 3: HTTP 200 — check for meta tag
  const contentType = response.headers.get('content-type') ?? 'text/html';
  const html = await response.text();
  const metaTag = parseMetaTag(html) ?? parseScriptTag(html) ?? parseInitCall(html);

  // Step 4: No meta tag -> return content as-is
  if (!metaTag) {
    return {
      ok: true,
      url,
      statusCode: response.status,
      contentType,
      content: html,
      payment: undefined,
    };
  }

  // Step 5: Meta tag found — handle payment
  const accept = metaTag.accepts[0];
  if (!accept) {
    return {
      ok: false,
      error: 'invalid_meta_tag',
      message: 'Meta tag has no accepted payment terms',
      url,
    };
  }

  log(`Payment detected: ${smallestToUsdc(accept.amount)} USDC (${metaTag.mode} mode)`);

  // Step 5a: Check budget under lock (prevents TOCTOU race in concurrent requests)
  const releaseLock = await acquireLock('budget');
  try {
    const budgetCheck = checkBudget(accept.amount, options.maxPrice);
    if (!budgetCheck.allowed) {
      return buildBudgetDeclined(url, accept.amount, budgetCheck);
    }

    log(`Budget check: OK`);

    if (metaTag.mode === 'client') {
      return await handleClientMode(url, response.status, contentType, html, metaTag, accept);
    }

    if (metaTag.mode === 'server') {
      if (!metaTag.paymentUrl) {
        return {
          ok: false,
          error: 'missing_payment_url',
          message: 'Server mode requires paymentUrl in meta tag but none was found',
          url,
        };
      }
      return await handleServerMode(
        url,
        response.status,
        { facilitatorUrl: metaTag.facilitatorUrl, siteKey: metaTag.siteKey, paymentUrl: metaTag.paymentUrl },
        accept,
      );
    }
  } finally {
    releaseLock();
  }

  return {
    ok: false,
    error: 'unsupported_mode',
    message: `Payment mode "${metaTag.mode}" is not supported`,
    url,
  };
}

/**
 * Build a budget-declined response from a budget check result.
 */
function buildBudgetDeclined(
  url: string,
  amount: string,
  budgetCheck: { reason?: string; limit?: string; spent?: string },
): FetchDeclined {
  const reason = budgetCheck.reason ?? 'unknown';
  let message: string;

  if (reason === 'no_budget') {
    message = 'No budget configured and no --max-price flag. Set a budget or use --max-price.';
  } else if (reason === 'max_price') {
    message = `Requested amount ${smallestToUsdc(amount)} USDC exceeds --max-price limit`;
  } else if (reason === 'daily') {
    message = `Daily budget exceeded: spent ${budgetCheck.spent ? smallestToUsdc(budgetCheck.spent) : '?'} of ${budgetCheck.limit ? smallestToUsdc(budgetCheck.limit) : '?'} daily limit`;
  } else if (reason === 'total') {
    message = `Total budget exceeded: spent ${budgetCheck.spent ? smallestToUsdc(budgetCheck.spent) : '?'} of ${budgetCheck.limit ? smallestToUsdc(budgetCheck.limit) : '?'} lifetime limit`;
  } else if (reason === 'per_request') {
    message = `Requested amount ${smallestToUsdc(amount)} USDC exceeds per-request limit of ${budgetCheck.limit ? smallestToUsdc(budgetCheck.limit) : '?'}`;
  } else {
    message = `Budget check failed: ${reason}`;
  }

  log(`Budget check: DECLINED (${reason})`);

  return {
    ok: false,
    error: reason === 'max_price' ? 'max_price_exceeded' : 'budget_exceeded',
    message,
    url,
    requestedAmount: amount,
    requestedAmountFormatted: smallestToUsdc(amount),
    budgetReason: reason as FetchDeclined['budgetReason'],
  };
}

/**
 * Handle HTTP 402 response using @x402/fetch.
 *
 * Sets up an x402Client with ExactEvmScheme, wires budget check via
 * onBeforePaymentCreation hook, creates a payment-aware fetch, and retries.
 */
async function handle402Fallback(
  url: string,
  initialResponse: Response,
  options: FetchOptions,
  timeout: number,
): Promise<FetchResult> {
  log('HTTP 402 detected — handling via x402 payment flow');

  // Resolve private key first (needed for ExactEvmScheme signer)
  let privateKey: `0x${string}`;
  try {
    privateKey = await resolvePrivateKey();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: 'no_wallet',
      message,
      url,
    };
  }

  const account = privateKeyToAccount(privateKey);
  const signer = toClientEvmSigner(account);

  // Capture payment info from hooks.
  // We use a mutable container because TypeScript's control flow analysis cannot
  // track mutations inside async closures (the onAfterPaymentCreation hook sets
  // the value). Without this, TypeScript narrows captured.payment to 'never'.
  const captured: { payment: CapturedX402Payment | null; budgetAbortReason: string | null } = {
    payment: null,
    budgetAbortReason: null,
  };

  // Set up x402Client with hooks for budget gate and payment capture
  const client = new x402Client()
    .register('eip155:324705682', new ExactEvmScheme(signer))
    .register('eip155:1187947933', new ExactEvmScheme(signer))
    .onBeforePaymentCreation(async (context) => {
      // Budget gate: check if the payment amount is within limits
      const requirements = context.selectedRequirements;
      const amount = requirements.amount;
      const budgetResult = checkBudget(amount, options.maxPrice);

      if (!budgetResult.allowed) {
        captured.budgetAbortReason = amount;
        return { abort: true, reason: 'Budget exceeded' };
      }

      log(`402 budget check: OK (${smallestToUsdc(amount)} USDC)`);
      return undefined;
    })
    .onAfterPaymentCreation(async (context) => {
      // Capture payment info for our response
      const requirements = context.selectedRequirements;
      const payload = context.paymentPayload.payload as Record<string, unknown>;
      const authorization = payload['authorization'] as Record<string, string> | undefined;

      captured.payment = {
        amount: requirements.amount,
        network: requirements.network,
        payTo: requirements.payTo,
        asset: requirements.asset,
        payer: authorization?.['from'] ?? account.address,
      };

      log(`402 payment signed: ${smallestToUsdc(requirements.amount)} USDC`);
    });

  // Create payment-aware fetch that wraps the native fetch
  // We use a custom fetch that returns the initial 402 response on the first call
  // to avoid making a second request to get the 402 again
  let firstCall = true;
  const interceptedFetch: typeof globalThis.fetch = async (input, init) => {
    if (firstCall) {
      firstCall = false;
      // Return the already-fetched 402 response (cloned to allow body re-read)
      return initialResponse;
    }
    // Subsequent calls (retry with payment header) go to the real fetch
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const result = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return result;
    } catch (error: unknown) {
      clearTimeout(timer);
      throw error;
    }
  };

  const wrappedFetch = wrapFetchWithPayment(interceptedFetch, client);

  try {
    const retryResponse = await wrappedFetch(url);

    // Check if budget was rejected via hook
    if (captured.budgetAbortReason) {
      return buildBudgetDeclined(url, captured.budgetAbortReason, checkBudget(captured.budgetAbortReason, options.maxPrice));
    }

    const responseContentType = retryResponse.headers.get('content-type') ?? 'text/html';
    const responseContent = await retryResponse.text();

    // Extract settlement info from PAYMENT-RESPONSE or X-PAYMENT-RESPONSE header
    let txHash = '';
    let payerFromResponse = '';
    let networkFromResponse = '';
    const paymentResponseHeader =
      retryResponse.headers.get('payment-response') ??
      retryResponse.headers.get('x-payment-response');
    if (paymentResponseHeader) {
      try {
        const decoded = decodePaymentResponseHeader(paymentResponseHeader);
        txHash = decoded.transaction ?? '';
        payerFromResponse = decoded.payer ?? '';
        networkFromResponse = decoded.network ?? '';
      } catch {
        // If decode fails, use captured info
      }
    }

    // If we have captured payment info from hooks, build the payment result
    if (captured.payment) {
      const finalPayer = payerFromResponse || captured.payment.payer;
      const finalTxHash = txHash || 'unknown';
      const finalNetwork = networkFromResponse || captured.payment.network;

      // Append to history
      appendPayment({
        ts: new Date().toISOString(),
        url,
        amount: captured.payment.amount,
        asset: captured.payment.asset,
        network: finalNetwork,
        txHash: finalTxHash,
        mode: '402',
      });

      log(`402 payment settled, txHash: ${finalTxHash}`);

      return {
        ok: true,
        url,
        statusCode: retryResponse.status,
        contentType: responseContentType,
        content: responseContent,
        payment: {
          mode: '402',
          amount: captured.payment.amount,
          amountFormatted: smallestToUsdc(captured.payment.amount),
          asset: captured.payment.asset,
          network: finalNetwork,
          txHash: finalTxHash,
          payTo: captured.payment.payTo,
          payer: finalPayer,
        },
      };
    }

    // No payment was made (unlikely if 402 was received, but handle gracefully)
    return {
      ok: true,
      url,
      statusCode: retryResponse.status,
      contentType: responseContentType,
      content: responseContent,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if budget hook aborted the payment
    if (captured.budgetAbortReason) {
      return buildBudgetDeclined(url, captured.budgetAbortReason, checkBudget(captured.budgetAbortReason, options.maxPrice));
    }

    return {
      ok: false,
      error: 'payment_error',
      message: `402 payment flow failed: ${message}`,
      url,
    };
  }
}

/**
 * Handle client-mode payment: agent calls facilitator directly.
 */
async function handleClientMode(
  url: string,
  statusCode: number,
  contentType: string,
  content: string,
  metaTag: { facilitatorUrl: string; siteKey?: string },
  accept: { network: string; amount: string; asset: string; payTo: string },
): Promise<FetchResult> {
  try {
    // Validate asset matches network
    const expectedAsset = getExpectedAsset(accept.network);
    if (expectedAsset && expectedAsset.toLowerCase() !== accept.asset.toLowerCase()) {
      return {
        ok: false,
        error: 'asset_mismatch',
        message: `Asset ${accept.asset} does not match expected ${expectedAsset} for network ${accept.network}`,
        url,
      };
    }

    // Step 4b: Get /supported
    const domainInfo = await getSupported(
      metaTag.facilitatorUrl,
      metaTag.siteKey ?? '',
      accept.network,
    );

    // Step 4c: Resolve private key and create x402 client
    const privateKey = await resolvePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const signer = toClientEvmSigner(account);
    const client = new x402Client()
      .register(accept.network as `${string}:${string}`, new ExactEvmScheme(signer));

    // Step 4d: Sign via x402 library (EIP-3009 TransferWithAuthorization)
    log('Signing EIP-712 authorization...');
    const paymentRequirements = {
      scheme: 'exact',
      network: accept.network as `${string}:${string}`,
      asset: accept.asset,
      amount: accept.amount,
      payTo: accept.payTo,
      maxTimeoutSeconds: 300,
      extra: { ...domainInfo.extra },
    };
    const paymentPayload = await client.createPaymentPayload({
      x402Version: 2,
      resource: { url, description: '', mimeType: '' },
      accepts: [paymentRequirements],
    });

    // Step 4e: POST /settle
    const settleResult = await settle(
      metaTag.facilitatorUrl,
      metaTag.siteKey ?? '',
      paymentPayload,
      paymentRequirements,
    );

    log(`Payment settled, txHash: ${settleResult.txHash}`);

    // Step 4f: Append to history
    appendPayment({
      ts: new Date().toISOString(),
      url,
      amount: accept.amount,
      asset: accept.asset,
      network: accept.network,
      txHash: settleResult.txHash,
      mode: 'client',
    });

    // Step 4g: Return content + payment info
    return {
      ok: true,
      url,
      statusCode,
      contentType,
      content,
      payment: {
        mode: 'client',
        amount: accept.amount,
        amountFormatted: smallestToUsdc(accept.amount),
        asset: accept.asset,
        network: accept.network,
        txHash: settleResult.txHash,
        payTo: accept.payTo,
        payer: account.address,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Settlement failed') || message.includes('/settle failed')) {
      return {
        ok: false,
        error: 'settle_failed',
        message: `Payment settlement failed: ${message}`,
        url,
      };
    }

    if (message.includes('/supported failed')) {
      return {
        ok: false,
        error: 'facilitator_error',
        message: `Facilitator error: ${message}`,
        url,
      };
    }

    if (message.includes('No wallet configured') || message.includes('No wallet key resolution')) {
      return {
        ok: false,
        error: 'no_wallet',
        message,
        url,
      };
    }

    return {
      ok: false,
      error: 'payment_error',
      message: `Payment processing failed: ${message}`,
      url,
    };
  }
}

/**
 * Handle server-mode payment: agent signs and POSTs to publisher's paymentUrl.
 *
 * The publisher's backend calls the facilitator to verify + settle, then returns
 * the full gated content alongside the settlement receipt.
 */
async function handleServerMode(
  url: string,
  statusCode: number,
  metaTag: { facilitatorUrl: string; siteKey?: string; paymentUrl: string },
  accept: { network: string; amount: string; asset: string; payTo: string },
): Promise<FetchResult> {
  try {
    // Validate asset matches network
    const expectedAsset = getExpectedAsset(accept.network);
    if (expectedAsset && expectedAsset.toLowerCase() !== accept.asset.toLowerCase()) {
      return {
        ok: false,
        error: 'asset_mismatch',
        message: `Asset ${accept.asset} does not match expected ${expectedAsset} for network ${accept.network}`,
        url,
      };
    }

    // Step 1: Get /supported from facilitator (need domain info for signing)
    const domainInfo = await getSupported(
      metaTag.facilitatorUrl,
      metaTag.siteKey ?? '',
      accept.network,
    );

    // Step 2: Resolve private key and create x402 client
    const privateKey = await resolvePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const signer = toClientEvmSigner(account);
    const client = new x402Client()
      .register(accept.network as `${string}:${string}`, new ExactEvmScheme(signer));

    // Step 3: Sign via x402 library (EIP-3009 TransferWithAuthorization)
    log('Signing EIP-712 authorization...');
    const paymentPayload = await client.createPaymentPayload({
      x402Version: 2,
      resource: { url, description: '', mimeType: '' },
      accepts: [{
        scheme: 'exact',
        network: accept.network as `${string}:${string}`,
        asset: accept.asset,
        amount: accept.amount,
        payTo: accept.payTo,
        maxTimeoutSeconds: 300,
        extra: { ...domainInfo.extra },
      }],
    });

    // Step 5: POST signature to publisher's paymentUrl
    log(`Submitting payment to publisher: ${metaTag.paymentUrl}`);
    const publisherResult = await submitPayment(metaTag.paymentUrl, paymentPayload);

    log(`Payment settled by publisher, txHash: ${publisherResult.txHash}`);

    // Step 6: Append to history
    appendPayment({
      ts: new Date().toISOString(),
      url,
      amount: accept.amount,
      asset: accept.asset,
      network: accept.network,
      txHash: publisherResult.txHash,
      mode: 'server',
    });

    // Step 7: Return content from publisher response + payment info
    return {
      ok: true,
      url,
      statusCode,
      contentType: publisherResult.contentType,
      content: publisherResult.content,
      payment: {
        mode: 'server',
        amount: accept.amount,
        amountFormatted: smallestToUsdc(accept.amount),
        asset: accept.asset,
        network: accept.network,
        txHash: publisherResult.txHash,
        payTo: accept.payTo,
        payer: account.address,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Payment URL')) {
      return {
        ok: false,
        error: 'payment_url_error',
        message: `Publisher payment failed: ${message}`,
        url,
      };
    }

    if (message.includes('/supported failed')) {
      return {
        ok: false,
        error: 'facilitator_error',
        message: `Facilitator error: ${message}`,
        url,
      };
    }

    if (message.includes('No wallet configured') || message.includes('No wallet key resolution')) {
      return {
        ok: false,
        error: 'no_wallet',
        message,
        url,
      };
    }

    return {
      ok: false,
      error: 'payment_error',
      message: `Payment processing failed: ${message}`,
      url,
    };
  }
}
