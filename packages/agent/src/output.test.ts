import { describe, it, expect, vi, afterEach } from 'vitest';
import { outputJson, outputError, bigintReplacer } from './output.js';

describe('outputError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs error JSON, writes to stderr, and exits', () => {
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => {});
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    outputError('test_error', 'Something went wrong', 1);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"ok":false'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Something went wrong'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uses correct exit code', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    outputError('no_wallet', 'No wallet configured', 3);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });
});
