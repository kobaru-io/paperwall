// ── Budget Tab Screen ────────────────────────────────────────────
// Displays auto-pay budget overview: daily/monthly progress, trusted sites,
// global limit editing, and denylist management.

import { formatUsdcFromString, dollarToRaw, rawToDollar } from '../../shared/format.js';
import type { SiteRule, AutoPayRules } from '../../shared/auto-pay-types.js';

function safeFormatUsdc(raw: string): string {
  try {
    return formatUsdcFromString(raw);
  } catch {
    return '0.00';
  }
}

function spendPercent(spent: string, limit: string): number {
  const s = Number(spent);
  const l = Number(limit);
  if (l <= 0) return 0;
  return Math.min(Math.round((s / l) * 100), 100);
}

function progressColor(percent: number): string {
  if (percent >= 85) return 'var(--color-error)';
  if (percent >= 70) return '#d97706'; // amber
  return 'var(--color-success)';
}

// ── State ────────────────────────────────────────────────────────

type SubView = 'main' | 'globals' | 'denylist';

let currentView: SubView = 'main';
let editingOrigin: string | null = null;
let storageListener: ((changes: Record<string, unknown>) => void) | null = null;
let activeContainer: HTMLElement | null = null;

// ── Public API ───────────────────────────────────────────────────

export function renderBudget(container: HTMLElement): void {
  activeContainer = container;
  currentView = 'main';
  editingOrigin = null;

  // Register reactive listener
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
  }
  storageListener = (changes: Record<string, unknown>) => {
    if ('autoPayRules' in changes && activeContainer) {
      loadAndRender(activeContainer);
    }
  };
  chrome.storage.onChanged.addListener(storageListener);

  loadAndRender(container);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'GET_AUTO_PAY_RULES' });
  if (!response || !response.success) {
    container.innerHTML = '';
    const errorEl = document.createElement('p');
    errorEl.className = 'budget-error';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = 'Failed to load budget data.';
    container.appendChild(errorEl);
    return;
  }

  const rules = response.rules as AutoPayRules;

  switch (currentView) {
    case 'globals':
      renderGlobalsView(container, rules);
      break;
    case 'denylist':
      renderDenylistView(container, rules);
      break;
    default:
      renderMainView(container, rules);
      break;
  }
}

// ── Main View ────────────────────────────────────────────────────

function renderMainView(container: HTMLElement, rules: AutoPayRules): void {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'screen-title';
  heading.textContent = 'Budget';

  // Pause toggle
  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'budget-toggle-wrap';

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'budget-toggle-label';
  toggleLabel.textContent = 'Auto-pay';

  const toggleSwitch = document.createElement('button');
  toggleSwitch.type = 'button';
  toggleSwitch.className = 'budget-toggle-switch' + (rules.globalEnabled ? ' budget-toggle-switch--on' : '');
  toggleSwitch.setAttribute('role', 'switch');
  toggleSwitch.setAttribute('aria-checked', String(rules.globalEnabled));
  toggleSwitch.setAttribute('aria-label', 'Toggle auto-pay');
  toggleSwitch.addEventListener('click', async () => {
    toggleSwitch.disabled = true;
    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_TOGGLE_PAUSE',
      enabled: !rules.globalEnabled,
    });
    toggleSwitch.disabled = false;
  });

  toggleWrap.append(toggleLabel, toggleSwitch);

  // Paused banner
  let pausedBanner: HTMLElement | null = null;
  if (!rules.globalEnabled) {
    pausedBanner = document.createElement('div');
    pausedBanner.className = 'budget-paused-banner';
    pausedBanner.setAttribute('role', 'status');
    pausedBanner.setAttribute('aria-live', 'polite');
    pausedBanner.textContent = 'Auto-pay is paused';
  }

  // Progress bars section
  const progressSection = document.createElement('section');
  progressSection.className = 'budget-progress-section';
  progressSection.setAttribute('role', 'status');
  progressSection.setAttribute('aria-live', 'polite');

  const dailyPercent = spendPercent(rules.dailySpentRaw, rules.dailyLimitRaw);
  const monthlyPercent = spendPercent(rules.monthlySpentRaw, rules.monthlyLimitRaw);
  const paused = !rules.globalEnabled;

  progressSection.appendChild(
    buildProgressBar('Daily', rules.dailySpentRaw, rules.dailyLimitRaw, dailyPercent, paused),
  );
  progressSection.appendChild(
    buildProgressBar('Monthly', rules.monthlySpentRaw, rules.monthlyLimitRaw, monthlyPercent, paused),
  );

  // Action buttons row
  const actionsRow = document.createElement('div');
  actionsRow.className = 'budget-actions-row';

  const editLimitsBtn = document.createElement('button');
  editLimitsBtn.type = 'button';
  editLimitsBtn.className = 'btn btn-secondary budget-action-btn';
  editLimitsBtn.textContent = 'Edit limits';
  editLimitsBtn.setAttribute('aria-label', 'Edit global limits');
  editLimitsBtn.addEventListener('click', () => {
    currentView = 'globals';
    editingOrigin = null;
    loadAndRender(container);
  });

  const blockedBtn = document.createElement('button');
  blockedBtn.type = 'button';
  blockedBtn.className = 'btn btn-secondary budget-action-btn';
  blockedBtn.textContent = 'Blocked sites';
  blockedBtn.setAttribute('aria-label', 'Manage blocked sites');
  blockedBtn.addEventListener('click', () => {
    currentView = 'denylist';
    editingOrigin = null;
    loadAndRender(container);
  });

  actionsRow.append(editLimitsBtn, blockedBtn);

  // Trusted sites section
  const sitesSection = document.createElement('section');
  sitesSection.className = 'budget-sites-section';

  const sitesHeading = document.createElement('h3');
  sitesHeading.className = 'budget-section-heading';
  sitesHeading.textContent = 'Trusted Sites';
  sitesSection.appendChild(sitesHeading);

  const siteEntries = Object.values(rules.sites);

  if (siteEntries.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'budget-empty-state';

    const emptyTitle = document.createElement('p');
    emptyTitle.className = 'budget-empty-title';
    emptyTitle.textContent = 'No trusted sites yet';

    const emptyText = document.createElement('p');
    emptyText.className = 'budget-empty-text';
    emptyText.textContent = 'Sites you approve for auto-pay will appear here. Visit a Paperwall-enabled site to get started.';

    emptyState.append(emptyTitle, emptyText);
    sitesSection.appendChild(emptyState);
  } else {
    // Sort by monthly spend descending
    const sorted = [...siteEntries].sort(
      (a, b) => Number(b.monthlySpentRaw) - Number(a.monthlySpentRaw),
    );

    const sitesList = document.createElement('ul');
    sitesList.className = 'budget-sites-list';

    for (const site of sorted) {
      sitesList.appendChild(buildSiteRow(container, site));
    }

    sitesSection.appendChild(sitesList);
  }

  // Assemble
  container.append(heading, toggleWrap);
  if (pausedBanner) container.appendChild(pausedBanner);
  container.append(progressSection, actionsRow, sitesSection);
}

// ── Progress Bar ─────────────────────────────────────────────────

function buildProgressBar(
  label: string,
  spentRaw: string,
  limitRaw: string,
  percent: number,
  paused: boolean,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'budget-progress';

  const labelRow = document.createElement('div');
  labelRow.className = 'budget-progress-label';

  const nameEl = document.createElement('span');
  nameEl.textContent = label;

  const amountEl = document.createElement('span');
  amountEl.className = 'budget-progress-amount';
  amountEl.textContent = `$${safeFormatUsdc(spentRaw)} / $${safeFormatUsdc(limitRaw)}`;

  labelRow.append(nameEl, amountEl);

  const track = document.createElement('div');
  track.className = 'budget-progress-track' + (paused ? ' budget-progress-track--paused' : '');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuenow', String(percent));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-label', `${label} budget usage ${percent}%`);

  const fill = document.createElement('div');
  fill.className = 'budget-progress-fill';
  fill.style.width = `${percent}%`;
  fill.style.backgroundColor = paused ? 'var(--color-text-secondary)' : progressColor(percent);

  track.appendChild(fill);
  wrap.append(labelRow, track);
  return wrap;
}

// ── Site Row ─────────────────────────────────────────────────────

function buildSiteRow(container: HTMLElement, site: SiteRule): HTMLElement {
  const li = document.createElement('li');
  li.className = 'budget-site-row';

  const mainRow = document.createElement('div');
  mainRow.className = 'budget-site-main';

  const originEl = document.createElement('span');
  originEl.className = 'budget-site-origin';
  originEl.textContent = site.origin;
  originEl.title = site.origin;

  const spendEl = document.createElement('span');
  spendEl.className = 'budget-site-spend';
  spendEl.textContent = `$${safeFormatUsdc(site.monthlySpentRaw)} / $${safeFormatUsdc(site.monthlyBudgetRaw)}`;

  const btnGroup = document.createElement('div');
  btnGroup.className = 'budget-site-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-icon';
  editBtn.textContent = 'Edit';
  editBtn.setAttribute('aria-label', `Edit ${site.origin}`);
  editBtn.addEventListener('click', () => {
    editingOrigin = editingOrigin === site.origin ? null : site.origin;
    loadAndRender(container);
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-icon btn-icon--danger';
  removeBtn.textContent = 'Remove';
  removeBtn.setAttribute('aria-label', `Remove ${site.origin}`);
  removeBtn.addEventListener('click', async () => {
    removeBtn.disabled = true;
    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_REMOVE_SITE',
      origin: site.origin,
    });
  });

  btnGroup.append(editBtn, removeBtn);
  mainRow.append(originEl, spendEl, btnGroup);
  li.appendChild(mainRow);

  // Inline edit panel
  if (editingOrigin === site.origin) {
    li.appendChild(buildInlineEdit(container, site));
  }

  return li;
}

function buildInlineEdit(container: HTMLElement, site: SiteRule): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'budget-site-edit';

  const budgetGroup = document.createElement('div');
  budgetGroup.className = 'field-group';

  const budgetLabel = document.createElement('label');
  budgetLabel.className = 'field-label';
  budgetLabel.textContent = 'Monthly budget ($)';

  const budgetInput = document.createElement('input');
  budgetInput.type = 'text';
  budgetInput.inputMode = 'decimal';
  budgetInput.className = 'field-input';
  budgetInput.value = rawToDollar(site.monthlyBudgetRaw);
  budgetInput.setAttribute('aria-label', 'Monthly budget in dollars');

  budgetGroup.append(budgetLabel, budgetInput);

  const maxGroup = document.createElement('div');
  maxGroup.className = 'field-group';

  const maxLabel = document.createElement('label');
  maxLabel.className = 'field-label';
  maxLabel.textContent = 'Max per transaction ($)';

  const maxInput = document.createElement('input');
  maxInput.type = 'text';
  maxInput.inputMode = 'decimal';
  maxInput.className = 'field-input';
  maxInput.value = rawToDollar(site.maxAmountRaw);
  maxInput.setAttribute('aria-label', 'Max per transaction in dollars');

  maxGroup.append(maxLabel, maxInput);

  const errorEl = document.createElement('p');
  errorEl.className = 'field-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'polite');

  const btnRow = document.createElement('div');
  btnRow.className = 'budget-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.setAttribute('aria-label', `Save changes for ${site.origin}`);
  saveBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const budgetVal = parseFloat(budgetInput.value);
    const maxVal = parseFloat(maxInput.value);

    if (isNaN(budgetVal) || budgetVal <= 0) {
      errorEl.textContent = 'Invalid budget amount.';
      return;
    }
    if (isNaN(maxVal) || maxVal <= 0) {
      errorEl.textContent = 'Invalid max amount.';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_UPDATE_SITE',
      origin: site.origin,
      monthlyBudgetRaw: dollarToRaw(budgetInput.value),
      maxAmountRaw: dollarToRaw(maxInput.value),
    });

    editingOrigin = null;
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    editingOrigin = null;
    loadAndRender(container);
  });

  btnRow.append(saveBtn, cancelBtn);
  panel.append(budgetGroup, maxGroup, errorEl, btnRow);
  return panel;
}

// ── Globals View ─────────────────────────────────────────────────

function renderGlobalsView(container: HTMLElement, rules: AutoPayRules): void {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'screen-title';
  heading.textContent = 'Edit Limits';

  // Daily limit
  const dailyGroup = document.createElement('div');
  dailyGroup.className = 'field-group';

  const dailyLabel = document.createElement('label');
  dailyLabel.className = 'field-label';
  dailyLabel.textContent = 'Daily limit ($)';

  const dailyInput = document.createElement('input');
  dailyInput.type = 'text';
  dailyInput.inputMode = 'decimal';
  dailyInput.className = 'field-input';
  dailyInput.value = rawToDollar(rules.dailyLimitRaw);
  dailyInput.setAttribute('aria-label', 'Daily spending limit in dollars');

  dailyGroup.append(dailyLabel, dailyInput);

  // Monthly limit
  const monthlyGroup = document.createElement('div');
  monthlyGroup.className = 'field-group';

  const monthlyLabel = document.createElement('label');
  monthlyLabel.className = 'field-label';
  monthlyLabel.textContent = 'Monthly limit ($)';

  const monthlyInput = document.createElement('input');
  monthlyInput.type = 'text';
  monthlyInput.inputMode = 'decimal';
  monthlyInput.className = 'field-input';
  monthlyInput.value = rawToDollar(rules.monthlyLimitRaw);
  monthlyInput.setAttribute('aria-label', 'Monthly spending limit in dollars');

  monthlyGroup.append(monthlyLabel, monthlyInput);

  // Default site budget
  const defaultGroup = document.createElement('div');
  defaultGroup.className = 'field-group';

  const defaultLabel = document.createElement('label');
  defaultLabel.className = 'field-label';
  defaultLabel.textContent = 'Default site budget ($)';

  const defaultInput = document.createElement('input');
  defaultInput.type = 'text';
  defaultInput.inputMode = 'decimal';
  defaultInput.className = 'field-input';
  defaultInput.value = rawToDollar(rules.defaultSiteBudgetRaw);
  defaultInput.setAttribute('aria-label', 'Default site budget in dollars');

  defaultGroup.append(defaultLabel, defaultInput);

  const errorEl = document.createElement('p');
  errorEl.className = 'field-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'polite');

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'budget-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.setAttribute('aria-label', 'Save global limits');
  saveBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const dailyVal = parseFloat(dailyInput.value);
    const monthlyVal = parseFloat(monthlyInput.value);
    const defaultVal = parseFloat(defaultInput.value);

    if (isNaN(dailyVal) || dailyVal <= 0) {
      errorEl.textContent = 'Invalid daily limit.';
      return;
    }
    if (isNaN(monthlyVal) || monthlyVal <= 0) {
      errorEl.textContent = 'Invalid monthly limit.';
      return;
    }
    if (isNaN(defaultVal) || defaultVal <= 0) {
      errorEl.textContent = 'Invalid default budget.';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_UPDATE_GLOBALS',
      dailyLimitRaw: dollarToRaw(dailyInput.value),
      monthlyLimitRaw: dollarToRaw(monthlyInput.value),
      defaultSiteBudgetRaw: dollarToRaw(defaultInput.value),
    });

    currentView = 'main';
    editingOrigin = null;
    loadAndRender(container);
  });

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = 'Back';
  backBtn.setAttribute('aria-label', 'Back to budget overview');
  backBtn.addEventListener('click', () => {
    currentView = 'main';
    editingOrigin = null;
    loadAndRender(container);
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn btn-secondary';
  resetBtn.textContent = 'Reset to defaults';
  resetBtn.setAttribute('aria-label', 'Reset limits to default values');
  resetBtn.addEventListener('click', async () => {
    resetBtn.disabled = true;
    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_UPDATE_GLOBALS',
      dailyLimitRaw: '2000000',
      monthlyLimitRaw: '20000000',
      defaultSiteBudgetRaw: '500000',
    });

    currentView = 'main';
    editingOrigin = null;
    loadAndRender(container);
  });

  btnRow.append(saveBtn, backBtn, resetBtn);
  container.append(heading, dailyGroup, monthlyGroup, defaultGroup, errorEl, btnRow);
}

// ── Denylist View ────────────────────────────────────────────────

function renderDenylistView(container: HTMLElement, rules: AutoPayRules): void {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'screen-title';
  heading.textContent = 'Blocked Sites';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = 'Back';
  backBtn.setAttribute('aria-label', 'Back to budget overview');
  backBtn.addEventListener('click', () => {
    currentView = 'main';
    editingOrigin = null;
    loadAndRender(container);
  });

  // Add site input
  const addRow = document.createElement('div');
  addRow.className = 'budget-denylist-add';

  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'field-input';
  addInput.placeholder = 'https://example.com';
  addInput.setAttribute('aria-label', 'Site origin to block');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = 'Add';
  addBtn.setAttribute('aria-label', 'Add site to block list');
  addBtn.addEventListener('click', async () => {
    const origin = addInput.value.trim();
    if (!origin) return;
    addBtn.disabled = true;
    await chrome.runtime.sendMessage({
      type: 'AUTO_PAY_ADD_DENYLIST',
      origin,
    });
    addInput.value = '';
    addBtn.disabled = false;
  });

  addRow.append(addInput, addBtn);

  // Blocked sites list
  const listSection = document.createElement('section');
  listSection.className = 'budget-denylist-section';
  listSection.setAttribute('role', 'status');
  listSection.setAttribute('aria-live', 'polite');

  if (rules.denylist.length === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'budget-empty-text';
    emptyEl.textContent = 'No blocked sites.';
    listSection.appendChild(emptyEl);
  } else {
    const list = document.createElement('ul');
    list.className = 'budget-denylist';

    for (const origin of rules.denylist) {
      const li = document.createElement('li');
      li.className = 'budget-denylist-row';

      const originEl = document.createElement('span');
      originEl.className = 'budget-denylist-origin';
      originEl.textContent = origin;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-icon btn-icon--danger';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Unblock ${origin}`);
      removeBtn.addEventListener('click', async () => {
        removeBtn.disabled = true;
        await chrome.runtime.sendMessage({
          type: 'AUTO_PAY_REMOVE_DENYLIST',
          origin,
        });
      });

      li.append(originEl, removeBtn);
      list.appendChild(li);
    }

    listSection.appendChild(list);
  }

  container.append(heading, backBtn, addRow, listSection);
}
