// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseConfig, parseScriptTag } from '../src/config';
import { PaperwallError } from '../src/types';
import type { AcceptEntry } from '../src/types';

const VALID_CONFIG = {
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
  price: '10000',
  network: 'eip155:324705682',
};

describe('parseConfig', () => {
  it('returns parsed config with all required fields', () => {
    const config = parseConfig(VALID_CONFIG);
    expect(config.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(config.payTo).toBe('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01');
    expect(config.price).toBe('10000');
    expect(config.network).toBe('eip155:324705682');
  });

  it('defaults mode to "client"', () => {
    const config = parseConfig(VALID_CONFIG);
    expect(config.mode).toBe('client');
  });

  it('throws PaperwallError when facilitatorUrl is missing', () => {
    const { facilitatorUrl, ...rest } = VALID_CONFIG;
    expect(() => parseConfig(rest)).toThrow(PaperwallError);
    expect(() => parseConfig(rest)).toThrow(/facilitatorUrl/);
  });

  it('throws PaperwallError when payTo is missing', () => {
    const { payTo, ...rest } = VALID_CONFIG;
    expect(() => parseConfig(rest)).toThrow(PaperwallError);
    expect(() => parseConfig(rest)).toThrow(/payTo/);
  });

  it('throws PaperwallError when price is missing', () => {
    const { price, ...rest } = VALID_CONFIG;
    expect(() => parseConfig(rest)).toThrow(PaperwallError);
    expect(() => parseConfig(rest)).toThrow(/price/);
  });

  it('throws PaperwallError when both network and accepts are missing', () => {
    const { network, ...rest } = VALID_CONFIG;
    expect(() => parseConfig(rest)).toThrow(PaperwallError);
    expect(() => parseConfig(rest)).toThrow(/network/);
  });

  it('throws PaperwallError for invalid URL', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, facilitatorUrl: 'not-a-url' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, facilitatorUrl: 'not-a-url' }))
      .toThrow(/facilitatorUrl/);
  });

  it('throws PaperwallError for invalid Ethereum address', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, payTo: '0xINVALID' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, payTo: '0xINVALID' }))
      .toThrow(/payTo/);
  });

  it('throws PaperwallError for invalid CAIP-2 network', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, network: 'invalid-network' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, network: 'invalid-network' }))
      .toThrow(/network/);
  });

  it('throws PaperwallError for decimal price (must be integer)', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, price: '0.01' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, price: '0.01' }))
      .toThrow(/integer/);
  });

  it('throws PaperwallError for negative price', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, price: '-100' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, price: '-100' }))
      .toThrow(/positive/);
  });

  it('accepts large integer prices', () => {
    const config = parseConfig({ ...VALID_CONFIG, price: '1000000000000' });
    expect(config.price).toBe('1000000000000');
  });

  it('throws PaperwallError when mode is "server" without paymentUrl', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, mode: 'server' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, mode: 'server' }))
      .toThrow(/paymentUrl/);
  });

  it('accepts mode "server" with valid paymentUrl', () => {
    const config = parseConfig({
      ...VALID_CONFIG,
      mode: 'server',
      paymentUrl: 'https://example.com/payment',
    });
    expect(config.mode).toBe('server');
    expect(config.paymentUrl).toBe('https://example.com/payment');
  });

  it('preserves optional asset when provided', () => {
    const config = parseConfig({ ...VALID_CONFIG, asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD' });
    expect(config.asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
  });

  it('throws PaperwallError for invalid asset address', () => {
    expect(() => parseConfig({ ...VALID_CONFIG, asset: 'not-an-address' }))
      .toThrow(PaperwallError);
    expect(() => parseConfig({ ...VALID_CONFIG, asset: 'not-an-address' }))
      .toThrow(/asset/);
  });

  it('allows omitting asset (undefined)', () => {
    const config = parseConfig(VALID_CONFIG);
    expect(config.asset).toBeUndefined();
  });

  it('preserves optional siteKey when provided', () => {
    const config = parseConfig({ ...VALID_CONFIG, siteKey: 'my-site-key' });
    expect(config.siteKey).toBe('my-site-key');
  });

  it('preserves optional callbacks when provided', () => {
    const onSuccess = () => {};
    const onError = () => {};
    const config = parseConfig({
      ...VALID_CONFIG,
      onPaymentSuccess: onSuccess,
      onPaymentError: onError,
    });
    expect(config.onPaymentSuccess).toBe(onSuccess);
    expect(config.onPaymentError).toBe(onError);
  });

  it('should pass through optimistic field', () => {
    const config = parseConfig({ ...VALID_CONFIG, optimistic: false });
    expect(config.optimistic).toBe(false);
  });

  it('should default optimistic to undefined when not provided', () => {
    const config = parseConfig(VALID_CONFIG);
    expect(config.optimistic).toBeUndefined();
  });

  it('should pass through onOptimisticAccess callback', () => {
    const cb = () => {};
    const config = parseConfig({ ...VALID_CONFIG, onOptimisticAccess: cb });
    expect(config.onOptimisticAccess).toBe(cb);
  });

  describe('multi-network (accepts[])', () => {
    const MULTI_CONFIG_BASE = {
      facilitatorUrl: 'https://gateway.kobaru.io',
      payTo: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
      price: '10000',
    };

    const VALID_ACCEPTS: AcceptEntry[] = [
      { network: 'eip155:8453' },
      { network: 'eip155:324705682', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD' },
    ];

    it('accepts config with accepts[] instead of network', () => {
      const config = parseConfig({ ...MULTI_CONFIG_BASE, accepts: VALID_ACCEPTS });
      expect(config.accepts).toHaveLength(2);
      expect(config.accepts![0].network).toBe('eip155:8453');
      expect(config.accepts![1].network).toBe('eip155:324705682');
      expect(config.network).toBeUndefined();
    });

    it('throws when both network and accepts are provided', () => {
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        network: 'eip155:1',
        accepts: VALID_ACCEPTS,
      })).toThrow(PaperwallError);
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        network: 'eip155:1',
        accepts: VALID_ACCEPTS,
      })).toThrow(/mutually exclusive/);
    });

    it('throws when neither network nor accepts is provided', () => {
      expect(() => parseConfig(MULTI_CONFIG_BASE)).toThrow(PaperwallError);
      expect(() => parseConfig(MULTI_CONFIG_BASE)).toThrow(/network/);
    });

    it('throws when accepts is an empty array and network is absent', () => {
      expect(() => parseConfig({ ...MULTI_CONFIG_BASE, accepts: [] })).toThrow(PaperwallError);
      expect(() => parseConfig({ ...MULTI_CONFIG_BASE, accepts: [] })).toThrow(/network/);
    });

    it('throws for accepts entry with invalid CAIP-2 network', () => {
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        accepts: [{ network: 'bad' }],
      })).toThrow(PaperwallError);
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        accepts: [{ network: 'bad' }],
      })).toThrow(/CAIP-2/);
    });

    it('throws for accepts entry with invalid asset address', () => {
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        accepts: [{ network: 'eip155:8453', asset: 'not-an-address' }],
      })).toThrow(PaperwallError);
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        accepts: [{ network: 'eip155:8453', asset: 'not-an-address' }],
      })).toThrow(/asset/);
    });

    it('throws for accepts entry with invalid payTo address', () => {
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        accepts: [{ network: 'eip155:8453', payTo: '0xBAD' }],
      })).toThrow(PaperwallError);
      expect(() => parseConfig({
        ...MULTI_CONFIG_BASE,
        accepts: [{ network: 'eip155:8453', payTo: '0xBAD' }],
      })).toThrow(/payTo/);
    });

    it('accepts entries with valid optional asset and payTo', () => {
      const accepts: AcceptEntry[] = [
        {
          network: 'eip155:8453',
          asset: '0x1111111111111111111111111111111111111111',
          payTo: '0x2222222222222222222222222222222222222222',
        },
      ];
      const config = parseConfig({ ...MULTI_CONFIG_BASE, accepts });
      expect(config.accepts![0].asset).toBe('0x1111111111111111111111111111111111111111');
      expect(config.accepts![0].payTo).toBe('0x2222222222222222222222222222222222222222');
    });

    it('preserves accepts in the returned config object', () => {
      const config = parseConfig({ ...MULTI_CONFIG_BASE, accepts: VALID_ACCEPTS });
      expect(config.accepts).toEqual(VALID_ACCEPTS);
    });
  });
});

describe('parseScriptTag', () => {
  let scriptElement: HTMLScriptElement;

  beforeEach(() => {
    scriptElement = document.createElement('script');
    scriptElement.setAttribute('data-facilitator-url', 'https://gateway.kobaru.io');
    scriptElement.setAttribute('data-pay-to', '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01');
    scriptElement.setAttribute('data-price', '10000');
    scriptElement.setAttribute('data-network', 'eip155:324705682');
    document.head.appendChild(scriptElement);
  });

  afterEach(() => {
    scriptElement.remove();
  });

  it('returns null when no script tag with data attributes is found', () => {
    scriptElement.remove();
    const result = parseScriptTag(document.createElement('script'));
    expect(result).toBeNull();
  });

  it('parses config from script tag data attributes', () => {
    const config = parseScriptTag(scriptElement);
    expect(config).not.toBeNull();
    expect(config!.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(config!.payTo).toBe('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01');
    expect(config!.price).toBe('10000');
    expect(config!.network).toBe('eip155:324705682');
  });

  it('parses optional data-mode attribute', () => {
    scriptElement.setAttribute('data-mode', 'server');
    scriptElement.setAttribute('data-payment-url', 'https://example.com/pay');
    const config = parseScriptTag(scriptElement);
    expect(config).not.toBeNull();
    expect(config!.mode).toBe('server');
    expect(config!.paymentUrl).toBe('https://example.com/pay');
  });

  it('parses optional data-site-key attribute', () => {
    scriptElement.setAttribute('data-site-key', 'my-key');
    const config = parseScriptTag(scriptElement);
    expect(config).not.toBeNull();
    expect(config!.siteKey).toBe('my-key');
  });

  it('parses optional data-asset attribute', () => {
    scriptElement.setAttribute('data-asset', '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    const config = parseScriptTag(scriptElement);
    expect(config).not.toBeNull();
    expect(config!.asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
  });

  it('parses data-accepts JSON array for multi-network', () => {
    scriptElement.removeAttribute('data-network');
    const accepts = JSON.stringify([
      { network: 'eip155:8453' },
      { network: 'eip155:324705682', asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD' },
    ]);
    scriptElement.setAttribute('data-accepts', accepts);
    const config = parseScriptTag(scriptElement);
    expect(config).not.toBeNull();
    expect(config!.accepts).toHaveLength(2);
    expect(config!.accepts![0].network).toBe('eip155:8453');
    expect(config!.accepts![1].asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
  });

  it('returns null when both data-network and data-accepts are missing', () => {
    scriptElement.removeAttribute('data-network');
    const config = parseScriptTag(scriptElement);
    expect(config).toBeNull();
  });

  it('throws on malformed data-accepts JSON (empty array fails validation)', () => {
    scriptElement.removeAttribute('data-network');
    scriptElement.setAttribute('data-accepts', 'not-json');
    // Malformed JSON is parsed as empty array, which fails validation
    expect(() => parseScriptTag(scriptElement)).toThrow(PaperwallError);
  });

  it('still works with data-network single-network mode', () => {
    // data-network is already set in beforeEach
    const config = parseScriptTag(scriptElement);
    expect(config).not.toBeNull();
    expect(config!.network).toBe('eip155:324705682');
    expect(config!.accepts).toBeUndefined();
  });
});
