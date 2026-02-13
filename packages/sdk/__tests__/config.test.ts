// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseConfig, parseScriptTag } from '../src/config';
import { PaperwallError } from '../src/types';

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

  it('throws PaperwallError when network is missing', () => {
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
});
