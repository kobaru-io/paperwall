import { renderUnlock } from './unlock.js';
import { renderSetup } from './setup.js';

// ── Public API ────────────────────────────────────────────────────

export function renderSettings(container: HTMLElement, address: string): void {
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'screen-title';
  heading.textContent = 'Settings';

  // Wallet address display
  const addrSection = document.createElement('section');
  addrSection.className = 'settings-address-section';
  const addrLabel = document.createElement('p');
  addrLabel.className = 'settings-label';
  addrLabel.textContent = 'Wallet Address';
  const addrValue = document.createElement('p');
  addrValue.className = 'address-display';
  addrValue.textContent = `${address.slice(0, 8)}…${address.slice(-6)}`;
  addrValue.title = address;
  addrSection.append(addrLabel, addrValue);

  // Action buttons
  const actionsSection = document.createElement('section');
  actionsSection.className = 'settings-actions-section';

  const flowContainer = document.createElement('div');
  flowContainer.className = 'settings-flow-container';

  const exportBtn = buildActionButton('Export Private Key', 'btn-secondary', () => {
    renderExportStep1(flowContainer, container, address);
  });

  const importBtn = buildActionButton('Import Private Key', 'btn-secondary', () => {
    renderDestructiveGate(flowContainer, () => renderImportForm(flowContainer, container));
  });

  const createNewBtn = buildActionButton('Create New Wallet', 'btn-danger', () => {
    renderDestructiveGate(flowContainer, () => {
      renderSetup(container, (newAddress: string) => {
        renderSettings(container, newAddress);
      });
    });
  });

  actionsSection.append(exportBtn, importBtn, createNewBtn, flowContainer);

  // About section
  const aboutSection = buildAboutSection();

  container.append(heading, addrSection, actionsSection, aboutSection);
}

// ── Export Flow ───────────────────────────────────────────────────

function renderExportStep1(
  flowContainer: HTMLElement,
  _pageContainer: HTMLElement,
  _address: string,
): void {
  flowContainer.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'warning-panel';

  const icon = document.createElement('p');
  icon.className = 'warning-icon';
  icon.textContent = '⚠️';

  const title = document.createElement('h3');
  title.className = 'warning-title';
  title.textContent = 'Warning: Private Key Export';

  const text = document.createElement('p');
  text.className = 'warning-text';
  text.textContent =
    'This wallet is intended for micropayments only. Never store more than ~$50 USDC in it. ' +
    'Anyone with your private key can access and steal all funds. ' +
    'This is NOT a secure general-purpose wallet.';

  const proceedBtn = document.createElement('button');
  proceedBtn.type = 'button';
  proceedBtn.className = 'btn btn-danger';
  proceedBtn.textContent = 'I understand the risks — Continue';
  proceedBtn.addEventListener('click', () => renderExportStep2(flowContainer));

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { flowContainer.innerHTML = ''; });

  panel.append(icon, title, text, proceedBtn, cancelBtn);
  flowContainer.appendChild(panel);
}

function renderExportStep2(flowContainer: HTMLElement): void {
  flowContainer.innerHTML = '';

  const form = document.createElement('form');
  form.className = 'settings-form';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = 'Re-enter your password to confirm';

  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'field-input';
  input.placeholder = 'Password';
  input.autocomplete = 'current-password';
  input.required = true;

  const errorEl = document.createElement('p');
  errorEl.className = 'field-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'polite');

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.textContent = 'Reveal Key';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { flowContainer.innerHTML = ''; });

  form.append(label, input, errorEl, submitBtn, cancelBtn);
  flowContainer.appendChild(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Decrypting…';
    errorEl.textContent = '';

    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_PRIVATE_KEY',
      password: input.value,
    });

    if (response.success) {
      renderExportStep3(flowContainer, response.privateKey as string);
    } else {
      errorEl.textContent = (response.error as string) ?? 'Failed to decrypt key.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reveal Key';
    }
  });
}

function renderExportStep3(flowContainer: HTMLElement, privateKey: string): void {
  flowContainer.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'export-reveal-panel';

  const label = document.createElement('p');
  label.className = 'settings-label';
  label.textContent = 'Your Private Key';

  const keyDisplay = document.createElement('p');
  keyDisplay.className = 'export-key-display';
  keyDisplay.textContent = privateKey;
  keyDisplay.setAttribute('aria-label', 'Private key');

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-primary';
  copyBtn.textContent = 'Copy to Clipboard';

  const countdown = document.createElement('p');
  countdown.className = 'export-countdown';

  let secondsLeft = 60;
  let clipboardUsed = false;

  const tick = setInterval(() => {
    secondsLeft--;
    countdown.textContent = `Key hidden in ${secondsLeft}s`;
    if (secondsLeft <= 0) {
      clearInterval(tick);
      if (clipboardUsed) {
        navigator.clipboard.writeText('').catch(() => {});
      }
      flowContainer.innerHTML = '';
    }
  }, 1000);

  countdown.textContent = `Key hidden in ${secondsLeft}s`;

  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(privateKey);
    clipboardUsed = true;
    copyBtn.textContent = 'Copied!';
    copyBtn.disabled = true;
  });

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'btn btn-secondary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => {
    clearInterval(tick);
    if (clipboardUsed) navigator.clipboard.writeText('').catch(() => {});
    flowContainer.innerHTML = '';
  });

  panel.append(label, keyDisplay, copyBtn, countdown, doneBtn);
  flowContainer.appendChild(panel);
}

// ── Destructive Gate ──────────────────────────────────────────────

function renderDestructiveGate(flowContainer: HTMLElement, onProceed: () => void): void {
  flowContainer.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'warning-panel';

  const icon = document.createElement('p');
  icon.className = 'warning-icon';
  icon.textContent = '🚨';

  const title = document.createElement('h3');
  title.className = 'warning-title';
  title.textContent = 'Permanent Wallet Replacement';

  const text = document.createElement('p');
  text.className = 'warning-text';
  text.textContent =
    'This extension supports only one wallet address. ' +
    'Proceeding will permanently replace your current key. ' +
    'If you have not backed up your current private key, any funds in it will be PERMANENTLY LOST with no recovery.';

  const checkWrap = document.createElement('label');
  checkWrap.className = 'destructive-confirm-label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'destructive-confirm-checkbox';

  const checkText = document.createElement('span');
  checkText.textContent = 'I understand my current wallet will be permanently deleted';

  checkWrap.append(checkbox, checkText);

  const proceedBtn = document.createElement('button');
  proceedBtn.type = 'button';
  proceedBtn.className = 'btn btn-danger destructive-proceed-btn';
  proceedBtn.textContent = 'Proceed';
  proceedBtn.disabled = true;

  checkbox.addEventListener('change', () => {
    proceedBtn.disabled = !checkbox.checked;
  });

  proceedBtn.addEventListener('click', () => {
    if (checkbox.checked) onProceed();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { flowContainer.innerHTML = ''; });

  panel.append(icon, title, text, checkWrap, proceedBtn, cancelBtn);
  flowContainer.appendChild(panel);
}

// ── Import Flow ───────────────────────────────────────────────────

function renderImportForm(flowContainer: HTMLElement, pageContainer: HTMLElement): void {
  flowContainer.innerHTML = '';

  const form = document.createElement('form');
  form.className = 'settings-form';

  const keyInput = buildField(form, 'Private Key (0x…)', 'text', 'off');
  const passInput = buildField(form, 'New Password', 'password', 'new-password');
  const confirmInput = buildField(form, 'Confirm Password', 'password', 'new-password');

  const errorEl = document.createElement('p');
  errorEl.className = 'field-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'polite');

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.textContent = 'Import Wallet';

  form.append(errorEl, submitBtn);
  flowContainer.appendChild(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    if (passInput.value !== confirmInput.value) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing…';

    const response = await chrome.runtime.sendMessage({
      type: 'IMPORT_PRIVATE_KEY',
      privateKey: keyInput.value.trim(),
      password: passInput.value,
    });

    if (response.success) {
      // Re-lock: route to unlock screen
      renderUnlock(pageContainer, async () => {
        const updated = await chrome.runtime.sendMessage({ type: 'GET_WALLET_STATE' });
        renderSettings(pageContainer, updated.address as string);
      });
    } else {
      errorEl.textContent = (response.error as string) ?? 'Import failed.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Import Wallet';
    }
  });
}

// ── About Section ─────────────────────────────────────────────────

function buildAboutSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'settings-about-section';

  const heading = document.createElement('h3');
  heading.className = 'settings-section-heading';
  heading.textContent = 'About';

  const manifest = chrome.runtime.getManifest();
  const version = manifest.version ?? 'unknown';
  const name = (manifest.name as string | undefined) ?? 'Paperwall';

  const versionEl = document.createElement('p');
  versionEl.className = 'about-row';
  const versionLabel = document.createElement('span');
  versionLabel.className = 'about-label';
  versionLabel.textContent = 'Version';
  const versionValue = document.createElement('span');
  versionValue.className = 'about-value';
  versionValue.textContent = `${name} v${version}`;
  versionEl.append(versionLabel, versionValue);

  const githubEl = document.createElement('p');
  githubEl.className = 'about-row';
  const githubLink = document.createElement('a');
  githubLink.href = 'https://github.com/kobaru-io/paperwall';
  githubLink.target = '_blank';
  githubLink.rel = 'noopener noreferrer';
  githubLink.textContent = 'GitHub Repository';
  githubLink.className = 'about-link';
  githubEl.append(document.createTextNode('Source: '), githubLink);

  const licenseEl = document.createElement('p');
  licenseEl.className = 'about-row';
  const licenseLabel = document.createElement('span');
  licenseLabel.className = 'about-label';
  licenseLabel.textContent = 'License';
  const licenseValue = document.createElement('span');
  licenseValue.className = 'about-value';
  licenseValue.textContent = 'GPL-3.0';
  licenseEl.append(licenseLabel, licenseValue);

  section.append(heading, versionEl, githubEl, licenseEl);
  return section;
}

// ── Internal Helpers ──────────────────────────────────────────────

function buildActionButton(
  label: string,
  variant: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${variant} settings-action-btn`;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function buildField(
  form: HTMLFormElement,
  labelText: string,
  type: string,
  autocomplete: AutoFill,
): HTMLInputElement {
  const wrap = document.createElement('div');
  wrap.className = 'field-group';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = type;
  input.className = 'field-input';
  input.autocomplete = autocomplete;
  input.required = true;

  wrap.append(label, input);
  form.appendChild(wrap);
  return input;
}
