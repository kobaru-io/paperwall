// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emitSignal, removeSignal } from '../src/signal';
import type { PaperwallConfig, PaymentRequiredSignal } from '../src/types';

const VALID_CONFIG: PaperwallConfig = {
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
  price: '10000',
  network: 'eip155:324705682',
  mode: 'client',
};

function getMetaTag(): HTMLMetaElement | null {
  return document.querySelector('meta[name="x402-payment-required"]');
}

function decodeMetaContent(meta: HTMLMetaElement): PaymentRequiredSignal {
  const json = atob(meta.content);
  return JSON.parse(json);
}

describe('emitSignal', () => {
  afterEach(() => {
    removeSignal();
  });

  it('inserts <meta name="x402-payment-required"> into head', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag();
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('x402-payment-required');
    expect(document.head.contains(meta)).toBe(true);
  });

  it('meta content is base64-encoded valid JSON matching PaymentRequiredSignal', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag()!;
    const signal = decodeMetaContent(meta);

    expect(signal.x402Version).toBe(2);
    expect(signal.accepts).toHaveLength(1);
    expect(signal.accepts[0].scheme).toBe('exact');
    expect(signal.accepts[0].payTo).toBe(VALID_CONFIG.payTo);
    expect(signal.accepts[0].amount).toBe(VALID_CONFIG.price);
    expect(signal.accepts[0].network).toBe(VALID_CONFIG.network);
    expect(signal.accepts[0].asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
  });

  it('resource.url matches window.location.href', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag()!;
    const signal = decodeMetaContent(meta);
    expect(signal.resource.url).toBe(window.location.href);
  });

  it('sets data-facilitator-url attribute correctly', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag()!;
    expect(meta.getAttribute('data-facilitator-url')).toBe(VALID_CONFIG.facilitatorUrl);
  });

  it('sets data-mode attribute correctly', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag()!;
    expect(meta.getAttribute('data-mode')).toBe('client');
  });

  it('sets data-site-key attribute when siteKey is present', () => {
    emitSignal({ ...VALID_CONFIG, siteKey: 'my-key' });
    const meta = getMetaTag()!;
    expect(meta.getAttribute('data-site-key')).toBe('my-key');
  });

  it('does not set data-site-key attribute when siteKey is absent', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag()!;
    expect(meta.hasAttribute('data-site-key')).toBe(false);
  });

  it('should emit data-optimistic="true" by default', () => {
    emitSignal(VALID_CONFIG);
    const meta = getMetaTag()!;
    expect(meta.getAttribute('data-optimistic')).toBe('true');
  });

  it('should emit data-optimistic="false" when publisher opts out', () => {
    emitSignal({ ...VALID_CONFIG, optimistic: false });
    const meta = getMetaTag()!;
    expect(meta.getAttribute('data-optimistic')).toBe('false');
  });

  it('should emit data-optimistic="true" when explicitly set', () => {
    emitSignal({ ...VALID_CONFIG, optimistic: true });
    const meta = getMetaTag()!;
    expect(meta.getAttribute('data-optimistic')).toBe('true');
  });

  it('calling emitSignal() twice replaces (not duplicates) the meta tag', () => {
    emitSignal(VALID_CONFIG);
    emitSignal({ ...VALID_CONFIG, price: '20000' });

    const metas = document.querySelectorAll('meta[name="x402-payment-required"]');
    expect(metas.length).toBe(1);

    const signal = decodeMetaContent(metas[0] as HTMLMetaElement);
    expect(signal.accepts[0].amount).toBe('20000');
  });
});

describe('removeSignal', () => {
  it('removes the meta tag', () => {
    emitSignal(VALID_CONFIG);
    expect(getMetaTag()).not.toBeNull();

    removeSignal();
    expect(getMetaTag()).toBeNull();
  });

  it('does not throw when no meta tag exists', () => {
    expect(() => removeSignal()).not.toThrow();
  });
});
