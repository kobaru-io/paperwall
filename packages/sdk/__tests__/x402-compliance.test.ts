// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
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

function decodeSignal(meta: HTMLMetaElement): PaymentRequiredSignal {
  return JSON.parse(atob(meta.content));
}

// ── x402 Compliance Tests ────────────────────────────────────────────

describe('x402 SDK signal compliance', () => {
  afterEach(() => {
    removeSignal();
  });

  describe('signal matches PaymentRequired shape', () => {
    it('has x402Version field set to 2', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);
      expect(signal.x402Version).toBe(2);
    });

    it('has resource with url, description, and mimeType', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);

      expect(signal.resource).toBeDefined();
      expect(signal.resource.url).toBe(window.location.href);
      expect(signal.resource).toHaveProperty('description');
      expect(signal.resource).toHaveProperty('mimeType');
    });

    it('has accepts array with at least one PaymentRequirements entry', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);

      expect(signal.accepts).toBeInstanceOf(Array);
      expect(signal.accepts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PaymentOption matches PaymentRequirements shape', () => {
    it('has scheme field', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);
      expect(signal.accepts[0].scheme).toBe('exact');
    });

    it('has network field with CAIP-2 format', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);
      expect(signal.accepts[0].network).toMatch(/^[a-z0-9]+:[a-zA-Z0-9]+$/);
    });

    it('has asset field', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);
      expect(signal.accepts[0].asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    });

    it('has amount field', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);
      expect(signal.accepts[0].amount).toBe('10000');
    });

    it('has payTo field', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);
      expect(signal.accepts[0].payTo).toBe(VALID_CONFIG.payTo);
    });
  });

  describe('type compatibility with @x402/core', () => {
    it('PaymentRequiredSignal is structurally compatible with PaymentRequired', () => {
      emitSignal(VALID_CONFIG);
      const signal = decodeSignal(getMetaTag()!);

      // @x402/core PaymentRequired requires: x402Version, resource { url, description, mimeType }, accepts[]
      // Verify all required fields are present
      const required: Record<string, string> = {
        x402Version: typeof signal.x402Version,
        'resource.url': typeof signal.resource.url,
        'resource.description': typeof (signal.resource as Record<string, unknown>).description,
        'resource.mimeType': typeof (signal.resource as Record<string, unknown>).mimeType,
      };

      expect(required.x402Version).toBe('number');
      expect(required['resource.url']).toBe('string');
      expect(required['resource.description']).toBe('string');
      expect(required['resource.mimeType']).toBe('string');

      // Accepts array items should have scheme, network, asset, amount, payTo
      const accept = signal.accepts[0];
      expect(typeof accept.scheme).toBe('string');
      expect(typeof accept.network).toBe('string');
      expect(typeof accept.asset).toBe('string');
      expect(typeof accept.amount).toBe('string');
      expect(typeof accept.payTo).toBe('string');
    });
  });
});
