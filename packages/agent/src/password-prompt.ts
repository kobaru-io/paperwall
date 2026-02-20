import password from '@inquirer/password';

// -- Types ---

/**
 * Options for password prompting.
 */
export interface PromptOptions {
  /** Custom message shown to the user. Defaults to 'Enter password:'. */
  readonly message?: string;
  /** Optional validation function. Return string on failure (error message), true on success. */
  readonly validate?: (input: string) => string | true;
}

/**
 * Result of a password prompt attempt.
 */
export interface PromptResult {
  readonly ok: true;
  readonly password: string;
}

/**
 * Error when user cancels the prompt (Ctrl+C / ESC).
 */
export class PromptCancelledError extends Error {
  constructor() {
    super('Password prompt cancelled by user');
    this.name = 'PromptCancelledError';
  }
}

// -- Constants ---

const DEFAULT_MESSAGE = 'Enter password:';

// -- Public API ---

/**
 * Prompt user for a password with masked input using @inquirer/password.
 *
 * @param options - Prompt configuration
 * @returns The entered password wrapped in a PromptResult
 * @throws PromptCancelledError if user cancels (Ctrl+C)
 */
export async function promptForPassword(options: PromptOptions = {}): Promise<PromptResult> {
  const message = options.message ?? DEFAULT_MESSAGE;
  const validate = options.validate;

  try {
    const input = await password({
      message,
      mask: '*',
      validate: validate
        ? (value: string) => {
            const result = validate(value);
            return result === true ? true : result;
          }
        : undefined,
    });

    return { ok: true, password: input };
  } catch (error: unknown) {
    // @inquirer/password throws ExitPromptError on Ctrl+C
    if (isExitPromptError(error)) {
      throw new PromptCancelledError();
    }
    throw error;
  }
}

// -- Internal Helpers ---

function isExitPromptError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'ExitPromptError';
  }
  return false;
}
