import type { Receipt } from './types.js';

interface PageSummary {
  readonly total: number;
  readonly totalSpent: string;
  readonly totalDeclined: number;
}

export function renderReceiptPage(
  receipts: Receipt[],
  summary: PageSummary,
): string {
  const receiptRows =
    receipts.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#888;">No receipts yet</td></tr>'
      : receipts.map(renderReceiptRow).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="10">
  <title>Paperwall Receipt Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 1rem; }
    .header { background: #1a1a2e; color: #fff; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; }
    .header h1 { font-size: 1.5rem; }
    .summary { display: flex; gap: 2rem; margin-top: 0.75rem; font-size: 0.9rem; color: #ccc; }
    .summary span { font-weight: bold; color: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #e8e8e8; padding: 0.75rem; text-align: left; font-size: 0.85rem; text-transform: uppercase; color: #666; }
    td { padding: 0.75rem; border-top: 1px solid #eee; font-size: 0.9rem; vertical-align: top; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
    .badge-settled { background: #d4edda; color: #155724; }
    .badge-declined { background: #f8d7da; color: #721c24; }
    .badge-intent { background: #cce5ff; color: #004085; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .url { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mono { font-family: 'SF Mono', Monaco, monospace; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Paperwall Receipt Viewer</h1>
    <div class="summary">
      <div>Transactions: <span>${escapeHtml(String(summary.total))}</span></div>
      <div>Total Spent: <span>${escapeHtml(summary.totalSpent)} USDC</span></div>
      <div>Declined: <span>${escapeHtml(String(summary.totalDeclined))}</span></div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>AP2 Stage</th>
        <th>URL</th>
        <th>Amount</th>
        <th>Agent</th>
        <th>Tx Hash</th>
        <th>Time</th>
      </tr>
    </thead>
    <tbody>
      ${receiptRows}
    </tbody>
  </table>
</body>
</html>`;
}

function renderReceiptRow(receipt: Receipt): string {
  const badgeClass = `badge-${receipt.ap2Stage}`;
  const amount = receipt.settlement
    ? `${escapeHtml(receipt.settlement.amountFormatted)} USDC`
    : receipt.decline
      ? `(${escapeHtml(receipt.decline.reason)})`
      : '-';
  const txHash = receipt.settlement
    ? receipt.verification
      ? `<a href="${escapeHtml(receipt.verification.explorerUrl)}" target="_blank" class="mono">${escapeHtml(receipt.settlement.txHash.slice(0, 10))}...</a>`
      : `<span class="mono">${escapeHtml(receipt.settlement.txHash.slice(0, 10))}...</span>`
    : '-';
  const time = new Date(receipt.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<tr>
    <td><span class="badge ${badgeClass}">${escapeHtml(receipt.ap2Stage)}</span></td>
    <td class="url" title="${escapeHtml(receipt.url)}">${escapeHtml(receipt.url)}</td>
    <td>${amount}</td>
    <td>${escapeHtml(receipt.agentId ?? 'anonymous')}</td>
    <td>${txHash}</td>
    <td>${escapeHtml(time)}</td>
  </tr>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
