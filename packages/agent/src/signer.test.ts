import { describe, it, expect, vi, afterEach } from 'vitest';
import { signPayment } from './signer.js';

// Use a deterministic test private key (DO NOT use in production)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

const TEST_DOMAIN = {
  name: 'USDC',
  version: '2',
  verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD' as `0x${string}`,
};

const TEST_PAYMENT_TERMS = {
  network: 'eip155:324705682',
  amount: '10000',
  payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`,
};

describe('signPayment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a signature in hex format (0x-prefixed, correct length)', async () => {
    const result = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, TEST_PAYMENT_TERMS);

    // EIP-712 signature = 65 bytes = 130 hex chars + "0x" prefix = 132 chars
    expect(result.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it('should populate authorization fields correctly', async () => {
    const result = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, TEST_PAYMENT_TERMS);

    // from should be the wallet address derived from the private key
    expect(result.authorization.from).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // to should match the payTo address
    expect(result.authorization.to.toLowerCase()).toBe(TEST_PAYMENT_TERMS.payTo.toLowerCase());

    // value should match the amount
    expect(result.authorization.value).toBe('10000');

    // validAfter should be "0"
    expect(result.authorization.validAfter).toBe('0');

    // nonce should be bytes32 hex (0x-prefixed, 64 hex chars)
    expect(result.authorization.nonce).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('should set validBefore to approximately 300 seconds in the future', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, TEST_PAYMENT_TERMS);

    const validBefore = Number(result.authorization.validBefore);

    // Should be roughly now + 300s (allow 5s tolerance for test execution time)
    expect(validBefore).toBeGreaterThanOrEqual(nowSeconds + 295);
    expect(validBefore).toBeLessThanOrEqual(nowSeconds + 305);
  });

  it('should derive the correct address from the private key', async () => {
    const result = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, TEST_PAYMENT_TERMS);

    // The well-known Hardhat account #0 address
    expect(result.authorization.from.toLowerCase()).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    );
  });

  it('should produce different nonces on successive calls', async () => {
    const result1 = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, TEST_PAYMENT_TERMS);
    const result2 = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, TEST_PAYMENT_TERMS);

    expect(result1.authorization.nonce).not.toBe(result2.authorization.nonce);
  });

  it('should produce different signatures for different amounts', async () => {
    const terms1 = { ...TEST_PAYMENT_TERMS, amount: '10000' };
    const terms2 = { ...TEST_PAYMENT_TERMS, amount: '20000' };

    const result1 = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, terms1);
    const result2 = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, terms2);

    expect(result1.signature).not.toBe(result2.signature);
  });

  it('should produce different signatures for different payTo addresses', async () => {
    const terms1 = { ...TEST_PAYMENT_TERMS };
    const terms2 = {
      ...TEST_PAYMENT_TERMS,
      payTo: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as `0x${string}`,
    };

    const result1 = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, terms1);
    const result2 = await signPayment(TEST_PRIVATE_KEY, TEST_DOMAIN, terms2);

    expect(result1.signature).not.toBe(result2.signature);
  });
});
