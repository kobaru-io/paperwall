import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptCancelledError } from './password-prompt.js';

// -- Mock @inquirer/password ---

const mockPassword = vi.fn<(config: Record<string, unknown>) => Promise<string>>();

vi.mock('@inquirer/password', () => ({
  default: (config: Record<string, unknown>) => mockPassword(config),
}));

// Must import after mock
const { promptForPassword } = await import('./password-prompt.js');

// -- Tests ---

beforeEach(() => {
  mockPassword.mockReset();
});

describe('promptForPassword', () => {
  // -- Happy Path ---

  it('should return password on successful input', async () => {
    mockPassword.mockResolvedValueOnce('my-secure-pass');

    const result = await promptForPassword();

    expect(result.ok).toBe(true);
    expect(result.password).toBe('my-secure-pass');
  });

  it('should use default message when none provided', async () => {
    mockPassword.mockResolvedValueOnce('test');

    await promptForPassword();

    expect(mockPassword).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Enter password:' }),
    );
  });

  it('should use custom message when provided', async () => {
    mockPassword.mockResolvedValueOnce('test');

    await promptForPassword({ message: 'Wallet password:' });

    expect(mockPassword).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Wallet password:' }),
    );
  });

  it('should enable mask with asterisks', async () => {
    mockPassword.mockResolvedValueOnce('test');

    await promptForPassword();

    expect(mockPassword).toHaveBeenCalledWith(
      expect.objectContaining({ mask: '*' }),
    );
  });

  // -- Cancellation ---

  it('should throw PromptCancelledError when user presses Ctrl+C', async () => {
    const exitError = new Error('User force closed the prompt');
    exitError.name = 'ExitPromptError';
    mockPassword.mockRejectedValueOnce(exitError);

    await expect(promptForPassword()).rejects.toThrow(PromptCancelledError);
  });

  it('should include descriptive message in PromptCancelledError', async () => {
    const exitError = new Error('User force closed the prompt');
    exitError.name = 'ExitPromptError';
    mockPassword.mockRejectedValueOnce(exitError);

    await expect(promptForPassword()).rejects.toThrow('Password prompt cancelled by user');
  });

  it('should re-throw non-ExitPromptError errors', async () => {
    mockPassword.mockRejectedValueOnce(new Error('Unexpected I/O failure'));

    await expect(promptForPassword()).rejects.toThrow('Unexpected I/O failure');
  });

  // -- Validation ---

  it('should pass validate function to inquirer', async () => {
    mockPassword.mockResolvedValueOnce('valid-pass');

    const validate = vi.fn().mockReturnValue(true);
    await promptForPassword({ validate });

    const callArgs = mockPassword.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['validate']).toBeDefined();
  });

  it('should not pass validate when not provided', async () => {
    mockPassword.mockResolvedValueOnce('test');

    await promptForPassword();

    const callArgs = mockPassword.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['validate']).toBeUndefined();
  });

  it('should propagate validation function that returns true', async () => {
    mockPassword.mockImplementationOnce(async (config) => {
      const validateFn = config['validate'] as ((v: string) => string | true) | undefined;
      if (validateFn) {
        const result = validateFn('good-password');
        expect(result).toBe(true);
      }
      return 'good-password';
    });

    const validate = (input: string) => (input.length >= 8 ? true : 'Too short');
    await promptForPassword({ validate });
  });

  it('should propagate validation function that returns error string', async () => {
    mockPassword.mockImplementationOnce(async (config) => {
      const validateFn = config['validate'] as ((v: string) => string | true) | undefined;
      if (validateFn) {
        const result = validateFn('short');
        expect(result).toBe('Too short');
      }
      return 'eventually-valid-password';
    });

    const validate = (input: string) => (input.length >= 8 ? true : 'Too short');
    await promptForPassword({ validate });
  });

  // -- Options ---

  it('should work with all options combined', async () => {
    mockPassword.mockResolvedValueOnce('secure-password');

    const result = await promptForPassword({
      message: 'Custom prompt:',
      validate: () => true,
    });

    expect(result.ok).toBe(true);
    expect(result.password).toBe('secure-password');
  });
});

// -- Error Classes ---

describe('PromptCancelledError', () => {
  it('should have correct name and message', () => {
    const error = new PromptCancelledError();
    expect(error.name).toBe('PromptCancelledError');
    expect(error.message).toBe('Password prompt cancelled by user');
    expect(error).toBeInstanceOf(Error);
  });
});
