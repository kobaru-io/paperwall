// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Paperwall, VERSION } from '../src/index';
import type { PaperwallConfig, PaymentReceipt, PaymentError } from '../src/types';

const VALID_CONFIG: Partial<PaperwallConfig> = {
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
  price: '10000',
  network: 'eip155:324705682',
};

describe('SDK exports', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });
});

describe('Paperwall.init', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Clean up any remaining DOM elements
    document.querySelectorAll('meta[name="x402-payment-required"]').forEach((el) => el.remove());
    document.getElementById('paperwall-badge')?.remove();
    document.getElementById('paperwall-badge-style')?.remove();
  });

  it('emits signal (meta tag)', () => {
    const instance = Paperwall.init(VALID_CONFIG);
    const meta = document.querySelector('meta[name="x402-payment-required"]');
    expect(meta).not.toBeNull();
    instance.destroy();
  });

  it('posts PAPERWALL_PAYMENT_REQUIRED message', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    const instance = Paperwall.init(VALID_CONFIG);

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAPERWALL_PAYMENT_REQUIRED' }),
      window.location.origin,
    );
    instance.destroy();
  });

  it('shows badge', () => {
    const instance = Paperwall.init(VALID_CONFIG);
    expect(document.getElementById('paperwall-badge')).not.toBeNull();
    instance.destroy();
  });

  it('receiving success result fires onPaymentSuccess callback with receipt', async () => {
    const onSuccess = vi.fn();
    const instance = Paperwall.init({
      ...VALID_CONFIG,
      onPaymentSuccess: onSuccess,
    });

    const rawReceipt = {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      txHash: '0xabc123',
      network: 'eip155:324705682',
      amount: '10000',
      from: '0x1234567890123456789012345678901234567890',
      to: VALID_CONFIG.payTo!,
      settledAt: '2026-02-11T00:00:00Z',
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: true,
          receipt: rawReceipt,
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      ...rawReceipt,
      success: true,
      payer: rawReceipt.from,
      payTo: rawReceipt.to,
      resource: window.location.href,
    }));
    instance.destroy();
  });

  it('receiving error result fires onPaymentError callback with error', async () => {
    const onError = vi.fn();
    const instance = Paperwall.init({
      ...VALID_CONFIG,
      onPaymentError: onError,
    });

    const error: PaymentError = {
      code: 'USER_REJECTED',
      message: 'User rejected the payment',
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'PAPERWALL_PAYMENT_RESULT',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
          success: false,
          error,
        },
        origin: window.location.origin,
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(error);
    instance.destroy();
  });

  it('missing callbacks do not throw on payment result', async () => {
    const instance = Paperwall.init(VALID_CONFIG);

    expect(() => {
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
    }).not.toThrow();

    await vi.advanceTimersByTimeAsync(0);
    instance.destroy();
  });
});

describe('instance.destroy', () => {
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

  it('removes signal, badge, and listener', async () => {
    const onSuccess = vi.fn();
    const instance = Paperwall.init({
      ...VALID_CONFIG,
      onPaymentSuccess: onSuccess,
    });

    // Verify everything is present
    expect(document.querySelector('meta[name="x402-payment-required"]')).not.toBeNull();
    expect(document.getElementById('paperwall-badge')).not.toBeNull();

    instance.destroy();

    // Verify everything is removed
    expect(document.querySelector('meta[name="x402-payment-required"]')).toBeNull();
    expect(document.getElementById('paperwall-badge')).toBeNull();

    // Verify listener is removed (no callback)
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

describe('Script tag auto-init', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', {
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelectorAll('meta[name="x402-payment-required"]').forEach((el) => el.remove());
    document.getElementById('paperwall-badge')?.remove();
    document.getElementById('paperwall-badge-style')?.remove();
  });

  it('autoInit with a script element initializes the SDK', () => {
    const script = document.createElement('script');
    script.setAttribute('data-facilitator-url', 'https://gateway.kobaru.io');
    script.setAttribute('data-pay-to', '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01');
    script.setAttribute('data-price', '10000');
    script.setAttribute('data-network', 'eip155:324705682');
    document.head.appendChild(script);

    const instance = Paperwall.autoInit(script);
    expect(instance).not.toBeNull();
    expect(document.querySelector('meta[name="x402-payment-required"]')).not.toBeNull();
    expect(document.getElementById('paperwall-badge')).not.toBeNull();

    instance!.destroy();
    script.remove();
  });

  it('autoInit with a script lacking data attributes returns null', () => {
    const script = document.createElement('script');
    document.head.appendChild(script);

    const instance = Paperwall.autoInit(script);
    expect(instance).toBeNull();

    script.remove();
  });
});
