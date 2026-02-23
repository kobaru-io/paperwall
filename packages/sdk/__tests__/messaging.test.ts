// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initMessaging, sendPing, destroyMessaging } from '../src/messaging';
import type { PaperwallConfig } from '../src/types';

const VALID_CONFIG: PaperwallConfig = {
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
  price: '10000',
  network: 'eip155:324705682',
  mode: 'client',
};

describe('initMessaging', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  afterEach(() => {
    destroyMessaging();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('posts PAPERWALL_PAYMENT_REQUIRED message to window', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    initMessaging(VALID_CONFIG);

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAPERWALL_PAYMENT_REQUIRED',
      }),
      window.location.origin,
    );
  });

  it('message contains requestId in UUID format', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    initMessaging(VALID_CONFIG);

    const message = postSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(message.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('message contains correct payload', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    initMessaging(VALID_CONFIG);

    const message = postSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(message.type).toBe('PAPERWALL_PAYMENT_REQUIRED');
    expect(message.facilitatorUrl).toBe(VALID_CONFIG.facilitatorUrl);
    expect(message.payTo).toBe(VALID_CONFIG.payTo);
    expect(message.price).toBe(VALID_CONFIG.price);
    expect(message.network).toBe(VALID_CONFIG.network);
  });

  it('receiving PAPERWALL_PAYMENT_RESULT with matching requestId resolves payment promise', async () => {
    const onSuccess = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onPaymentSuccess: onSuccess,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          receipt: {
            requestId: '550e8400-e29b-41d4-a716-446655440000',
            txHash: '0xabc123',
            network: 'eip155:324705682',
            amount: '10000',
            from: '0x1234',
            to: VALID_CONFIG.payTo,
            settledAt: '2026-02-11T00:00:00Z',
          },
        },
        origin: window.location.origin,
      }),
    );

    // Allow microtasks to flush
    await vi.advanceTimersByTimeAsync(0);
    expect(onSuccess).toHaveBeenCalledOnce();

    const receipt = onSuccess.mock.calls[0]![0];
    expect(receipt.success).toBe(true);
    expect(receipt.payer).toBe('0x1234');
    expect(receipt.payTo).toBe(VALID_CONFIG.payTo);
    expect(receipt.resource).toBe(window.location.href);
  });

  it('receiving PAPERWALL_PAYMENT_RESULT with error fires onPaymentError', async () => {
    const onError = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onPaymentError: onError,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: false,
          error: {
            code: 'USER_REJECTED',
            message: 'User rejected the payment',
          },
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('receiving message with non-matching requestId is ignored', async () => {
    const onSuccess = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onPaymentSuccess: onSuccess,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: 'wrong-request-id',
          success: true,
          receipt: {},
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('timeout after 120s fires onPaymentError with TIMEOUT code', async () => {
    const onError = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onPaymentError: onError,
    };

    initMessaging(config);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TIMEOUT',
      }),
    );
  });
});

describe('sendPing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    destroyMessaging();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('posts PAPERWALL_PING message', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    sendPing();

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAPERWALL_PING',
      }),
      window.location.origin,
    );
  });

  it('receiving PAPERWALL_PONG resolves detection promise to true', async () => {
    const promise = sendPing();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'PAPERWALL_PONG' },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    const detected = await promise;
    expect(detected).toBe(true);
  });

  it('no PAPERWALL_PONG within timeout resolves to false', async () => {
    const promise = sendPing();

    // Advance past the ping timeout (2 seconds)
    await vi.advanceTimersByTimeAsync(2_000);
    const detected = await promise;
    expect(detected).toBe(false);
  });
});

describe('destroyMessaging', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('removes event listener (no callback after destroy)', async () => {
    const onSuccess = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onPaymentSuccess: onSuccess,
    };

    initMessaging(config);
    destroyMessaging();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          receipt: {},
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('optimistic payment flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  afterEach(() => {
    destroyMessaging();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires onOptimisticAccess for optimistic payment result', async () => {
    const optimisticSpy = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onOptimisticAccess: optimisticSpy,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          optimistic: true,
          receipt: { amount: '10000', url: 'https://example.com' },
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(optimisticSpy).toHaveBeenCalledOnce();
    expect(optimisticSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: window.location.href,
        amount: '10000',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    );
  });

  it('fires onPaymentSuccess for confirmed payment result', async () => {
    const successSpy = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onPaymentSuccess: successSpy,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          confirmed: true,
          receipt: { txHash: '0xabc', amount: '10000', from: '0x1234', to: VALID_CONFIG.payTo },
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(successSpy).toHaveBeenCalledOnce();
  });

  it('does not clear handler on optimistic result (waits for confirmed)', async () => {
    const optimisticSpy = vi.fn();
    const successSpy = vi.fn();
    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      onOptimisticAccess: optimisticSpy,
      onPaymentSuccess: successSpy,
    };

    initMessaging(config);

    // First: optimistic
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          optimistic: true,
          receipt: { amount: '10000' },
        },
        origin: window.location.origin,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(optimisticSpy).toHaveBeenCalledOnce();

    // Then: confirmed
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          confirmed: true,
          receipt: { txHash: '0xabc', amount: '10000', from: '0x1234', to: VALID_CONFIG.payTo },
        },
        origin: window.location.origin,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(successSpy).toHaveBeenCalledOnce();
  });
});

describe('PAPERWALL_SIGNATURE (server mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  afterEach(() => {
    destroyMessaging();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('forwards signature to paymentUrl in server mode and fires onPaymentSuccess', async () => {
    const onSuccess = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ txHash: '0xserverhash', settledAt: '2026-02-12T00:00:00Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      mode: 'server',
      paymentUrl: 'https://example.com/pay',
      onPaymentSuccess: onSuccess,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_SIGNATURE',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          payload: {
            signature: '0xsig',
            authorization: { from: '0xpayer', to: '0xpayee' },
          },
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    // Allow async fetch to resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/pay',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: '0xserverhash',
        success: true,
        resource: window.location.href,
      }),
    );
  });

  it('is ignored in client mode', async () => {
    const onSuccess = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      mode: 'client',
      onPaymentSuccess: onSuccess,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_SIGNATURE',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          payload: {
            signature: '0xsig',
            authorization: {},
          },
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    // fetch is called once for the initial PAPERWALL_PAYMENT_REQUIRED postMessage (not for signature)
    // In client mode, PAPERWALL_SIGNATURE should be a no-op
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('fires onPaymentError when server returns non-ok status', async () => {
    const onError = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Payment rejected', { status: 400 }),
    );

    const config: PaperwallConfig = {
      ...VALID_CONFIG,
      mode: 'server',
      paymentUrl: 'https://example.com/pay',
      onPaymentError: onError,
    };

    initMessaging(config);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_SIGNATURE',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          payload: {
            signature: '0xsig',
            authorization: {},
          },
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FACILITATOR_ERROR',
      }),
    );
  });
});
