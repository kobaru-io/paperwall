// ── x402 Payment Client ──────────────────────────────────────────
// Manages x402 client instance and EVM scheme registration for payments

import { x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';

let client: x402Client | null = null;
let registeredAddress: string | null = null;
let registeredNetwork: string | null = null;

/**
 * Initialize or update the x402 client with a private key.
 * Registers the EVM scheme for the given network.
 */
export function initializePaymentClient(privateKey: string, network: string): void {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Create new client if needed
  if (!client) {
    client = new x402Client();
  }

  // Re-register if the address or network changed
  if (registeredAddress !== account.address || registeredNetwork !== network) {
    registerExactEvmScheme(client, {
      signer: account,
      networks: [network as `${string}:${string}`],
    });
    registeredAddress = account.address;
    registeredNetwork = network;
  }
}

/**
 * Get the initialized client instance.
 */
export function getPaymentClient(): x402Client | null {
  return client;
}

/**
 * Create a signed payment payload using the x402 library.
 * Delegates to the registered ExactEvmScheme for EIP-712 signing.
 * The client must be initialized first via initializePaymentClient().
 */
export async function createSignedPayload(
  resource: { url: string; description: string; mimeType: string },
  requirements: PaymentRequirements,
): Promise<PaymentPayload> {
  if (!client) {
    throw new Error('Payment client not initialized');
  }
  return client.createPaymentPayload({
    x402Version: 2,
    resource,
    accepts: [requirements],
  });
}

/**
 * Clear the client instance (e.g., when wallet is locked).
 */
export function clearPaymentClient(): void {
  client = null;
  registeredAddress = null;
  registeredNetwork = null;
}
