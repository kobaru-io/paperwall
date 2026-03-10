import { describe, it, expect } from 'vitest';
import { selectNetwork } from '../src/background/network-selector.js';

const DEFAULT_PAY_TO = '0x1111111111111111111111111111111111111111';

function balancesFrom(entries: Array<[string, string]>): Map<string, { raw: string }> {
  return new Map(entries.map(([network, raw]) => [network, { raw }]));
}

describe('selectNetwork (extension)', () => {
  it('selects SKALE testnet when all networks viable (highest priority = 0)', () => {
    const accepts = [
      { network: 'eip155:324705682' },
      { network: 'eip155:8453' },
    ];
    const balances = balancesFrom([
      ['eip155:324705682', '2000000'],
      ['eip155:8453', '2000000'],
    ]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.network).toBe('eip155:324705682');
  });

  it('selects Base Sepolia when SKALE testnet has insufficient balance', () => {
    const accepts = [
      { network: 'eip155:324705682' },
      { network: 'eip155:84532' },
    ];
    const balances = balancesFrom([
      ['eip155:324705682', '500'],
      ['eip155:84532', '2000000'],
    ]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.network).toBe('eip155:84532');
  });

  it('returns null when all networks have insufficient balance', () => {
    const accepts = [
      { network: 'eip155:324705682' },
      { network: 'eip155:8453' },
    ];
    const balances = balancesFrom([
      ['eip155:324705682', '0'],
      ['eip155:8453', '0'],
    ]);

    const result = selectNetwork(accepts, balances, '10000', DEFAULT_PAY_TO);

    expect(result).toBeNull();
  });

  it('skips unknown networks in accepts[]', () => {
    const accepts = [
      { network: 'eip155:99999' },
      { network: 'eip155:8453' },
    ];
    const balances = balancesFrom([
      ['eip155:99999', '9999999'],
      ['eip155:8453', '2000000'],
    ]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.network).toBe('eip155:8453');
  });

  it('resolves missing asset to USDC from registry', () => {
    const accepts = [{ network: 'eip155:8453' }];
    const balances = balancesFrom([['eip155:8453', '2000000']]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.asset).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  });

  it('resolves missing payTo from defaultPayTo', () => {
    const accepts = [{ network: 'eip155:8453' }];
    const balances = balancesFrom([['eip155:8453', '2000000']]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.payTo).toBe(DEFAULT_PAY_TO);
  });

  it('uses explicit payTo from entry when present', () => {
    const explicitPayTo = '0x2222222222222222222222222222222222222222';
    const accepts = [{ network: 'eip155:8453', payTo: explicitPayTo }];
    const balances = balancesFrom([['eip155:8453', '2000000']]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.payTo).toBe(explicitPayTo);
  });

  it('prioritizes correctly: priority 0 < 1 < 2 < 3', () => {
    const accepts = [
      { network: 'eip155:8453' },
      { network: 'eip155:1187947933' },
      { network: 'eip155:84532' },
      { network: 'eip155:324705682' },
    ];
    const balances = balancesFrom([
      ['eip155:8453', '9999999'],
      ['eip155:1187947933', '9999999'],
      ['eip155:84532', '9999999'],
      ['eip155:324705682', '9999999'],
    ]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.network).toBe('eip155:324705682');
  });

  it('returns correct network when only one is viable', () => {
    const accepts = [
      { network: 'eip155:324705682' },
      { network: 'eip155:1187947933' },
    ];
    const balances = balancesFrom([
      ['eip155:324705682', '100'],
      ['eip155:1187947933', '5000000'],
    ]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    expect(result?.network).toBe('eip155:1187947933');
  });

  it('returns null for empty accepts array', () => {
    const balances = balancesFrom([['eip155:324705682', '9999999']]);

    const result = selectNetwork([], balances, '1000', DEFAULT_PAY_TO);

    expect(result).toBeNull();
  });

  it('skips entry where publisher-supplied asset doesn\'t match registry', () => {
    const accepts = [
      { network: 'eip155:8453', asset: '0x0000000000000000000000000000000000000BAD' },
      { network: 'eip155:324705682' },
    ];
    const balances = balancesFrom([
      ['eip155:8453', '9999999'],
      ['eip155:324705682', '9999999'],
    ]);

    const result = selectNetwork(accepts, balances, '1000', DEFAULT_PAY_TO);

    expect(result).not.toBeNull();
    // Should skip eip155:8453 (bad asset) and select eip155:324705682
    expect(result?.network).toBe('eip155:324705682');
  });
});
