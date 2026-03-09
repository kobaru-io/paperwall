/**
 * Tests the throw behavior of the local `copyFile` function in build.ts.
 *
 * `copyFile` is not exported, so we cannot import it directly. Instead, we
 * spawn a child process that runs a minimal inline script which replicates the
 * exact body of `copyFile` from build.ts and calls it with a non-existent path.
 * This verifies:
 *   1. The function throws an Error when the source file does not exist.
 *   2. The error message includes the missing file path.
 *
 * We chose this approach (child_process + inline script) rather than a full
 * `tsx build.ts` run because running the actual build script requires esbuild
 * entry-point source files and would conflate esbuild failures with copyFile
 * failures. The inline script isolates only the copyFile logic.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The inline Node.js script replicates the `copyFile` body from build.ts
 * verbatim and calls it with a path that does not exist so the throw path is
 * exercised. The script is run with `node --input-type=commonjs` so it needs
 * no transpilation and has zero external dependencies.
 */
const COPY_FILE_THROW_SCRIPT = `
// SYNC: mirrors build.ts copyFile() lines 69-75 — update both if changing
const fs = require('fs');

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    throw new Error('Build error: required source file not found: ' + src);
  }
}

const missingPath = '/tmp/paperwall-test-does-not-exist-' + Date.now() + '.json';
try {
  // TODO(review): Replace fixed dest path with os.tmpdir()-based unique path for safe parallel execution - ring:security-reviewer, 2026-03-09, Severity: Low
  copyFile(missingPath, '/tmp/paperwall-test-dest.json');
  process.stderr.write('ERROR: copyFile did not throw\\n');
  process.exit(2);
} catch (e) {
  process.stdout.write(e.message + '\\n');
  if (e instanceof Error && e.message.includes(missingPath)) {
    process.exit(0);
  } else {
    process.stderr.write('ERROR: unexpected error message: ' + e.message + '\\n');
    process.exit(3);
  }
}
`;

// TODO(review): Outer describe title "throw behavior" overlaps with inner describe title - rename inner to "when source does not exist" - ring:test-reviewer, 2026-03-09, Severity: Low
describe('build.ts copyFile throw behavior', () => {
  describe('copyFile() throw behavior', () => {
    let throwResult = {} as ReturnType<typeof spawnSync>;

    beforeAll(() => {
      throwResult = spawnSync(process.execPath, ['--input-type=commonjs'], {
        input: COPY_FILE_THROW_SCRIPT,
        encoding: 'utf-8',
        timeout: 10_000,
      });
      if (throwResult.status === undefined && throwResult.signal === undefined) {
        throw new Error(`beforeAll: spawnSync failed to run: ${JSON.stringify(throwResult.error)}`);
      }
    });

    it('exits with code 0 after catching the throw', () => {
      expect(throwResult.signal).toBeNull();
      expect(throwResult.status).toBe(0);
    });

    it('error message contains the required prefix and the missing file path', () => {
      const stdout = throwResult.stdout ?? '';
      expect(stdout).toMatch(/Build error: required source file not found:/);
      expect(stdout).toMatch(/paperwall-test-does-not-exist-/);
    });
  });

  it('does NOT throw when the source file exists', () => {
    // Create a real temporary file so the "file exists" branch is exercised
    // (confirms copyFile only throws for missing files, not present ones).
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-copyfile-'));
    const srcFile = path.join(tmpDir, 'source.txt');
    const destFile = path.join(tmpDir, 'dest.txt');
    fs.writeFileSync(srcFile, 'hello');

    // FIXME(nitpick): Add SYNC comment here matching the one on COPY_FILE_THROW_SCRIPT - ring:code-reviewer, 2026-03-09, Severity: Cosmetic
    const scriptWithExistingFile = `
const fs = require('fs');

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    throw new Error('Build error: required source file not found: ' + src);
  }
}

try {
  copyFile(${JSON.stringify(srcFile)}, ${JSON.stringify(destFile)});
  process.exit(0);
} catch (e) {
  process.stderr.write('Unexpected throw: ' + e.message + '\\n');
  process.exit(1);
}
`;

    // TODO(review): Declare result with const inside try block instead of let hoisted outside - ring:business-logic-reviewer, 2026-03-09, Severity: Low
    let result: ReturnType<typeof spawnSync>;
    try {
      result = spawnSync(
        process.execPath,
        ['--input-type=commonjs'],
        {
          input: scriptWithExistingFile,
          encoding: 'utf-8',
          timeout: 10_000,
        }
      );

      expect(result.signal).toBeNull();  // surfaces kill reason if child was terminated
      expect(result.status).toBe(0);
      expect(fs.existsSync(destFile)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
