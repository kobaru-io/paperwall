/**
 * Error codes for payment failures.
 */
export type PaymentErrorCode =
  | 'MISSING_EXTENSION'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_FUNDS'
  | 'NETWORK_ERROR'
  | 'FACILITATOR_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * A payment option advertised by the SDK signal.
 */
export interface PaymentOption {
  /** Payment scheme, e.g. 'exact'. */
  readonly scheme: string;
  /** CAIP-2 network identifier, e.g. "eip155:324705682". */
  readonly network: string;
  /** Payment amount in smallest unit (e.g. USDC micro-units). */
  readonly amount: string;
  /** Token contract address, e.g. "0x2e08028E3C4c2356572E096d8EF835cD5C6030bD". */
  readonly asset: string;
  /** Ethereum address to receive payment. */
  readonly payTo: string;
  /** Maximum timeout in seconds for the payment (optional). */
  readonly maxTimeoutSeconds?: number;
  /** Extra data for the payment option (optional). */
  readonly extra?: Record<string, unknown>;
}

/**
 * Signal embedded in a <meta> tag for extension detection.
 */
export interface PaymentRequiredSignal {
  /** Protocol version (x402 v2). */
  readonly x402Version: 2;
  /** Resource being gated. Matches @x402/core ResourceInfo shape. */
  readonly resource: {
    readonly url: string;
    readonly description?: string;
    readonly mimeType?: string;
  };
  /** Accepted payment options. */
  readonly accepts: PaymentOption[];
  /** Error message from the publisher (optional). */
  readonly error?: string;
  /** Protocol extensions (optional). */
  readonly extensions?: Record<string, unknown>;
  /** Optional publisher-defined description. */
  readonly description?: string;
}

/**
 * SDK configuration provided by the publisher.
 */
export interface PaperwallConfig {
  /** URL of the facilitator service. */
  facilitatorUrl: string;
  /** Ethereum address to receive payment. */
  payTo: string;
  /** Payment amount in smallest unit. */
  price: string;
  /** CAIP-2 network identifier. */
  network: string;
  /** Payment mode: "client" (extension pays) or "server" (publisher server verifies). */
  mode: 'client' | 'server';
  /** Required when mode is "server" -- URL for server-side payment verification. */
  paymentUrl?: string;
  /** Token contract address (defaults to SKALE testnet USDC). */
  asset?: string;
  /** Optional site key for facilitator authentication. */
  siteKey?: string;
  /** Callback fired on successful payment. */
  onPaymentSuccess?: (receipt: PaymentReceipt) => void;
  /** Callback fired on payment error. */
  onPaymentError?: (error: PaymentError) => void;
}

/**
 * Receipt returned after a successful payment.
 */
export interface PaymentReceipt {
  /** Unique request identifier. */
  readonly requestId: string;
  /** Transaction hash on-chain. */
  readonly txHash: string;
  /** CAIP-2 network the payment settled on. */
  readonly network: string;
  /** Amount paid in smallest unit. */
  readonly amount: string;
  /** Payer wallet address. */
  readonly from: string;
  /** Recipient address. */
  readonly to: string;
  /** ISO 8601 timestamp. */
  readonly settledAt: string;
  /** Whether the payment was successful. */
  readonly success: boolean;
  /** Payer wallet address (alias for from). */
  readonly payer: string;
  /** Recipient address (alias for to). */
  readonly payTo: string;
  /** The URL that was paid for. */
  readonly resource: string;
  /** Signed receipt for Tier 2 verification (optional). */
  readonly signedReceipt?: string;
  /** Error message for failed payments (optional). */
  readonly error?: string;
}

/**
 * Error object returned on payment failure.
 */
export interface PaymentError {
  /** Machine-readable error code. */
  code: PaymentErrorCode;
  /** Human-readable error message. */
  message: string;
  /** Unique request identifier. */
  requestId?: string;
}

/**
 * Custom error class for SDK configuration and runtime errors.
 */
export class PaperwallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaperwallError';
  }
}
