import { describe, it, expect } from 'vitest';
import { getNetwork, parseChainId, getExpectedAsset } from './networks.js';

describe('networks', () => {
  describe('getNetwork', () => {
    it('should resolve SKALE Base Sepolia by CAIP-2 ID', () => {
      const network = getNetwork('eip155:324705682');
      expect(network.name).toBe('SKALE Base Sepolia');
      expect(network.rpcUrl).toBeDefined();
      expect(network.usdcAddress).toBeDefined();
    });

    it('should resolve SKALE Base by CAIP-2 ID', () => {
      const network = getNetwork('eip155:1187947933');
      expect(network.name).toBe('SKALE Base');
      expect(network.rpcUrl).toBeDefined();
      expect(network.usdcAddress).toBeDefined();
    });

    it('should throw for unknown network', () => {
      expect(() => getNetwork('eip155:1')).toThrow('unsupported network');
    });

    it('should throw for malformed CAIP-2 string', () => {
      expect(() => getNetwork('invalid')).toThrow('unsupported network');
    });

    it('should throw for empty string', () => {
      expect(() => getNetwork('')).toThrow('unsupported network');
    });

    it('should have valid USDC addresses starting with 0x', () => {
      const testnet = getNetwork('eip155:324705682');
      const mainnet = getNetwork('eip155:1187947933');
      expect(testnet.usdcAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(mainnet.usdcAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  describe('parseChainId', () => {
    it('should extract numeric chain ID from CAIP-2 string', () => {
      expect(parseChainId('eip155:324705682')).toBe(324705682);
    });

    it('should extract mainnet chain ID', () => {
      expect(parseChainId('eip155:1187947933')).toBe(1187947933);
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
    it('should return USDC address for SKALE Base Sepolia', () => {
      const asset = getExpectedAsset('eip155:324705682');
      expect(asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    });

    it('should return USDC address for SKALE Base', () => {
      const asset = getExpectedAsset('eip155:1187947933');
      expect(asset).toBe('0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20');
    });

    it('should return null for unknown network', () => {
      const asset = getExpectedAsset('eip155:1');
      expect(asset).toBeNull();
    });

    it('should return null for malformed CAIP-2 string', () => {
      const asset = getExpectedAsset('invalid');
      expect(asset).toBeNull();
    });
  });
});
