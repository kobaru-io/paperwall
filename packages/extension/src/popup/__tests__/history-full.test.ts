// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHistoryFull } from '../screens/history-full.js';
import type { PaymentRecord } from '../../background/history.js';

function makeRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    requestId: 'req-1',
    origin: 'example.com',
    url: 'https://example.com/article',
    amount: '50000',
    formattedAmount: '0.05',
    network: 'eip155:324705682',
    asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
    from: '0xABC',
    to: '0xDEF',
    txHash: '0x123abc',
    status: 'confirmed',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('renderHistoryFull', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('shows empty state when records array is empty', () => {
    renderHistoryFull(container, []);
    expect(container.querySelector('.history-empty-state')).not.toBeNull();
  });

  it('renders one row per record', () => {
    const records = [makeRecord({ requestId: '1' }), makeRecord({ requestId: '2' })];
    renderHistoryFull(container, records);
    expect(container.querySelectorAll('.history-row')).toHaveLength(2);
  });

  it('displays origin and formatted amount', () => {
    renderHistoryFull(container, [makeRecord()]);
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('0.05');
  });

  it('filters records by domain on filter input', () => {
    const records = [
      makeRecord({ requestId: '1', origin: 'news.com' }),
      makeRecord({ requestId: '2', origin: 'blog.org' }),
    ];
    renderHistoryFull(container, records);
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'news';
    input.dispatchEvent(new Event('input'));
    expect(container.querySelectorAll('.history-row')).toHaveLength(1);
  });

  it('shows empty state when filter matches nothing', () => {
    renderHistoryFull(container, [makeRecord()]);
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'zzznomatch';
    input.dispatchEvent(new Event('input'));
    expect(container.querySelector('.history-empty-state')).not.toBeNull();
  });

  it('groups records under Today header when timestamp is recent', () => {
    const record = makeRecord({ timestamp: Date.now() - 1000 });
    renderHistoryFull(container, [record]);
    expect(container.textContent).toContain('Today');
  });

  it('clicking a row expands to show tx hash', () => {
    renderHistoryFull(container, [makeRecord({ txHash: '0xdeadbeef' })]);
    const row = container.querySelector('.history-row') as HTMLElement;
    row.click();
    expect(container.querySelector('.history-row-detail')).not.toBeNull();
    expect(container.textContent).toContain('0xdeadbeef');
  });

  it('clicking expanded row again collapses it', () => {
    renderHistoryFull(container, [makeRecord()]);
    const row = container.querySelector('.history-row') as HTMLElement;
    row.click();
    row.click();
    expect(container.querySelector('.history-row-detail')).toBeNull();
  });
});
