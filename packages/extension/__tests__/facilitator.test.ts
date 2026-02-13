import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSupported,
  verify,
  settle,
  clearSupportedCache,
} from '../src/background/facilitator.js';

// ── Helpers ────────────────────────────────────────────────────────

const BASE_URL = 'https://gateway.kobaru.io';

function mockFetchResponse(
  body: Record<string, unknown>,
  status = 200,
): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(message: string): void {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
    new Error(message),
  );
}

// ── Tests ──────────────────────────────────────────────────────────

describe('facilitator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearSupportedCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSupported', () => {
    it('makes correct GET request and returns parsed response', async () => {
      const responseBody = {
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network: 'eip155:324705682',
            extra: {
              name: 'USD Coin',
              version: '2',
              chainId: 324705682,
              verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            },
          },
        ],
        extensions: [],
        signers: {},
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const result = await getSupported(BASE_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toContain('/supported');
      expect((options as RequestInit).method).toBe('GET');
      expect(result.kinds).toHaveLength(1);
      expect(result.kinds[0]!.scheme).toBe('exact');
    });

    it('includes Bearer token when siteKey is provided', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ kinds: [], extensions: [], signers: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      await getSupported(BASE_URL, 'sk_test_abc123');

      const [, options] = fetchSpy.mock.calls[0]!;
      const headers = (options as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['Authorization']).toBe('Bearer sk_test_abc123');
    });

    it('omits Authorization header when no siteKey', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ kinds: [], extensions: [], signers: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      await getSupported(BASE_URL);

      const [, options] = fetchSpy.mock.calls[0]!;
      const headers = (options as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('returns cached result on second call within TTL', async () => {
      const responseBody = { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:324705682', extra: {} }], extensions: [], signers: {} };
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const first = await getSupported(BASE_URL);
      const second = await getSupported(BASE_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('re-fetches after cache TTL expires', async () => {
      vi.useFakeTimers();
      const responseBody = { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:1', extra: {} }], extensions: [], signers: {} };
      const responseBody2 = { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:2', extra: {} }], extensions: [], signers: {} };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(responseBody2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const first = await getSupported(BASE_URL);
      expect(first.kinds[0]!.network).toBe('eip155:1');

      // Advance past 1-hour TTL
      vi.advanceTimersByTime(3_600_001);

      const second = await getSupported(BASE_URL);
      expect(second.kinds[0]!.network).toBe('eip155:2');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('different siteKeys do not share cache', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:a', extra: {} }], extensions: [], signers: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:b', extra: {} }], extensions: [], signers: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const first = await getSupported(BASE_URL, 'key-1');
      const second = await getSupported(BASE_URL, 'key-2');

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(first.kinds[0]!.network).toBe('eip155:a');
      expect(second.kinds[0]!.network).toBe('eip155:b');
    });

    it('clearSupportedCache forces re-fetch', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ kinds: [], extensions: [], signers: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:fresh', extra: {} }], extensions: [], signers: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      await getSupported(BASE_URL);
      clearSupportedCache();
      const second = await getSupported(BASE_URL);

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(second.kinds).toHaveLength(1);
    });
  });

  describe('verify', () => {
    it('makes correct POST request and returns parsed response', async () => {
      const responseBody = { isValid: true };
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const payload = {
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682' as const,
          asset: 'USDC',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: {},
        },
        payload: {
          signature: '0xdeadbeef',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      };
      const requirements = {
        scheme: 'exact' as const,
        network: 'eip155:324705682' as const,
        asset: 'USDC',
        amount: '10000',
        payTo: '0xreceiver',
        maxTimeoutSeconds: 300,
        extra: {},
      };

      const result = await verify(BASE_URL, undefined, payload, requirements);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toContain('/verify');
      expect((options as RequestInit).method).toBe('POST');
      expect(result.isValid).toBe(true);
    });
  });

  describe('settle', () => {
    it('makes correct POST request and returns parsed response', async () => {
      const responseBody = {
        success: true,
        transaction: '0xabc123',
        network: 'eip155:324705682',
      };
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const payload = {
        x402Version: 2,
        resource: { url: 'https://example.com/article', description: '', mimeType: '' },
        accepted: {
          scheme: 'exact',
          network: 'eip155:324705682' as const,
          asset: 'USDC',
          amount: '10000',
          payTo: '0xreceiver',
          maxTimeoutSeconds: 300,
          extra: {},
        },
        payload: {
          signature: '0xdeadbeef',
          authorization: {
            from: '0xsender',
            to: '0xreceiver',
            value: '10000',
            validAfter: '0',
            validBefore: '99999999',
            nonce: '0x1234',
          },
        },
      };
      const requirements = {
        scheme: 'exact' as const,
        network: 'eip155:324705682' as const,
        asset: 'USDC',
        amount: '10000',
        payTo: '0xreceiver',
        maxTimeoutSeconds: 300,
        extra: {},
      };

      const result = await settle(BASE_URL, 'sk_key', payload, requirements);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toContain('/settle');
      expect((options as RequestInit).method).toBe('POST');
      expect(result.success).toBe(true);
      expect(result.transaction).toBe('0xabc123');
    });

    it('includes Bearer token when siteKey is provided', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ success: true, transaction: '0x1', network: 'eip155:324705682' }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );

      const x402Payload = {
        x402Version: 2,
        resource: { url: '', description: '', mimeType: '' },
        accepted: { scheme: 'exact', network: 'eip155:324705682' as const, asset: 'USDC', amount: '10000', payTo: '0x1', maxTimeoutSeconds: 300, extra: {} },
        payload: { signature: '0x1' },
      };
      const x402Requirements = { scheme: 'exact', network: 'eip155:324705682' as const, asset: 'USDC', amount: '10000', payTo: '0x1', maxTimeoutSeconds: 300, extra: {} };

      await settle(BASE_URL, 'sk_test_key', x402Payload, x402Requirements);

      const [, options] = fetchSpy.mock.calls[0]!;
      const headers = (options as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['Authorization']).toBe('Bearer sk_test_key');
    });
  });

  describe('SSRF protection', () => {
    it('rejects HTTP (non-HTTPS) facilitator URLs', async () => {
      await expect(
        getSupported('http://gateway.kobaru.io'),
      ).rejects.toThrow('HTTPS');
    });

    it('rejects localhost', async () => {
      await expect(
        getSupported('https://localhost'),
      ).rejects.toThrow('private IP');
    });

    it('rejects 127.0.0.1', async () => {
      await expect(
        getSupported('https://127.0.0.1'),
      ).rejects.toThrow('private IP');
    });

    it('rejects 10.x.x.x private range', async () => {
      await expect(
        getSupported('https://10.0.0.1'),
      ).rejects.toThrow('private IP');
    });

    it('rejects 192.168.x.x private range', async () => {
      await expect(
        getSupported('https://192.168.1.1'),
      ).rejects.toThrow('private IP');
    });

    it('rejects 172.16.x.x private range', async () => {
      await expect(
        getSupported('https://172.16.0.1'),
      ).rejects.toThrow('private IP');
    });

    it('rejects IPv4-mapped IPv6 in hex form (::ffff:7f00:1)', async () => {
      // URL('https://[::ffff:127.0.0.1]').hostname normalizes to '::ffff:7f00:1'
      await expect(
        settle('https://[::ffff:7f00:1]', undefined, {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('rejects IPv4-mapped IPv6 hex for 10.x.x.x (::ffff:a00:1)', async () => {
      await expect(
        settle('https://[::ffff:a00:1]', undefined, {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('rejects IPv4-mapped IPv6 hex for 192.168.x.x (::ffff:c0a8:1)', async () => {
      await expect(
        settle('https://[::ffff:c0a8:1]', undefined, {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('rejects ::1 loopback', async () => {
      await expect(
        settle('https://[::1]', undefined, {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });
  });

  describe('SSRF protection', () => {
    it('blocks HTTP URLs', async () => {
      await expect(getSupported('http://gateway.kobaru.io')).rejects.toThrow(
        'HTTPS',
      );
    });

    it('blocks localhost', async () => {
      await expect(getSupported('https://localhost/supported')).rejects.toThrow(
        'private IP',
      );
    });

    it('blocks 127.0.0.1', async () => {
      await expect(getSupported('https://127.0.0.1')).rejects.toThrow(
        'private IP',
      );
    });

    it('blocks private 10.x.x.x', async () => {
      await expect(getSupported('https://10.0.0.1')).rejects.toThrow(
        'private IP',
      );
    });

    it('blocks private 192.168.x.x', async () => {
      await expect(getSupported('https://192.168.1.1')).rejects.toThrow(
        'private IP',
      );
    });

    it('blocks IPv4-mapped IPv6 in hex form (::ffff:7f00:1)', async () => {
      // new URL('https://[::ffff:127.0.0.1]').hostname normalizes to '::ffff:7f00:1'
      await expect(
        settle('https://[::ffff:7f00:1]', 'sk_key', {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('blocks IPv4-mapped IPv6 in hex form for 10.x range (::ffff:a00:1)', async () => {
      await expect(
        settle('https://[::ffff:a00:1]', 'sk_key', {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('blocks IPv4-mapped IPv6 in hex form for 192.168.x (::ffff:c0a8:1)', async () => {
      await expect(
        settle('https://[::ffff:c0a8:1]', 'sk_key', {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('blocks IPv4-mapped IPv6 in dotted form (::ffff:127.0.0.1)', async () => {
      await expect(
        settle('https://[::ffff:127.0.0.1]', 'sk_key', {} as never, {} as never),
      ).rejects.toThrow('private IP');
    });

    it('blocks IPv6 loopback (::1)', async () => {
      await expect(getSupported('https://[::1]')).rejects.toThrow(
        'private IP',
      );
    });

    it('blocks IPv6 link-local (fe80::)', async () => {
      await expect(getSupported('https://[fe80::1]')).rejects.toThrow(
        'private IP',
      );
    });

    it('allows valid HTTPS public URL', async () => {
      mockFetchResponse({ kinds: [], extensions: [], signers: {} });
      const result = await getSupported('https://gateway.kobaru.io');
      expect(result.kinds).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('HTTP 401 returns FACILITATOR_ERROR with auth message', async () => {
      mockFetchResponse(
        { error: 'Unauthorized' },
        401,
      );

      await expect(
        getSupported(BASE_URL, 'bad-key'),
      ).rejects.toThrow('Unauthorized');
    });

    it('HTTP 429 returns rate limit error', async () => {
      mockFetchResponse(
        { error: 'Too Many Requests' },
        429,
      );

      await expect(
        getSupported(BASE_URL),
      ).rejects.toThrow('rate limit');
    });

    it('network error returns UNKNOWN error', async () => {
      mockFetchError('Failed to fetch');

      await expect(
        getSupported(BASE_URL),
      ).rejects.toThrow();
    });
  });
});
