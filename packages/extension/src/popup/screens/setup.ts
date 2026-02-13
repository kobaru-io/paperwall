// ── Setup Screen ────────────────────────────────────────────────────
// Displayed when no wallet exists. Collects password to create wallet.

export function renderSetup(
  container: HTMLElement,
  onComplete: (address: string) => void,
): void {
  container.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Create Wallet';
  heading.className = 'screen-title';

  const description = document.createElement('p');
  description.textContent =
    'Set a password to encrypt your wallet. You will need this password to unlock your wallet.';
  description.className = 'screen-description';

  // Password field
  const passwordLabel = document.createElement('label');
  passwordLabel.setAttribute('for', 'pw-setup-password');
  passwordLabel.textContent = 'Password';
  passwordLabel.className = 'field-label';

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.id = 'pw-setup-password';
  passwordInput.placeholder = 'Enter password';
  passwordInput.className = 'field-input';
  passwordInput.autocomplete = 'new-password';
  passwordInput.setAttribute('aria-required', 'true');

  // Confirm password field
  const confirmLabel = document.createElement('label');
  confirmLabel.setAttribute('for', 'pw-setup-confirm');
  confirmLabel.textContent = 'Confirm Password';
  confirmLabel.className = 'field-label';

  const confirmInput = document.createElement('input');
  confirmInput.type = 'password';
  confirmInput.id = 'pw-setup-confirm';
  confirmInput.placeholder = 'Confirm password';
  confirmInput.className = 'field-input';
  confirmInput.autocomplete = 'new-password';
  confirmInput.setAttribute('aria-required', 'true');

  // Error display
  const errorDisplay = document.createElement('p');
  errorDisplay.className = 'field-error';
  errorDisplay.setAttribute('role', 'alert');
  errorDisplay.setAttribute('aria-live', 'polite');

  // Submit button
  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.textContent = 'Create Wallet';
  submitButton.className = 'btn btn-primary';

  // Loading state
  function setLoading(loading: boolean): void {
    submitButton.disabled = loading;
    submitButton.textContent = loading ? 'Creating...' : 'Create Wallet';
    passwordInput.disabled = loading;
    confirmInput.disabled = loading;
  }

  function showError(message: string): void {
    errorDisplay.textContent = message;
    passwordInput.setAttribute('aria-describedby', 'pw-setup-error');
    errorDisplay.id = 'pw-setup-error';
  }

  function clearError(): void {
    errorDisplay.textContent = '';
  }

  async function handleSubmit(): Promise<void> {
    clearError();

    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!password) {
      showError('Password is required.');
      passwordInput.focus();
      return;
    }

    // Password strength validation
    if (password.length < 12) {
      showError('Password must be at least 12 characters.');
      passwordInput.focus();
      return;
    }

    // Require at least 3 of 4 character categories
    const categories = [
      /[a-z]/.test(password), // lowercase
      /[A-Z]/.test(password), // uppercase
      /\d/.test(password), // digit
      /[^a-zA-Z\d]/.test(password), // special character
    ].filter(Boolean).length;

    if (categories < 3) {
      showError(
        'Password must include at least 3 of: lowercase, uppercase, numbers, special characters.',
      );
      passwordInput.focus();
      return;
    }

    if (password !== confirm) {
      showError('Passwords do not match.');
      confirmInput.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_WALLET',
        password,
      });

      if (response.success) {
        onComplete(response.address as string);
      } else {
        showError(
          (response.error as string) || 'Failed to create wallet.',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  submitButton.addEventListener('click', handleSubmit);

  // Enter key submits form
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  }

  passwordInput.addEventListener('keydown', handleKeydown);
  confirmInput.addEventListener('keydown', handleKeydown);

  container.append(
    heading,
    description,
    passwordLabel,
    passwordInput,
    confirmLabel,
    confirmInput,
    errorDisplay,
    submitButton,
  );

  passwordInput.focus();
}
