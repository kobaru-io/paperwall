import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Module Mocks ────────────────────────────────────────────────────

vi.mock('@x402/fetch', () => ({
  x402Client: vi.fn().mockImplementation(() => ({
    createPaymentPayload: vi.fn(),
  })),
}));

vi.mock('@x402/evm/exact/client', () => ({
  registerExactEvmScheme: vi.fn(),
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({
    address: '0xTestAddress1234567890',
  }),
}));

import { initializePaymentClient, clearPaymentClient } from '../src/background/payment-client.js';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

// ── Tests ──────────────────────────────────────────────────────────

describe('payment-client', () => {
  beforeEach(() => {
    clearPaymentClient();
    vi.clearAllMocks();
    vi.mocked(privateKeyToAccount).mockReturnValue({
      address: '0xTestAddress1234567890',
    } as ReturnType<typeof privateKeyToAccount>);
  });

  describe('wildcard EVM scheme registration', () => {
    it('registers with eip155:* wildcard instead of per-network', () => {
      initializePaymentClient('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

      expect(vi.mocked(registerExactEvmScheme)).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(registerExactEvmScheme).mock.calls[0]!;
      const options = callArgs[1] as { networks: string[] };
      expect(options.networks).toEqual(['eip155:*']);
    });

    it('handles any EVM network without re-registration', () => {
      initializePaymentClient('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

      // First call registers
      expect(vi.mocked(registerExactEvmScheme)).toHaveBeenCalledTimes(1);

      // Same key again should NOT re-register (same address)
      initializePaymentClient('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      expect(vi.mocked(registerExactEvmScheme)).toHaveBeenCalledTimes(1);
    });

    it('re-registers when address changes', () => {
      initializePaymentClient('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      expect(vi.mocked(registerExactEvmScheme)).toHaveBeenCalledTimes(1);

      // Simulate different key -> different address
      vi.mocked(privateKeyToAccount).mockReturnValue({
        address: '0xDifferentAddress9876543210',
      } as ReturnType<typeof privateKeyToAccount>);

      initializePaymentClient('0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd');
      expect(vi.mocked(registerExactEvmScheme)).toHaveBeenCalledTimes(2);
    });

    it('does not require network parameter (signature takes only privateKey)', () => {
      // This validates the API change: initializePaymentClient(key) not initializePaymentClient(key, network)
      expect(() => {
        initializePaymentClient('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      }).not.toThrow();

      expect(vi.mocked(registerExactEvmScheme)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          networks: ['eip155:*'],
        }),
      );
    });
  });
});
