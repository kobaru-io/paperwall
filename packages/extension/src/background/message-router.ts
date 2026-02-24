import {
  generateKeyPair,
  encryptKey,
  decryptKey,
} from './key-manager.js';
import { fetchBalance } from './balance.js';
import {
  getSupported,
  verify,
  settle,
  type SupportedResponse,
  type PaymentRequirements,
  type PaymentPayload,
} from './facilitator.js';
import { initializePaymentClient, createSignedPayload } from './payment-client.js';
import { addPayment, getHistory, updatePaymentStatus } from './history.js';
import { formatUsdcFromString } from '../shared/format.js';
import { getExpectedAsset } from '../shared/constants.js';

// ── Logging ─────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

// ── Types ───────────────────────────────────────────────────────────

interface WalletData {
  address: string;
  encryptedKey: string;
  keySalt: string;
  keyIv: string;
}

interface ActivePageState {
  origin: string;
  url: string;
  facilitatorUrl: string;
  price: string;
  network: string;
  mode: string;
  siteKey?: string;
  signal: {
    x402Version: number;
    resource: { url: string; mimeType?: string };
    accepts: Array<{
      scheme: string;
      network: string;
      amount: string;
      asset: string;
      payTo: string;
      maxTimeoutSeconds?: number;
      extra?: Record<string, unknown>;
    }>;
  };
  optimistic: boolean;
}

type MessageResponse = Record<string, unknown>;
type SendResponse = (response: MessageResponse) => void;

// ── Badge Colors ────────────────────────────────────────────────────

const BADGE_COLORS = {
  detected: '#6c5ce7',
  amber: '#fdcb6e',
  success: '#00b894',
  error: '#e74c3c',
} as const;

// ── Active Page Map ─────────────────────────────────────────────────

const activePages = new Map<number, ActivePageState>();

// Track in-progress payments per tab to prevent concurrent payments
const paymentsInProgress = new Set<number>();

// Brute-force protection for wallet unlock
const MAX_UNLOCK_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000 * 5; // 5 minutes
let unlockAttempts = 0;
let lockedUntil = 0;

// ── Wallet Handlers ─────────────────────────────────────────────────

async function handleCreateWallet(
  password: string,
): Promise<MessageResponse> {
  // Check if wallet already exists to prevent accidental overwrite
  const localData = await chrome.storage.local.get('wallet');
  const existingWallet = localData['wallet'] as WalletData | undefined;

  if (existingWallet) {
    return {
      success: false,
      error: 'Wallet already exists. Cannot overwrite existing wallet.',
    };
  }

  const keyPair = generateKeyPair();
  const encrypted = await encryptKey(password, keyPair.privateKey);

  const walletData: WalletData = {
    address: keyPair.address,
    encryptedKey: encrypted.encryptedKey,
    keySalt: encrypted.keySalt,
    keyIv: encrypted.keyIv,
  };

  await chrome.storage.local.set({ wallet: walletData });
  await chrome.storage.session.set({ privateKey: keyPair.privateKey });

  return { success: true, address: keyPair.address };
}

async function handleGetWalletState(): Promise<MessageResponse> {
  const localData = await chrome.storage.local.get('wallet');
  const wallet = localData['wallet'] as WalletData | undefined;

  if (!wallet) {
    return { exists: false, unlocked: false };
  }

  const sessionData = await chrome.storage.session.get('privateKey');
  const privateKey = sessionData['privateKey'] as string | undefined;

  return {
    exists: true,
    unlocked: !!privateKey,
    address: wallet.address,
  };
}

async function handleUnlockWallet(
  password: string,
): Promise<MessageResponse> {
  // Check if temporarily locked due to too many attempts
  if (Date.now() < lockedUntil) {
    const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
    return { success: false, error: `Too many attempts. Try again in ${remaining}s` };
  }

  const localData = await chrome.storage.local.get('wallet');
  const wallet = localData['wallet'] as WalletData | undefined;

  if (!wallet) {
    return { success: false, error: 'No wallet found' };
  }

  try {
    const privateKey = await decryptKey(
      password,
      wallet.encryptedKey,
      wallet.keySalt,
      wallet.keyIv,
    );
    await chrome.storage.session.set({ privateKey });

    // Reset attempts on successful unlock
    unlockAttempts = 0;
    lockedUntil = 0;

    return { success: true };
  } catch {
    // Increment failed attempts
    unlockAttempts++;
    if (unlockAttempts >= MAX_UNLOCK_ATTEMPTS) {
      lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      unlockAttempts = 0;
      return {
        success: false,
        error: `Too many incorrect attempts. Wallet locked for 5 minutes.`,
      };
    }

    const attemptsLeft = MAX_UNLOCK_ATTEMPTS - unlockAttempts;
    return {
      success: false,
      error: `Incorrect password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`,
    };
  }
}

async function handleGetBalance(): Promise<MessageResponse> {
  const sessionData = await chrome.storage.session.get('privateKey');
  const privateKey = sessionData['privateKey'] as string | undefined;

  if (!privateKey) {
    return { success: false, error: 'Wallet is locked' };
  }

  const localData = await chrome.storage.local.get('wallet');
  const wallet = localData['wallet'] as WalletData | undefined;

  if (!wallet) {
    return { success: false, error: 'No wallet found' };
  }

  try {
    const balance = await fetchBalance(wallet.address);
    return { success: true, balance };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ── Page Detection Handlers ─────────────────────────────────────────

async function handlePageHasPaperwall(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender.tab?.id;
  if (!tabId) {
    return { success: false, error: 'No tab ID' };
  }

  // Validate required fields from content script message
  const origin = message['origin'];
  const url = message['url'];
  const facilitatorUrl = message['facilitatorUrl'];
  const price = message['price'];
  const network = message['network'];
  const signal = message['signal'] as ActivePageState['signal'] | undefined;

  if (
    typeof origin !== 'string' ||
    typeof url !== 'string' ||
    typeof facilitatorUrl !== 'string' ||
    typeof price !== 'string' ||
    typeof network !== 'string' ||
    !signal
  ) {
    return { success: false, error: 'Missing required fields' };
  }

  const state: ActivePageState = {
    origin,
    url,
    facilitatorUrl,
    price,
    network,
    mode: (message['mode'] as string) ?? 'client',
    siteKey: message['siteKey'] as string | undefined,
    signal,
    optimistic: (message['optimistic'] as string) !== 'false',
  };

  activePages.set(tabId, state);

  console.log(`[paperwall ${ts()}] Page detected:`, { origin, price, mode: state.mode, optimistic: state.optimistic });

  // Check affordability for badge color
  const sessionData = await chrome.storage.session.get('privateKey');
  if (sessionData['privateKey']) {
    const localData = await chrome.storage.local.get('wallet');
    const wallet = localData['wallet'] as WalletData | undefined;
    if (wallet) {
      try {
        const balance = await fetchBalance(wallet.address, state.network);
        const canAfford = BigInt(balance.raw) >= BigInt(state.price);
        if (!canAfford) {
          // Amber badge: detected but insufficient balance
          chrome.action.setBadgeText({ tabId, text: '$' });
          chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.amber });
          return { success: true };
        }
      } catch {
        // Fall through to default purple badge
      }
    }
  }

  // Default: purple badge (can afford or unknown)
  chrome.action.setBadgeText({ tabId, text: '$' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.detected });

  return { success: true };
}

async function handleGetPageState(
  message: Record<string, unknown>,
): Promise<MessageResponse> {
  const tabId = (message['tabId'] as number | undefined) ?? 0;
  const pageState = activePages.get(tabId);

  if (!pageState) {
    return { success: true, detected: false };
  }

  // Check if user can afford this page
  let canAfford: boolean | undefined;
  const sessionData = await chrome.storage.session.get('privateKey');
  if (sessionData['privateKey']) {
    const localData = await chrome.storage.local.get('wallet');
    const wallet = localData['wallet'] as WalletData | undefined;
    if (wallet) {
      try {
        const balance = await fetchBalance(wallet.address, pageState.network);
        canAfford = BigInt(balance.raw) >= BigInt(pageState.price);
      } catch {
        canAfford = undefined;
      }
    }
  }

  return {
    success: true,
    detected: true,
    canAfford,
    origin: pageState.origin,
    url: pageState.url,
    price: pageState.price,
    network: pageState.network,
    mode: pageState.mode,
    facilitatorUrl: pageState.facilitatorUrl,
  };
}

// ── Payment Orchestration ───────────────────────────────────────────

async function handleSignAndPay(
  message: Record<string, unknown>,
): Promise<MessageResponse> {
  const tabId = (message['tabId'] as number | undefined) ?? 0;

  // Prevent concurrent payments for the same tab
  // Must add to set immediately (before any await) to prevent race conditions
  if (paymentsInProgress.has(tabId)) {
    return { success: false, error: 'Payment already in progress for this tab' };
  }
  paymentsInProgress.add(tabId);
  let optimisticReturned = false;

  const pageState = activePages.get(tabId);

  if (!pageState) {
    paymentsInProgress.delete(tabId);
    return { success: false, error: 'No Paperwall page detected for this tab' };
  }

  // 1. Check wallet is unlocked
  const sessionData = await chrome.storage.session.get('privateKey');
  const privateKey = sessionData['privateKey'] as string | undefined;

  if (!privateKey) {
    paymentsInProgress.delete(tabId);
    return { success: false, error: 'Wallet is locked' };
  }

  const localData = await chrome.storage.local.get('wallet');
  const wallet = localData['wallet'] as WalletData | undefined;

  if (!wallet) {
    paymentsInProgress.delete(tabId);
    return { success: false, error: 'No wallet found' };
  }

  try {
    // 2. Pre-flight balance check
    const balance = await fetchBalance(wallet.address, pageState.network);
    const balanceBigInt = BigInt(balance.raw);
    const priceBigInt = BigInt(pageState.price);

    if (balanceBigInt < priceBigInt) {
      setBadgeError(tabId);
      return {
        success: false,
        error: `Insufficient balance: have ${balance.formatted}, need ${formatUsdcFromString(pageState.price)}`,
      };
    }

    // 3. Get payment offer from signal
    if (!pageState.signal || !pageState.signal.accepts || pageState.signal.accepts.length === 0) {
      setBadgeError(tabId);
      return { success: false, error: 'No payment signal found' };
    }

    const offer = pageState.signal.accepts[0];

    // 4. Get /supported from facilitator and find matching network

    const supported: SupportedResponse = await getSupported(
      pageState.facilitatorUrl,
      pageState.siteKey,
    );

    const supportedKind = supported.kinds.find(
      (kind) => kind.network === offer.network,
    );

    if (!supportedKind) {
      setBadgeError(tabId);
      return {
        success: false,
        error: `Network ${offer.network} is not supported by facilitator`,
      };
    }

    // Validate asset matches network
    const expectedAsset = getExpectedAsset(offer.network);
    if (expectedAsset && expectedAsset.toLowerCase() !== offer.asset.toLowerCase()) {
      setBadgeError(tabId);
      return { success: false, error: `Unsupported asset ${offer.asset} for network ${offer.network}` };
    }

    // 5. Initialize x402 payment client and create signed payload
    initializePaymentClient(privateKey, offer.network);

    const paymentRequirements: PaymentRequirements = {
      scheme: 'exact',
      network: offer.network as `${string}:${string}`,
      asset: offer.asset,
      amount: offer.amount,
      payTo: offer.payTo,
      maxTimeoutSeconds: offer.maxTimeoutSeconds ?? 300,
      extra: {
        ...(offer.extra as Record<string, unknown> | undefined ?? {}),
        ...(supportedKind.extra ?? {}),
      },
    };

    // 6. Create signed payment payload via x402 library (EIP-3009)
    const paymentPayload = await createSignedPayload(
      { url: pageState.url, description: '', mimeType: '' },
      paymentRequirements,
    );

    // 7. Verify before settling (unless skip-verify setting is enabled)
    const settingsData = await chrome.storage.local.get('settings');
    const settings = (settingsData['settings'] as Record<string, unknown> | undefined) ?? {};
    const skipVerify = settings['skipVerify'] === true;

    if (!skipVerify) {
      const verifyResult = await verify(
        pageState.facilitatorUrl,
        pageState.siteKey,
        paymentPayload,
        paymentRequirements,
      );

      if (!verifyResult.isValid) {
        setBadgeError(tabId);
        return { success: false, error: `Payment verification failed: ${verifyResult.invalidReason ?? 'unknown'}` };
      }
    }

    const requestId = (message['requestId'] as string) ?? crypto.randomUUID();

    if (pageState.optimistic) {
      // -- Optimistic flow: notify immediately, settle in background --
      console.log(`[paperwall ${ts()}] Optimistic flow: unlocking content immediately, settling in background`);

      // 8a. Send PAYMENT_OPTIMISTIC to content script
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'PAYMENT_OPTIMISTIC',
          requestId,
          amount: offer.amount,
          url: pageState.url,
        });
      } catch { /* tab may be closed */ }

      // 8b. Set badge to pending
      chrome.action.setBadgeText({ tabId, text: '⏳' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.detected });

      // 8c. Write pending history record
      await addPayment({
        requestId,
        origin: pageState.origin,
        url: pageState.url,
        amount: offer.amount,
        formattedAmount: formatUsdcFromString(offer.amount),
        network: offer.network,
        asset: offer.asset,
        from: wallet.address,
        to: offer.payTo,
        txHash: '',
        status: 'pending',
        timestamp: Date.now(),
      });

      // 8d. Persist in-flight state for SW restart recovery
      const sessionData2 = await chrome.storage.session.get('pendingPayments');
      const pending = (sessionData2['pendingPayments'] as Record<string, unknown> | undefined) ?? {};
      pending[requestId] = {
        requestId,
        tabId,
        url: pageState.url,
        facilitatorUrl: pageState.facilitatorUrl,
        siteKey: pageState.siteKey,
        signedAt: Date.now(),
      };
      await chrome.storage.session.set({ pendingPayments: pending });

      // 8e. Settle in background (don't await before returning)
      // settleInBackground handles paymentsInProgress cleanup in its finally block
      optimisticReturned = true;
      settleInBackground(
        tabId, requestId, wallet.address, offer,
        pageState.facilitatorUrl, pageState.siteKey,
        paymentPayload, paymentRequirements,
      );

      return { success: true, optimistic: true, requestId };
    }

    // -- Non-optimistic flow (existing behavior) --
    console.log(`[paperwall ${ts()}] Non-optimistic flow: waiting for settlement before unlocking`);

    // 8. Settle via facilitator
    const settleResult = await settle(
      pageState.facilitatorUrl,
      pageState.siteKey,
      paymentPayload,
      paymentRequirements,
    );

    console.log(`[paperwall ${ts()}] Settlement confirmed:`, { requestId, txHash: settleResult.transaction });

    // 9. Save payment record
    await addPayment({
      requestId,
      origin: pageState.origin,
      url: pageState.url,
      amount: offer.amount,
      formattedAmount: formatUsdcFromString(offer.amount),
      network: offer.network,
      asset: offer.asset,
      from: wallet.address,
      to: offer.payTo,
      txHash: settleResult.transaction,
      status: 'confirmed',
      timestamp: Date.now(),
    });

    // 10. Update badge to green
    chrome.action.setBadgeText({ tabId, text: '\u2713' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.success });

    const result = {
      success: true,
      transaction: settleResult.transaction,
      network: settleResult.network,
      payer: settleResult.payer,
      receipt: {
        txHash: settleResult.transaction,
        network: settleResult.network,
        amount: offer.amount,
        from: wallet.address,
        to: offer.payTo,
        payer: settleResult.payer,
      },
    };

    // Send payment result to content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PAYMENT_COMPLETE',
        requestId,
        success: true,
        receipt: result.receipt,
      });
    } catch (err) {
      // Tab may have been closed, ignore error
      console.warn('Failed to notify content script:', err);
    }

    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown payment error';
    console.error(`[paperwall ${ts()}] Payment failed:`, { error: errorMessage });

    setBadgeError(tabId);

    // Send error to content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PAYMENT_COMPLETE',
        requestId: message['requestId'] as string,
        success: false,
        error: errorMessage,
      });
    } catch (err2) {
      // Tab may have been closed, ignore error
      console.warn('Failed to notify content script of error:', err2);
    }

    return { success: false, error: errorMessage };
  } finally {
    // Don't clear guard if optimistic path returned — settleInBackground handles cleanup
    if (!optimisticReturned) {
      paymentsInProgress.delete(tabId);
    }
  }
}

// ── Background Settlement ───────────────────────────────────────────

async function settleInBackground(
  tabId: number,
  requestId: string,
  walletAddress: string,
  offer: { amount: string; network: string; asset: string; payTo: string },
  facilitatorUrl: string,
  siteKey: string | undefined,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  console.log(`[paperwall ${ts()}] Background settlement started for request:`, requestId);
  try {
    const settleResult = await settle(facilitatorUrl, siteKey, paymentPayload, paymentRequirements);
    console.log(`[paperwall ${ts()}] Settlement confirmed:`, { requestId, txHash: settleResult.transaction });

    // Update history to confirmed
    await updatePaymentStatus(requestId, 'confirmed', {
      txHash: settleResult.transaction,
      settledAt: Date.now(),
    });

    // Notify content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PAYMENT_CONFIRMED',
        requestId,
        success: true,
        receipt: {
          txHash: settleResult.transaction,
          network: settleResult.network,
          amount: offer.amount,
          from: walletAddress,
          to: offer.payTo,
          payer: settleResult.payer,
        },
      });
    } catch { /* tab may be closed */ }

    // Badge: success
    chrome.action.setBadgeText({ tabId, text: '\u2713' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.success });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Settlement failed';
    console.error(`[paperwall ${ts()}] Settlement failed:`, { requestId, error: errorMessage });

    // Update history to failed
    await updatePaymentStatus(requestId, 'failed', { error: errorMessage });

    // Notify content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PAYMENT_SETTLE_FAILED',
        requestId,
        success: false,
        error: errorMessage,
      });
    } catch { /* tab may be closed */ }

    // Badge: error
    setBadgeError(tabId);
  } finally {
    // Clear in-flight state
    const sessionData = await chrome.storage.session.get('pendingPayments');
    const pending = (sessionData['pendingPayments'] as Record<string, unknown> | undefined) ?? {};
    delete pending[requestId];
    await chrome.storage.session.set({ pendingPayments: pending });

    paymentsInProgress.delete(tabId);
  }
}

// ── SW Restart Recovery ─────────────────────────────────────────────

const PENDING_TIMEOUT_MS = 60_000;

export async function recoverPendingPayments(): Promise<void> {
  const sessionData = await chrome.storage.session.get('pendingPayments');
  const pending = (sessionData['pendingPayments'] as Record<string, Record<string, unknown>> | undefined) ?? {};

  const now = Date.now();

  for (const [requestId, payment] of Object.entries(pending)) {
    const signedAt = (payment['signedAt'] as number) ?? 0;
    const tabId = (payment['tabId'] as number) ?? 0;

    const errorMsg = now - signedAt > PENDING_TIMEOUT_MS
      ? 'Settlement timeout (service worker restarted)'
      : 'Settlement interrupted (service worker restarted)';

    await updatePaymentStatus(requestId, 'failed', { error: errorMsg });
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PAYMENT_SETTLE_FAILED',
        requestId,
        success: false,
        error: errorMsg,
      });
    } catch { /* tab may be closed */ }
  }

  await chrome.storage.session.set({ pendingPayments: {} });
}

// ── History Handler ─────────────────────────────────────────────────

async function handleGetHistory(
  message: Record<string, unknown>,
): Promise<MessageResponse> {
  const limit = (message['limit'] as number | undefined) ?? 10;
  const offset = (message['offset'] as number | undefined) ?? 0;

  try {
    const records = await getHistory(limit, offset);
    return { success: true, records };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function setBadgeError(tabId: number): void {
  chrome.action.setBadgeText({ tabId, text: '!' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS.error });
}

// Formatting functions moved to shared/format.ts

async function handleExportPrivateKey(password: string): Promise<MessageResponse> {
  // Share brute-force lockout with unlock handler
  if (Date.now() < lockedUntil) {
    const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
    return { success: false, error: `Too many attempts. Try again in ${remaining}s` };
  }

  const data = await chrome.storage.local.get('wallet');
  const wallet = data['wallet'] as WalletData | undefined;

  if (!wallet) {
    return { success: false, error: 'No wallet found' };
  }

  try {
    const privateKey = await decryptKey(
      password,
      wallet.encryptedKey,
      wallet.keySalt,
      wallet.keyIv,
    );
    unlockAttempts = 0;
    lockedUntil = 0;
    return { success: true, privateKey };
  } catch {
    unlockAttempts++;
    if (unlockAttempts >= MAX_UNLOCK_ATTEMPTS) {
      lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      unlockAttempts = 0;
      return { success: false, error: 'Too many incorrect attempts. Wallet locked for 5 minutes.' };
    }
    const attemptsLeft = MAX_UNLOCK_ATTEMPTS - unlockAttempts;
    return { success: false, error: `Wrong password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.` };
  }
}

async function handleImportPrivateKey(
  rawKey: string,
  password: string,
): Promise<MessageResponse> {
  // Normalize: strip 0x prefix
  const normalized = rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey;

  // Validate: must be 64 hex chars
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return { success: false, error: 'Invalid private key format' };
  }

  // Validate: derive address (throws if scalar out of range)
  let address: string;
  try {
    const { privateKeyToAddress } = await import('viem/accounts');
    address = privateKeyToAddress(`0x${normalized}`);
  } catch {
    return { success: false, error: 'Invalid private key value' };
  }

  try {
    const encrypted = await encryptKey(password, `0x${normalized}`);
    const walletData: WalletData = {
      address,
      encryptedKey: encrypted.encryptedKey,
      keySalt: encrypted.keySalt,
      keyIv: encrypted.keyIv,
    };
    await chrome.storage.local.set({ wallet: walletData });
    // Force re-lock: clear the session-cached private key
    await chrome.storage.session.set({ privateKey: null });
    return { success: true, address };
  } catch {
    return { success: false, error: 'Encryption failed' };
  }
}

// ── Router ──────────────────────────────────────────────────────────

export function handleMessage(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const type = message['type'] as string | undefined;

  // Sensitive operations: only allow from extension pages (popup, options)
  const sensitiveTypes = ['CREATE_WALLET', 'UNLOCK_WALLET', 'SIGN_AND_PAY', 'GET_BALANCE', 'GET_HISTORY', 'EXPORT_PRIVATE_KEY', 'IMPORT_PRIVATE_KEY'];
  if (sensitiveTypes.includes(type ?? '')) {
    // sender.url starts with chrome-extension:// for extension pages
    if (!sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
      sendResponse({ success: false, error: 'Unauthorized sender' });
      return true;
    }
  }

  const handle = async () => {
    switch (type) {
      case 'CREATE_WALLET': {
        const password = message['password'];
        if (typeof password !== 'string' || password.length === 0) {
          return { success: false, error: 'Invalid password: must be a non-empty string' };
        }
        return handleCreateWallet(password);
      }
      case 'GET_WALLET_STATE':
        return handleGetWalletState();
      case 'UNLOCK_WALLET': {
        const password = message['password'];
        if (typeof password !== 'string' || password.length === 0) {
          return { success: false, error: 'Invalid password: must be a non-empty string' };
        }
        return handleUnlockWallet(password);
      }
      case 'GET_BALANCE':
        return handleGetBalance();
      case 'PAGE_HAS_PAPERWALL':
        return handlePageHasPaperwall(message, sender);
      case 'GET_PAGE_STATE':
        return handleGetPageState(message);
      case 'SIGN_AND_PAY': {
        const tabId = message['tabId'];
        if (typeof tabId !== 'number') {
          return { success: false, error: 'Invalid tabId: must be a number' };
        }
        return handleSignAndPay(message);
      }
      case 'GET_HISTORY':
        return handleGetHistory(message);
      case 'EXPORT_PRIVATE_KEY': {
        const password = message['password'];
        if (typeof password !== 'string' || password.length === 0) {
          return { success: false, error: 'Invalid password' };
        }
        return handleExportPrivateKey(password);
      }
      case 'IMPORT_PRIVATE_KEY': {
        const privateKey = message['privateKey'];
        const password = message['password'];
        if (typeof privateKey !== 'string' || typeof password !== 'string' || password.length === 0) {
          return { success: false, error: 'Invalid parameters' };
        }
        return handleImportPrivateKey(privateKey, password);
      }
      case 'SIGN_ONLY':
        return { success: false, error: 'SIGN_ONLY not yet implemented (Tier 3)' };
      default:
        return { success: false, error: `Unknown message type: ${type}` };
    }
  };

  handle()
    .then(sendResponse)
    .catch((err) => {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error';
      sendResponse({ success: false, error: errorMessage });
    });

  // Return true to indicate async response
  return true;
}

// ── Service Worker Registration ─────────────────────────────────────

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener(handleMessage);

  // Clean up active pages when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId: number) => {
    activePages.delete(tabId);
  });

  // Recover any pending optimistic payments from previous SW lifecycle
  recoverPendingPayments().catch(console.warn);
}
