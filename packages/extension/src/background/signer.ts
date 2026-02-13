import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ── Types ────────────────────────────────────────────────────────

export interface PaymentOption {
  payTo: string;
  amount: string;
  network: string;
  asset: string;
}

/** x402 supported kind with EIP-712 domain info in `extra`. */
export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
}

export interface TransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface SignedPayment {
  signature: string;
  authorization: TransferAuthorization;
}

// ── EIP-712 Domain & Types ──────────────────────────────────────

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

/** Default timeout for payment authorization validity (300 seconds). */
const MAX_TIMEOUT_SECONDS = 300;

// ── Sign Payment ────────────────────────────────────────────────

/**
 * Signs a TransferWithAuthorization (EIP-3009) using EIP-712 typed data.
 * This produces a signature that can be submitted to the USDC contract
 * to execute a gasless transfer.
 */
export async function signPayment(
  privateKey: string,
  paymentOption: PaymentOption,
  supportedKind: SupportedKind,
): Promise<SignedPayment> {
  if (!supportedKind.extra) {
    throw new Error('SupportedKind missing EIP-712 domain info in extra');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Generate random 32-byte nonce
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = `0x${Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const validBefore = (nowSeconds + MAX_TIMEOUT_SECONDS).toString();
  const validAfter = '0';

  const authorization: TransferAuthorization = {
    from: account.address,
    to: paymentOption.payTo,
    value: paymentOption.amount,
    validAfter,
    validBefore,
    nonce,
  };

  const extra = supportedKind.extra;

  // Normalize addresses to proper EIP-55 checksum format
  const fromAddress = getAddress(authorization.from);
  const toAddress = getAddress(authorization.to);
  const verifyingContract = getAddress(extra.verifyingContract);

  const domain = {
    name: extra.name,
    version: extra.version,
    chainId: BigInt(extra.chainId),
    verifyingContract: verifyingContract as `0x${string}`,
  };

  const message = {
    from: fromAddress as `0x${string}`,
    to: toAddress as `0x${string}`,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce as `0x${string}`,
  };

  const signature = await account.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  return { signature, authorization };
}
