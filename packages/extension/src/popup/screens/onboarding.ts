// ── Budget Onboarding Screen ─────────────────────────────────────
// First-run screen after wallet creation to set global spending limits.
// Shown once, before the main dashboard.

import { formatUsdcFromString, dollarToRaw, rawToDollar } from '../../shared/format.js';

// Default values in raw USDC units (6 decimals)
const DEFAULTS = {
  dailyLimitRaw: '2000000',     // $2.00
  monthlyLimitRaw: '20000000',  // $20.00
  defaultSiteBudgetRaw: '500000', // $0.50
} as const;

export function renderOnboarding(
  container: HTMLElement,
  onComplete: () => void,
): void {
  container.innerHTML = '';
  container.style.padding = '16px';

  const heading = document.createElement('h1');
  heading.className = 'screen-title';
  heading.textContent = 'Set Your Spending Limits';

  const description = document.createElement('p');
  description.className = 'screen-description';
  description.textContent =
    'Choose your auto-pay limits. You can always change these later in the Budget tab.';

  // ── Form Fields ──────────────────────────────────────────────
  const form = document.createElement('div');
  form.className = 'onboarding-fields';

  function createField(label: string, defaultRaw: string, id: string): { group: HTMLElement; input: HTMLInputElement } {
    const group = document.createElement('div');
    group.className = 'field-group';

    const lbl = document.createElement('label');
    lbl.className = 'field-label';
    lbl.textContent = label;
    lbl.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.id = id;
    input.className = 'field-input';
    input.value = rawToDollar(defaultRaw);
    input.setAttribute('aria-label', label);

    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent = `Suggested: $${formatUsdcFromString(defaultRaw)}`;

    group.append(lbl, input, hint);
    return { group, input };
  }

  const dailyField = createField('Daily limit', DEFAULTS.dailyLimitRaw, 'onboard-daily');
  const monthlyField = createField('Monthly limit', DEFAULTS.monthlyLimitRaw, 'onboard-monthly');
  const siteField = createField('Default per-site budget', DEFAULTS.defaultSiteBudgetRaw, 'onboard-site');

  form.append(dailyField.group, monthlyField.group, siteField.group);

  // ── Validation Error ─────────────────────────────────────────
  const errorMsg = document.createElement('p');
  errorMsg.className = 'field-error';
  errorMsg.setAttribute('role', 'alert');

  // ── Buttons ──────────────────────────────────────────────────
  const buttonRow = document.createElement('div');
  buttonRow.className = 'onboarding-buttons';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.textContent = 'Looks good';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn btn-secondary';
  skipBtn.textContent = 'Skip for now';

  buttonRow.append(confirmBtn, skipBtn);

  // ── Handlers ─────────────────────────────────────────────────
  async function save(useDefaults: boolean): Promise<void> {
    confirmBtn.disabled = true;
    skipBtn.disabled = true;
    errorMsg.textContent = '';

    const dailyRaw = useDefaults ? DEFAULTS.dailyLimitRaw : dollarToRaw(dailyField.input.value);
    const monthlyRaw = useDefaults ? DEFAULTS.monthlyLimitRaw : dollarToRaw(monthlyField.input.value);
    const siteRaw = useDefaults ? DEFAULTS.defaultSiteBudgetRaw : dollarToRaw(siteField.input.value);

    if (!useDefaults) {
      // Validate: all values must be > 0
      if (dailyRaw === '0' || monthlyRaw === '0' || siteRaw === '0') {
        errorMsg.textContent = 'All values must be greater than $0.00';
        confirmBtn.disabled = false;
        skipBtn.disabled = false;
        return;
      }
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'AUTO_PAY_INIT_DEFAULTS',
        dailyLimitRaw: dailyRaw,
        monthlyLimitRaw: monthlyRaw,
        defaultSiteBudgetRaw: siteRaw,
      });
      onComplete();
    } catch {
      errorMsg.textContent = 'Failed to save settings';
      confirmBtn.disabled = false;
      skipBtn.disabled = false;
    }
  }

  confirmBtn.addEventListener('click', () => void save(false));
  skipBtn.addEventListener('click', () => void save(true));

  // ── Assembly ─────────────────────────────────────────────────
  container.append(heading, description, form, errorMsg, buttonRow);
  confirmBtn.focus();
}
