// ── Unlock Screen ───────────────────────────────────────────────────
// Displayed when wallet exists but is locked. Collects password to unlock.

export function renderUnlock(
  container: HTMLElement,
  onComplete: () => void,
): void {
  container.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Unlock Wallet';
  heading.className = 'screen-title';

  const description = document.createElement('p');
  description.textContent = 'Enter your password to unlock your wallet.';
  description.className = 'screen-description';

  // Password field
  const passwordLabel = document.createElement('label');
  passwordLabel.setAttribute('for', 'pw-unlock-password');
  passwordLabel.textContent = 'Password';
  passwordLabel.className = 'field-label';

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.id = 'pw-unlock-password';
  passwordInput.placeholder = 'Enter password';
  passwordInput.className = 'field-input';
  passwordInput.autocomplete = 'current-password';
  passwordInput.setAttribute('aria-required', 'true');

  // Error display
  const errorDisplay = document.createElement('p');
  errorDisplay.className = 'field-error';
  errorDisplay.setAttribute('role', 'alert');
  errorDisplay.setAttribute('aria-live', 'polite');

  // Submit button
  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.textContent = 'Unlock';
  submitButton.className = 'btn btn-primary';

  function setLoading(loading: boolean): void {
    submitButton.disabled = loading;
    submitButton.textContent = loading ? 'Unlocking...' : 'Unlock';
    passwordInput.disabled = loading;
  }

  function showError(message: string): void {
    errorDisplay.textContent = message;
    errorDisplay.id = 'pw-unlock-error';
    passwordInput.setAttribute('aria-describedby', 'pw-unlock-error');
  }

  function clearError(): void {
    errorDisplay.textContent = '';
  }

  async function handleSubmit(): Promise<void> {
    clearError();

    const password = passwordInput.value;

    if (!password) {
      showError('Password is required.');
      passwordInput.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UNLOCK_WALLET',
        password,
      });

      if (response.success) {
        onComplete();
      } else {
        showError(
          (response.error as string) || 'Failed to unlock wallet.',
        );
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  submitButton.addEventListener('click', handleSubmit);

  passwordInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  });

  container.append(
    heading,
    description,
    passwordLabel,
    passwordInput,
    errorDisplay,
    submitButton,
  );

  passwordInput.focus();
}
