import type { PaymentRecord } from '../../background/history.js';

// ── Types ──────────────────────────────────────────────────────────

type RangeDays = 7 | 15 | 30;

export interface DailySpend {
  readonly date: string;
  readonly totalMicro: bigint;
}

export interface SiteSpend {
  readonly origin: string;
  readonly totalMicro: bigint;
  readonly count: number;
}

export interface MonthlySpend {
  readonly month: string;
  readonly totalMicro: bigint;
  readonly count: number;
}

// ── Public API ────────────────────────────────────────────────────

export function renderStats(
  container: HTMLElement,
  records: readonly PaymentRecord[],
): void {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'screen-title';
  heading.textContent = 'Spending Stats';

  container.appendChild(heading);

  let currentRange: RangeDays = 30;

  const rangeSelector = buildRangeSelector((range) => {
    currentRange = range;
    renderPeriodSection(periodSection, records, range);
    renderTopSites(topSitesSection, records, range);
  });

  const periodSection = document.createElement('section');
  periodSection.className = 'stats-period-section';

  const topSitesSection = document.createElement('section');
  topSitesSection.className = 'stats-top-sites-section';

  const monthlySection = document.createElement('section');
  monthlySection.className = 'stats-monthly-section';

  container.append(rangeSelector, periodSection, topSitesSection, monthlySection);

  renderPeriodSection(periodSection, records, currentRange);
  renderTopSites(topSitesSection, records, currentRange);
  renderMonthlyChart(monthlySection, records);
}

// ── Aggregation Exports (pure functions, tested directly) ─────────

export function filterByDays(
  records: readonly PaymentRecord[],
  days: number,
): readonly PaymentRecord[] {
  const cutoff = Date.now() - days * 86_400_000;
  return records.filter((r) => r.timestamp >= cutoff);
}

export function sumAmountFormatted(records: readonly PaymentRecord[]): string {
  const total = records.reduce((acc, r) => acc + BigInt(r.amount), 0n);
  const whole = total / 1_000_000n;
  const frac = total < 0n ? -(total % 1_000_000n) : total % 1_000_000n;
  return `${whole}.${String(frac).padStart(6, '0')}`;
}

export function groupByDay(
  records: readonly PaymentRecord[],
  days: number,
): readonly DailySpend[] {
  const result: Map<string, bigint> = new Map();
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.set(key, 0n);
  }

  for (const record of records) {
    const d = new Date(record.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (result.has(key)) {
      result.set(key, (result.get(key) ?? 0n) + BigInt(record.amount));
    }
  }

  return [...result.entries()].map(([date, totalMicro]) => ({ date, totalMicro }));
}

export function topSites(
  records: readonly PaymentRecord[],
  limit: number,
): readonly SiteSpend[] {
  const map = new Map<string, { totalMicro: bigint; count: number }>();

  for (const record of records) {
    const existing = map.get(record.origin) ?? { totalMicro: 0n, count: 0 };
    map.set(record.origin, {
      totalMicro: existing.totalMicro + BigInt(record.amount),
      count: existing.count + 1,
    });
  }

  return [...map.entries()]
    .map(([origin, data]) => ({ origin, ...data }))
    .sort((a, b) => (a.totalMicro > b.totalMicro ? -1 : 1))
    .slice(0, limit);
}

export function groupByMonth(
  records: readonly PaymentRecord[],
  months: number,
): readonly MonthlySpend[] {
  const result: Map<string, { totalMicro: bigint; count: number }> = new Map();
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.set(key, { totalMicro: 0n, count: 0 });
  }

  for (const record of records) {
    const d = new Date(record.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (result.has(key)) {
      const existing = result.get(key)!;
      result.set(key, {
        totalMicro: existing.totalMicro + BigInt(record.amount),
        count: existing.count + 1,
      });
    }
  }

  return [...result.entries()].map(([month, data]) => ({ month, ...data }));
}

// ── Internal Renderers ────────────────────────────────────────────

function buildRangeSelector(onChange: (range: RangeDays) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'stats-range-selector';

  for (const days of [7, 15, 30] as RangeDays[]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stats-range-btn' + (days === 30 ? ' stats-range-btn--active' : '');
    btn.dataset['days'] = String(days);
    btn.textContent = `${days}d`;
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.stats-range-btn').forEach((b) => b.classList.remove('stats-range-btn--active'));
      btn.classList.add('stats-range-btn--active');
      onChange(days);
    });
    wrap.appendChild(btn);
  }

  return wrap;
}

function renderPeriodSection(
  section: HTMLElement,
  records: readonly PaymentRecord[],
  days: RangeDays,
): void {
  section.innerHTML = '';
  const filtered = filterByDays(records, days);

  const total = document.createElement('p');
  total.className = 'stats-period-total';
  const strong = document.createElement('strong');
  strong.textContent = `$${sumAmountFormatted(filtered)}`;
  total.append(strong, ` USDC \u00b7 ${filtered.length} payment${filtered.length !== 1 ? 's' : ''}`);

  const daily = groupByDay(filtered, days);
  const svgEl = document.createElement('div');
  svgEl.className = 'stats-sparkline';
  svgEl.innerHTML = buildSparklineSvg(daily, 300, 40);

  section.append(total, svgEl);
}

function renderTopSites(
  section: HTMLElement,
  records: readonly PaymentRecord[],
  days: RangeDays,
): void {
  section.innerHTML = '';
  const heading = document.createElement('h3');
  heading.className = 'stats-section-heading';
  heading.textContent = 'Top Sites';
  section.appendChild(heading);

  const filtered = filterByDays(records, days);
  const sites = topSites(filtered, 5);

  if (sites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = 'No payments in this period.';
    section.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'stats-top-sites-list';

  for (const site of sites) {
    const li = document.createElement('li');
    li.className = 'stats-top-site-row';

    const origin = document.createElement('span');
    origin.className = 'stats-site-origin';
    origin.textContent = site.origin;

    const meta = document.createElement('span');
    meta.className = 'stats-site-meta';
    const whole = site.totalMicro / 1_000_000n;
    const frac = site.totalMicro % 1_000_000n;
    meta.textContent = `$${whole}.${String(frac).padStart(6, '0')} · ${site.count}×`;

    li.append(origin, meta);
    list.appendChild(li);
  }

  section.appendChild(list);
}

function renderMonthlyChart(section: HTMLElement, records: readonly PaymentRecord[]): void {
  section.innerHTML = '';
  const heading = document.createElement('h3');
  heading.className = 'stats-section-heading';
  heading.textContent = '6-Month History';
  section.appendChild(heading);

  const monthly = groupByMonth(records, 6);
  const svgEl = document.createElement('div');
  svgEl.className = 'stats-bar-chart';
  svgEl.innerHTML = buildBarChartSvg(monthly, 300, 60);
  section.appendChild(svgEl);
}

// ── SVG Generators ────────────────────────────────────────────────

function buildSparklineSvg(points: readonly DailySpend[], width: number, height: number): string {
  if (points.length === 0) return `<svg width="${width}" height="${height}"></svg>`;

  // Scale down by 1000 before Number() to stay within MAX_SAFE_INTEGER for large aggregates
  const values = points.map((p) => Number(p.totalMicro / 1000n));
  const max = Math.max(...values, 1);
  const step = width / (points.length - 1 || 1);

  const coords = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`)
    .join(' ');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <polyline points="${coords}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

function buildBarChartSvg(bars: readonly MonthlySpend[], width: number, height: number): string {
  if (bars.length === 0) return `<svg width="${width}" height="${height}"></svg>`;

  // Scale down by 1000 before Number() to stay within MAX_SAFE_INTEGER for large aggregates
  const values = bars.map((b) => Number(b.totalMicro / 1000n));
  const max = Math.max(...values, 1);
  const barWidth = (width / bars.length) * 0.7;
  const gap = (width / bars.length) * 0.3;
  const labelHeight = 14;
  const chartHeight = height - labelHeight;

  const rects = bars.map((bar, i) => {
    const barH = Math.max((Number(bar.totalMicro / 1000n) / max) * chartHeight, bar.totalMicro > 0n ? 2 : 0);
    const x = i * (barWidth + gap);
    const y = chartHeight - barH;
    const label = bar.month.slice(5); // 'MM'
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" fill="var(--color-primary)" rx="2"/>
    <text x="${(x + barWidth / 2).toFixed(1)}" y="${height}" text-anchor="middle" font-size="10" fill="var(--color-text-secondary)">${label}</text>`;
  }).join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${rects}</svg>`;
}
