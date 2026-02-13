import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyTypedData } from 'viem';
import { signPayment } from '../src/background/signer.js';

// ── Test Fixtures ──────────────────────────────────────────────────

const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);

const TEST_PAYMENT_OPTION = {
  payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  amount: '10000',
  network: 'eip155:324705682',
  asset: 'USDC',
};

const TEST_SUPPORTED_KIND = {
  x402Version: 2,
  scheme: 'exact',
  network: 'eip155:324705682',
  extra: {
    name: 'USD Coin',
    version: '2',
    chainId: 324705682,
    verifyingContract: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
  },
};

// ── Tests ──────────────────────────────────────────────────────────

describe('signer', () => {
  it('returns signature and authorization', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    expect(result).toHaveProperty('signature');
    expect(result).toHaveProperty('authorization');
    expect(typeof result.signature).toBe('string');
    expect(result.signature).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it('authorization.from matches wallet address derived from privateKey', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    expect(result.authorization.from.toLowerCase()).toBe(
      TEST_ACCOUNT.address.toLowerCase(),
    );
  });

  it('authorization.to matches paymentOption.payTo', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    expect(result.authorization.to.toLowerCase()).toBe(
      TEST_PAYMENT_OPTION.payTo.toLowerCase(),
    );
  });

  it('authorization.value matches paymentOption.amount', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    expect(result.authorization.value).toBe(TEST_PAYMENT_OPTION.amount);
  });

  it('authorization.validBefore is a future timestamp', async () => {
    const before = Math.floor(Date.now() / 1000);
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    const validBefore = Number(result.authorization.validBefore);
    // Should be in the future (current time + some timeout)
    expect(validBefore).toBeGreaterThan(before);
  });

  it('authorization.validAfter is 0 (no lower bound)', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    expect(result.authorization.validAfter).toBe('0');
  });

  it('authorization.nonce is a random 32-byte hex string', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    // 0x + 64 hex chars = 32 bytes
    expect(result.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('two signatures produce different nonces', async () => {
    const result1 = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );
    const result2 = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    expect(result1.authorization.nonce).not.toBe(
      result2.authorization.nonce,
    );
  });

  it('signature is valid EIP-712 (verifiable with viem)', async () => {
    const result = await signPayment(
      TEST_PRIVATE_KEY,
      TEST_PAYMENT_OPTION,
      TEST_SUPPORTED_KIND,
    );

    const domain = {
      name: TEST_SUPPORTED_KIND.extra.name,
      version: TEST_SUPPORTED_KIND.extra.version,
      chainId: BigInt(TEST_SUPPORTED_KIND.extra.chainId),
      verifyingContract:
        TEST_SUPPORTED_KIND.extra.verifyingContract as `0x${string}`,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = {
      from: result.authorization.from as `0x${string}`,
      to: result.authorization.to as `0x${string}`,
      value: BigInt(result.authorization.value),
      validAfter: BigInt(result.authorization.validAfter),
      validBefore: BigInt(result.authorization.validBefore),
      nonce: result.authorization.nonce as `0x${string}`,
    };

    const recoveredAddress = await verifyTypedData({
      address: TEST_ACCOUNT.address,
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message,
      signature: result.signature as `0x${string}`,
    });

    expect(recoveredAddress).toBe(true);
  });
});
