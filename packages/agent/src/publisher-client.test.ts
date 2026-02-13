import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitPayment } from './publisher-client.js';
import type { PaymentPayload } from './facilitator.js';

const VALID_PAYMENT_PAYLOAD: PaymentPayload = {
  x402Version: 2,
  resource: { url: 'https://example.com/article', description: '', mimeType: '' },
  accepted: {
    scheme: 'exact',
    network: 'eip155:324705682',
    asset: 'USDC',
    amount: '10000',
    payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    maxTimeoutSeconds: 300,
    extra: {},
  },
  payload: {
    signature: '0xdeadbeef',
    authorization: {
      from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      value: '10000',
      validAfter: '0',
      validBefore: '1700000000',
      nonce: '0x' + '00'.repeat(32),
    },
  },
};

describe('submitPayment', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should POST payment payload to the publisher paymentUrl and return parsed response', async () => {
    const mockResponse = {
      success: true,
      txHash: '0xpublisher_tx_hash_abc',
      content: '<html><body>Full premium article content</body></html>',
      contentType: 'text/html',
    };

    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchSpy;

    const result = await submitPayment(
      'https://nature.com/api/paperwall/pay',
      VALID_PAYMENT_PAYLOAD,
    );

    expect(result.success).toBe(true);
    expect(result.txHash).toBe('0xpublisher_tx_hash_abc');
    expect(result.content).toBe('<html><body>Full premium article content</body></html>');
    expect(result.contentType).toBe('text/html');

    // Verify the POST was made correctly
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://nature.com/api/paperwall/pay');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    );

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('paymentPayload');
  });

  it('should throw when publisher returns success: false', async () => {
    const mockResponse = {
      success: false,
      error: 'Invalid signature',
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      submitPayment('https://nature.com/api/paperwall/pay', VALID_PAYMENT_PAYLOAD),
    ).rejects.toThrow('Payment URL error: Invalid signature');
  });

  it('should throw when HTTP status is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(
      submitPayment('https://nature.com/api/paperwall/pay', VALID_PAYMENT_PAYLOAD),
    ).rejects.toThrow('Payment URL HTTP error: 500');
  });

  it('should throw on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      submitPayment('https://nature.com/api/paperwall/pay', VALID_PAYMENT_PAYLOAD),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
