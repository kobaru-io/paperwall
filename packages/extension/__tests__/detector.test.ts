// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scanForPaperwall, observeForPaperwall } from '../src/content/detector.js';

// ── DOM Helpers ────────────────────────────────────────────────────

function createMetaTag(
  base64Content: string,
  attrs?: Record<string, string>,
): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.name = 'x402-payment-required';
  meta.content = base64Content;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      meta.setAttribute(key, value);
    }
  }
  return meta;
}

function buildValidSignal() {
  return {
    x402Version: 2,
    resource: { url: 'https://example.com/article' },
    accepts: [
      {
        scheme: 'exact',
        network: 'eip155:324705682',
        amount: '10000',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        payTo: '0x1234567890abcdef1234567890abcdef12345678',
      },
    ],
  };
}

function buildValidBase64(): string {
  return btoa(JSON.stringify(buildValidSignal()));
}

// ── Tests ──────────────────────────────────────────────────────────

describe('detector', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  describe('scanForPaperwall', () => {
    it('returns null when no meta tag is present', () => {
      const result = scanForPaperwall();
      expect(result).toBeNull();
    });

    it('returns parsed PaymentRequiredSignal when meta tag is present', () => {
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result).not.toBeNull();
      expect(result!.signal.x402Version).toBe(2);
      expect(result!.signal.accepts).toHaveLength(1);
      expect(result!.signal.accepts[0]!.payTo).toBe(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
      expect(result!.signal.accepts[0]!.amount).toBe('10000');
      expect(result!.signal.accepts[0]!.network).toBe('eip155:324705682');
    });

    it('extracts facilitatorUrl from data attributes', () => {
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result!.facilitatorUrl).toBe('https://gateway.kobaru.io');
    });

    it('extracts mode from data attributes', () => {
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'server',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result!.mode).toBe('server');
    });

    it('extracts siteKey from data attributes when present', () => {
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
        'data-site-key': 'sk_test_abc123',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result!.siteKey).toBe('sk_test_abc123');
    });

    it('siteKey is undefined when not present', () => {
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result!.siteKey).toBeUndefined();
    });

    it('handles malformed base64 gracefully (returns null)', () => {
      const meta = createMetaTag('not-valid-base64!!!', {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result).toBeNull();
    });

    it('handles invalid JSON in base64 gracefully (returns null)', () => {
      const meta = createMetaTag(btoa('this is not json'), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result).toBeNull();
    });

    it('defaults mode to "client" when data-mode is missing', () => {
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
      });
      document.head.appendChild(meta);

      const result = scanForPaperwall();
      expect(result!.mode).toBe('client');
    });
  });

  describe('observeForPaperwall', () => {
    it('fires callback when meta tag is added dynamically', async () => {
      const callback = vi.fn();
      const disconnect = observeForPaperwall(callback);

      // Add meta tag dynamically
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      // MutationObserver is async, need to wait a tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0]![0]).not.toBeNull();
      expect(callback.mock.calls[0]![0].signal.x402Version).toBe(2);

      disconnect();
    });

    it('returns a disconnect function that stops observing', async () => {
      const callback = vi.fn();
      const disconnect = observeForPaperwall(callback);
      disconnect();

      // Add meta tag after disconnecting
      const meta = createMetaTag(buildValidBase64(), {
        'data-facilitator-url': 'https://gateway.kobaru.io',
        'data-mode': 'client',
      });
      document.head.appendChild(meta);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
