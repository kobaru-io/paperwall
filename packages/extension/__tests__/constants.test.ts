import { describe, it, expect } from 'vitest';
import {
  getNetwork,
  parseChainId,
  getExpectedAsset,
  getAllNetworks,
  isTestnet,
  getNetworkPriority,
  DEFAULT_NETWORK,
} from '../src/shared/constants.js';

describe('constants (extension)', () => {
  describe('DEFAULT_NETWORK', () => {
    it('should be the SKALE Testnet CAIP-2 identifier', () => {
      expect(DEFAULT_NETWORK).toBe('eip155:324705682');
    });
  });

  describe('getNetwork', () => {
    it('should resolve SKALE Testnet by CAIP-2 ID', () => {
      const network = getNetwork('eip155:324705682');
      expect(network.name).toBe('SKALE Testnet');
      expect(network.rpcUrl).toBe(
        'https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha',
      );
      expect(network.usdcAddress).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
      expect(network.chainId).toBe(324705682);
    });

    it('should resolve Base Sepolia by CAIP-2 ID', () => {
      const network = getNetwork('eip155:84532');
      expect(network.name).toBe('Base Sepolia');
      expect(network.rpcUrl).toBe('https://sepolia.base.org');
      expect(network.usdcAddress).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
      expect(network.chainId).toBe(84532);
    });

    it('should resolve SKALE Mainnet by CAIP-2 ID', () => {
      const network = getNetwork('eip155:1187947933');
      expect(network.name).toBe('SKALE Mainnet');
      expect(network.rpcUrl).toBe('https://skale-base.skalenodes.com/v1/base');
      expect(network.usdcAddress).toBe('0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20');
      expect(network.chainId).toBe(1187947933);
    });

    it('should resolve Base Mainnet by CAIP-2 ID', () => {
      const network = getNetwork('eip155:8453');
      expect(network.name).toBe('Base Mainnet');
      expect(network.rpcUrl).toBe('https://mainnet.base.org');
      expect(network.usdcAddress).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
      expect(network.chainId).toBe(8453);
    });

    it('should throw for unknown network', () => {
      expect(() => getNetwork('eip155:1')).toThrow('Unsupported network');
    });

    it('should throw for malformed CAIP-2 string', () => {
      expect(() => getNetwork('invalid')).toThrow('Unsupported network');
    });

    it('should throw for empty string', () => {
      expect(() => getNetwork('')).toThrow('Unsupported network');
    });

    it('should have valid USDC addresses starting with 0x', () => {
      const networks = getAllNetworks();
      for (const [, config] of networks) {
        expect(config.usdcAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
    });
  });

  describe('getAllNetworks', () => {
    it('should return a map with 4 entries', () => {
      const networks = getAllNetworks();
      expect(networks.size).toBe(4);
    });

    it('should contain all expected CAIP-2 identifiers', () => {
      const networks = getAllNetworks();
      expect(networks.has('eip155:324705682')).toBe(true);
      expect(networks.has('eip155:84532')).toBe(true);
      expect(networks.has('eip155:1187947933')).toBe(true);
      expect(networks.has('eip155:8453')).toBe(true);
    });
  });

  describe('isTestnet', () => {
    it('should return true for SKALE Testnet', () => {
      expect(isTestnet('eip155:324705682')).toBe(true);
    });

    it('should return true for Base Sepolia', () => {
      expect(isTestnet('eip155:84532')).toBe(true);
    });

    it('should return false for SKALE Mainnet', () => {
      expect(isTestnet('eip155:1187947933')).toBe(false);
    });

    it('should return false for Base Mainnet', () => {
      expect(isTestnet('eip155:8453')).toBe(false);
    });

    it('should return false for unknown network', () => {
      expect(isTestnet('eip155:1')).toBe(false);
    });
  });

  describe('getNetworkPriority', () => {
    it('should return 0 for SKALE Testnet', () => {
      expect(getNetworkPriority('eip155:324705682')).toBe(0);
    });

    it('should return 1 for Base Sepolia', () => {
      expect(getNetworkPriority('eip155:84532')).toBe(1);
    });

    it('should return 2 for SKALE Mainnet', () => {
      expect(getNetworkPriority('eip155:1187947933')).toBe(2);
    });

    it('should return 3 for Base Mainnet', () => {
      expect(getNetworkPriority('eip155:8453')).toBe(3);
    });

    it('should return Infinity for unknown network', () => {
      expect(getNetworkPriority('eip155:1')).toBe(Infinity);
    });
  });

  describe('parseChainId', () => {
    it('should extract numeric chain ID from CAIP-2 string', () => {
      expect(parseChainId('eip155:324705682')).toBe(324705682);
    });

    it('should extract mainnet chain ID', () => {
      expect(parseChainId('eip155:1187947933')).toBe(1187947933);
    });

    it('should extract Base Sepolia chain ID', () => {
      expect(parseChainId('eip155:84532')).toBe(84532);
    });

    it('should extract Base Mainnet chain ID', () => {
      expect(parseChainId('eip155:8453')).toBe(8453);
    });

    it('should throw for invalid CAIP-2 format', () => {
      expect(() => parseChainId('invalid')).toThrow();
    });

    it('should throw for non-eip155 namespace', () => {
      expect(() => parseChainId('solana:mainnet')).toThrow();
    });

    it('should throw for empty string', () => {
      expect(() => parseChainId('')).toThrow();
    });
  });

  describe('getExpectedAsset', () => {
    it('should return USDC address for SKALE Testnet', () => {
      expect(getExpectedAsset('eip155:324705682')).toBe(
        '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      );
    });

    it('should return USDC address for Base Sepolia', () => {
      expect(getExpectedAsset('eip155:84532')).toBe(
        '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      );
    });

    it('should return USDC address for SKALE Mainnet', () => {
      expect(getExpectedAsset('eip155:1187947933')).toBe(
        '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
      );
    });

    it('should return USDC address for Base Mainnet', () => {
      expect(getExpectedAsset('eip155:8453')).toBe(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      );
    });

    it('should return null for unknown network', () => {
      expect(getExpectedAsset('eip155:1')).toBeNull();
    });

    it('should return null for malformed CAIP-2 string', () => {
      expect(getExpectedAsset('invalid')).toBeNull();
    });
  });
});
