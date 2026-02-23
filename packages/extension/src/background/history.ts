// ── Payment History ──────────────────────────────────────────────
// Persists payment records in chrome.storage.local.
// Records are stored most-recent-first, capped at 1000 entries.

const STORAGE_KEY = 'paymentHistory';
const MAX_RECORDS = 1000;

// ── Types ────────────────────────────────────────────────────────

export interface PaymentRecord {
  requestId: string;
  origin: string;
  url: string;
  amount: string;
  formattedAmount: string;
  network: string;
  asset: string;
  from: string;
  to: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  settledAt?: number;
  error?: string;
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Adds a payment record to the beginning of the history.
 * Caps total records at 1000 (oldest dropped).
 */
export async function addPayment(record: PaymentRecord): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const existing = (data[STORAGE_KEY] as PaymentRecord[] | undefined) ?? [];

  // Prepend (most recent first) and cap
  const updated = [record, ...existing].slice(0, MAX_RECORDS);

  await chrome.storage.local.set({ [STORAGE_KEY]: updated });
}

/**
 * Updates the status of a payment record by requestId.
 */
export async function updatePaymentStatus(
  requestId: string,
  status: 'confirmed' | 'failed',
  fields: { txHash?: string; settledAt?: number; error?: string },
): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const records = (data[STORAGE_KEY] as PaymentRecord[] | undefined) ?? [];

  const updated = records.map((record) =>
    record.requestId === requestId
      ? { ...record, status, ...fields }
      : record,
  );

  await chrome.storage.local.set({ [STORAGE_KEY]: updated });
}

/**
 * Retrieves payment history with pagination.
 * @param limit Maximum number of records to return (default 10).
 * @param offset Number of records to skip from the beginning (default 0).
 */
export async function getHistory(
  limit = 10,
  offset = 0,
): Promise<PaymentRecord[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const records = (data[STORAGE_KEY] as PaymentRecord[] | undefined) ?? [];

  return records.slice(offset, offset + limit);
}
