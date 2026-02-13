import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSupported, settle } from './facilitator.js';

describe('facilitator client', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getSupported', () => {
    it('should call GET /supported with correct Authorization header', async () => {
      const mockResponse = {
        kinds: [
          {
            scheme: 'exact',
            network: 'eip155:324705682',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            extra: {
              name: 'USDC',
              version: '2',
              asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            },
          },
        ],
      };

      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchSpy;

      await getSupported('https://gateway.kobaru.io', 'pwk_live_abc123', 'eip155:324705682');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://gateway.kobaru.io/supported');
      expect(options.method).toBe('GET');
      expect(options.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer pwk_live_abc123' }),
      );
    });

    it('should return EIP-712 domain info from the matching kind', async () => {
      const mockResponse = {
        kinds: [
          {
            scheme: 'exact',
            network: 'eip155:324705682',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            extra: {
              name: 'USDC',
              version: '2',
              asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            },
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await getSupported('https://gateway.kobaru.io', 'pwk_live_abc123', 'eip155:324705682');

      expect(result).toEqual({
        name: 'USDC',
        version: '2',
        verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        extra: {
          name: 'USDC',
          version: '2',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        },
      });
    });

    it('should select the kind matching the requested network', async () => {
      const mockResponse = {
        kinds: [
          {
            scheme: 'exact',
            network: 'eip155:1187947933',
            asset: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
            extra: {
              name: 'USDC',
              version: '2',
              asset: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
            },
          },
          {
            scheme: 'exact',
            network: 'eip155:324705682',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            extra: {
              name: 'USDC',
              version: '2',
              asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            },
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await getSupported('https://gateway.kobaru.io', 'pwk_live_abc123', 'eip155:324705682');

      expect(result.verifyingContract).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    });

    it('should throw when no matching kind is found for the network', async () => {
      const mockResponse = {
        kinds: [
          {
            scheme: 'exact',
            network: 'eip155:1187947933',
            asset: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
            extra: {
              name: 'USDC',
              version: '2',
              asset: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
            },
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(
        getSupported('https://gateway.kobaru.io', 'pwk_live_abc123', 'eip155:324705682'),
      ).rejects.toThrow('No supported kind found for network eip155:324705682');
    });

    it('should throw on non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(
        getSupported('https://gateway.kobaru.io', 'pwk_bad_key', 'eip155:324705682'),
      ).rejects.toThrow('Facilitator /supported failed');
    });

    it('should throw on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        getSupported('https://gateway.kobaru.io', 'pwk_live_abc123', 'eip155:324705682'),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('settle', () => {
    const paymentPayload = {
      x402Version: 2,
      resource: { url: 'https://example.com/article', description: '', mimeType: '' },
      accepted: {
        scheme: 'exact',
        network: 'eip155:324705682' as const,
        asset: 'USDC',
        amount: '10000',
        payTo: '0x2222222222222222222222222222222222222222',
        maxTimeoutSeconds: 300,
        extra: {},
      },
      payload: {
        signature: '0xabc123',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '10000',
          validAfter: '0',
          validBefore: '1700000060',
          nonce: '0x' + 'ab'.repeat(32),
        },
      },
    };

    it('should call POST /settle with correct Authorization header and body', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            transaction: '0xsettled123',
            network: 'eip155:324705682',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      globalThis.fetch = fetchSpy;

      await settle('https://gateway.kobaru.io', 'pwk_live_abc123', paymentPayload);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://gateway.kobaru.io/settle');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer pwk_live_abc123',
          'Content-Type': 'application/json',
        }),
      );

      const body = JSON.parse(options.body as string) as { paymentPayload: unknown };
      expect(body.paymentPayload).toEqual(paymentPayload);
    });

    it('should return success with txHash on successful settlement', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            transaction: '0xsettled456',
            network: 'eip155:324705682',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await settle('https://gateway.kobaru.io', 'pwk_live_abc123', paymentPayload);

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xsettled456');
    });

    it('should throw on settlement failure response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            errorReason: 'Insufficient funds',
            transaction: '',
            network: 'eip155:324705682',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await expect(
        settle('https://gateway.kobaru.io', 'pwk_live_abc123', paymentPayload),
      ).rejects.toThrow('Settlement failed: Insufficient funds');
    });

    it('should throw on non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(
        settle('https://gateway.kobaru.io', 'pwk_live_abc123', paymentPayload),
      ).rejects.toThrow('Facilitator /settle failed');
    });

    it('should throw on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        settle('https://gateway.kobaru.io', 'pwk_live_abc123', paymentPayload),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });
});
