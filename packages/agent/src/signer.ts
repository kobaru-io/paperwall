/**
 * EIP-712 signer for TransferWithAuthorization (USDC gasless transfers).
 *
 * Signs EIP-712 typed data using viem's signTypedData. The domain info
 * comes from the facilitator's /supported endpoint. The message encodes
 * a TransferWithAuthorization call with a 300-second validity window.
 */

import * as crypto from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { parseChainId } from './networks.js';

/**
 * EIP-712 domain info (from facilitator /supported response).
 */
export interface SignerDomain {
  readonly name: string;
  readonly version: string;
  readonly verifyingContract: `0x${string}`;
}

/**
 * Payment terms from the meta tag's accepts[] entry.
 */
export interface PaymentTerms {
  readonly network: string;
  readonly amount: string;
  readonly payTo: `0x${string}`;
}

/**
 * Result of signing a payment authorization.
 */
export interface SignResult {
  readonly signature: string;
  readonly authorization: {
    readonly from: string;
    readonly to: string;
    readonly value: string;
    readonly validAfter: string;
    readonly validBefore: string;
    readonly nonce: string;
  };
}

/**
 * EIP-712 type definition for TransferWithAuthorization.
 */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/**
 * Sign a payment authorization using EIP-712 typed data.
 *
 * @param privateKey - Hex-encoded private key (0x-prefixed)
 * @param domain - EIP-712 domain info from facilitator /supported
 * @param paymentTerms - Payment terms from the meta tag
 * @returns Signature and authorization fields for the /settle request
 */
export async function signPayment(
  privateKey: `0x${string}`,
  domain: SignerDomain,
  paymentTerms: PaymentTerms,
): Promise<SignResult> {
  const account = privateKeyToAccount(privateKey);
  const chainId = parseChainId(paymentTerms.network);

  // Generate a random nonce (32 bytes)
  const nonceBytes = crypto.randomBytes(32);
  const nonce = `0x${nonceBytes.toString('hex')}` as `0x${string}`;

  // Validity window: immediately valid, expires in 300 seconds
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

  const message = {
    from: account.address,
    to: paymentTerms.payTo,
    value: BigInt(paymentTerms.amount),
    validAfter,
    validBefore,
    nonce,
  };

  const eip712Domain = {
    name: domain.name,
    version: domain.version,
    chainId,
    verifyingContract: domain.verifyingContract,
  };

  const signature = await account.signTypedData({
    domain: eip712Domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  return {
    signature,
    authorization: {
      from: account.address,
      to: paymentTerms.payTo,
      value: paymentTerms.amount,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
  };
}
