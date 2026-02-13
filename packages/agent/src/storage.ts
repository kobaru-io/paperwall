import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONFIG_DIR_NAME = '.paperwall';

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
