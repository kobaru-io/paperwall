import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONFIG_DIR_NAME = '.paperwall';
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;

export function getConfigDir(): string {
  const home = os.homedir();
  const configDir = path.join(home, CONFIG_DIR_NAME);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { mode: 0o700, recursive: true });
  }

  return configDir;
}

export function readJsonFile<T>(filename: string): T | null {
  const filePath = path.join(getConfigDir(), filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

export function writeJsonFile(filename: string, data: unknown): void {
  const filePath = path.join(getConfigDir(), filename);
  const content = JSON.stringify(data, null, 2);

  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

export function appendJsonlFile(filename: string, entry: unknown): void {
  const filePath = path.join(getConfigDir(), filename);
  const line = JSON.stringify(entry) + '\n';

  fs.appendFileSync(filePath, line, { mode: 0o600 });
}

export function readJsonlFile<T>(filename: string): T[] {
  const filePath = path.join(getConfigDir(), filename);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l: string) => l.trim().length > 0);

  return lines.map((l: string) => JSON.parse(l) as T);
}

/**
 * Acquire a file-system lock (mkdir-based, atomic on all platforms).
 * Returns a release function. Throws after timeout.
 */
export async function acquireLock(name: string): Promise<() => void> {
  const lockDir = path.join(getConfigDir(), `${name}.lock`);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lockDir);
      return () => {
        try {
          fs.rmdirSync(lockDir);
        } catch {
          // Lock directory already removed
        }
      };
    } catch {
      // Lock held by another process — wait and retry
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  // Stale lock detection: if lock dir is older than timeout, remove it
  try {
    const stats = fs.statSync(lockDir);
    if (Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS) {
      fs.rmdirSync(lockDir);
      // Retry once
      fs.mkdirSync(lockDir);
      return () => {
        try {
          fs.rmdirSync(lockDir);
        } catch {
          // Already removed
        }
      };
    }
  } catch {
    // Lock was released between our check — try one more time
    try {
      fs.mkdirSync(lockDir);
      return () => {
        try {
          fs.rmdirSync(lockDir);
        } catch {
          // Already removed
        }
      };
    } catch {
      // Give up
    }
  }

  throw new Error(`Failed to acquire lock "${name}" within ${LOCK_TIMEOUT_MS}ms`);
}
