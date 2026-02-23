import type { PaymentRecord } from '../../background/history.js';

// ── Types ──────────────────────────────────────────────────────────

type DateBucket = 'Today' | 'Yesterday' | 'This Week' | 'Older';

// ── Public API ────────────────────────────────────────────────────

export function renderHistoryFull(
  container: HTMLElement,
  records: readonly PaymentRecord[],
): void {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'screen-title';
  heading.textContent = 'Payment History';

  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.placeholder = 'Filter by domain…';
  filterInput.className = 'history-filter-input';
  filterInput.setAttribute('aria-label', 'Filter payments by domain');

  const listContainer = document.createElement('div');
  listContainer.className = 'history-full-list';

  container.append(heading, filterInput, listContainer);

  let expandedId: string | null = null;

  function renderList(filter: string): void {
    listContainer.innerHTML = '';
    const filtered = filter.trim()
      ? records.filter((r) => r.origin.toLowerCase().includes(filter.toLowerCase()))
      : records;

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty-state';
      empty.textContent = filter ? 'No payments match your filter.' : 'No payments yet.';
      listContainer.appendChild(empty);
      return;
    }

    const buckets = bucketRecords(filtered);
    for (const [bucket, bucketRecords] of buckets) {
      if (bucketRecords.length === 0) continue;

      const header = document.createElement('p');
      header.className = 'history-date-header';
      header.textContent = bucket;
      listContainer.appendChild(header);

      for (const record of bucketRecords) {
        listContainer.appendChild(buildRow(record, filter));
      }
    }
  }

  function buildRow(record: PaymentRecord, filter: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-expanded', String(expandedId === record.requestId));

    const summary = document.createElement('div');
    summary.className = 'history-row-summary';

    const origin = document.createElement('span');
    origin.className = 'history-origin';
    origin.textContent = record.origin;

    const amount = document.createElement('span');
    amount.className = 'history-amount';
    amount.textContent = `$${record.formattedAmount}`;

    const time = document.createElement('time');
    time.className = 'history-time';
    time.dateTime = new Date(record.timestamp).toISOString();
    time.textContent = formatRelativeTime(record.timestamp);

    summary.append(origin, amount, time);
    row.appendChild(summary);

    if (expandedId === record.requestId) {
      row.appendChild(buildDetail(record));
    }

    row.addEventListener('click', () => {
      expandedId = expandedId === record.requestId ? null : record.requestId;
      renderList(filter);
    });

    return row;
  }

  function buildDetail(record: PaymentRecord): HTMLElement {
    const detail = document.createElement('div');
    detail.className = 'history-row-detail';

    const rows: [string, string][] = [
      ['URL', record.url],
      ['Tx Hash', record.txHash],
      ['Network', record.network],
      ['Asset', record.asset],
    ];

    for (const [label, value] of rows) {
      const line = document.createElement('div');
      line.className = 'history-detail-line';

      const labelEl = document.createElement('span');
      labelEl.className = 'history-detail-label';
      labelEl.textContent = label;

      const valueEl = document.createElement('span');
      valueEl.className = 'history-detail-value';
      valueEl.textContent = value;

      if (label === 'Tx Hash') {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-secondary btn-small';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(value);
        });
        line.append(labelEl, valueEl, copyBtn);
      } else {
        line.append(labelEl, valueEl);
      }

      detail.appendChild(line);
    }

    return detail;
  }

  filterInput.addEventListener('input', () => renderList(filterInput.value));
  renderList('');
}

// ── Internal Helpers ──────────────────────────────────────────────

function bucketRecords(
  records: readonly PaymentRecord[],
): [DateBucket, PaymentRecord[]][] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const yesterdayMs = todayMs - 86_400_000;
  const weekMs = todayMs - 6 * 86_400_000;

  const buckets: Map<DateBucket, PaymentRecord[]> = new Map([
    ['Today', []],
    ['Yesterday', []],
    ['This Week', []],
    ['Older', []],
  ]);

  for (const record of records) {
    const ts = record.timestamp;
    if (ts >= todayMs) {
      buckets.get('Today')!.push(record);
    } else if (ts >= yesterdayMs) {
      buckets.get('Yesterday')!.push(record);
    } else if (ts >= weekMs) {
      buckets.get('This Week')!.push(record);
    } else {
      buckets.get('Older')!.push(record);
    }
  }

  return [...buckets.entries()];
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs < 60_000) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
