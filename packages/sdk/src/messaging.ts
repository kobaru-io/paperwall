import type { PaperwallConfig, PaymentReceipt, PaymentError } from './types';

/** How long to wait for payment result before timing out (ms). */
const PAYMENT_TIMEOUT_MS = 120_000;

/** How long to wait for PONG response to ping (ms). */
const PING_TIMEOUT_MS = 2_000;

/** Active message handler reference for cleanup. */
let activeHandler: ((event: MessageEvent) => void) | null = null;

/** Active payment timeout ID for cleanup. */
let paymentTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Posts a PAPERWALL_PAYMENT_REQUIRED message to the window and
 * listens for a PAPERWALL_PAYMENT_RESULT response.
 *
 * Fires onPaymentSuccess or onPaymentError callbacks accordingly.
 * Times out after 120 seconds with a TIMEOUT error.
 */
export function initMessaging(config: PaperwallConfig): void {
  // Clean up any previous listener
  destroyMessaging();

  const requestId = crypto.randomUUID();

  // Post payment required message for extension to pick up
  window.postMessage(
    {
      type: 'PAPERWALL_PAYMENT_REQUIRED',
      requestId,
      facilitatorUrl: config.facilitatorUrl,
      payTo: config.payTo,
      price: config.price,
      network: config.network,
      mode: config.mode,
      siteKey: config.siteKey,
    },
    window.location.origin,
  );

  // Listen for payment result or signature from extension
  const handler = (event: MessageEvent): void => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Handle server mode: extension sends signature for publisher to settle
    if (data.type === 'PAPERWALL_SIGNATURE' && data.requestId === requestId) {
      if (config.mode === 'server' && config.paymentUrl) {
        handleServerModeSignature(config, requestId, data);
      }
      return;
    }

    if (data.type !== 'PAPERWALL_PAYMENT_RESULT') return;
    if (data.requestId !== requestId) return;

    // Clear timeout since we received a response
    if (paymentTimeoutId !== null) {
      clearTimeout(paymentTimeoutId);
      paymentTimeoutId = null;
    }

    // Clean up handler to prevent dual callbacks
    if (activeHandler) {
      window.removeEventListener('message', activeHandler);
      activeHandler = null;
    }

    if (data.success && config.onPaymentSuccess) {
      const raw = data.receipt as Record<string, unknown>;
      const receipt: PaymentReceipt = {
        requestId: (raw.requestId as string) ?? requestId,
        txHash: (raw.txHash as string) ?? '',
        network: (raw.network as string) ?? config.network,
        amount: (raw.amount as string) ?? config.price,
        from: (raw.from as string) ?? '',
        to: (raw.to as string) ?? config.payTo,
        settledAt: (raw.settledAt as string) ?? new Date().toISOString(),
        success: true,
        payer: (raw.from as string) ?? '',
        payTo: (raw.to as string) ?? config.payTo,
        resource: window.location.href,
      };
      config.onPaymentSuccess(receipt);
    } else if (!data.success && config.onPaymentError) {
      config.onPaymentError(data.error as PaymentError);
    }
  };

  activeHandler = handler;
  window.addEventListener('message', handler);

  // Set payment timeout
  paymentTimeoutId = setTimeout(() => {
    if (config.onPaymentError) {
      config.onPaymentError({
        code: 'TIMEOUT',
        message: 'Payment timed out after 120 seconds',
        requestId,
      });
    }
  }, PAYMENT_TIMEOUT_MS);
}

/**
 * Sends a PAPERWALL_PING message and returns a promise that resolves
 * to true if the extension responds with PAPERWALL_PONG within 2 seconds,
 * or false on timeout.
 */
export function sendPing(): Promise<boolean> {
  window.postMessage({ type: 'PAPERWALL_PING' }, window.location.origin);

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const handler = (event: MessageEvent): void => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'PAPERWALL_PONG') return;

      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        clearTimeout(timeoutId);
        resolve(true);
      }
    };

    window.addEventListener('message', handler);

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(false);
      }
    }, PING_TIMEOUT_MS);
  });
}

/**
 * Handles server-mode signature from extension.
 * Forwards signature + authorization to the publisher's paymentUrl.
 */
async function handleServerModeSignature(
  config: PaperwallConfig,
  requestId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const payload = data.payload as Record<string, unknown> | undefined;
  if (!payload || !config.paymentUrl) return;

  try {
    const response = await fetch(config.paymentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: payload.signature,
        authorization: payload.authorization,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (config.onPaymentError) {
        config.onPaymentError({
          code: 'FACILITATOR_ERROR',
          message: `Server-mode payment failed: ${body}`,
          requestId,
        });
      }
      return;
    }

    const result = (await response.json()) as Record<string, unknown>;
    if (config.onPaymentSuccess) {
      config.onPaymentSuccess({
        requestId,
        txHash: (result.txHash as string) ?? '',
        network: config.network,
        amount: config.price,
        from: (payload.from as string) ?? '',
        to: config.payTo,
        settledAt: (result.settledAt as string) ?? new Date().toISOString(),
        success: true,
        payer: (payload.from as string) ?? '',
        payTo: config.payTo,
        resource: window.location.href,
      });
    }
  } catch (err) {
    if (config.onPaymentError) {
      config.onPaymentError({
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Server-mode payment failed',
        requestId,
      });
    }
  }
}

/**
 * Removes the active message listener and clears any pending timeouts.
 */
export function destroyMessaging(): void {
  if (activeHandler) {
    window.removeEventListener('message', activeHandler);
    activeHandler = null;
  }

  if (paymentTimeoutId !== null) {
    clearTimeout(paymentTimeoutId);
    paymentTimeoutId = null;
  }
}
