import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getConfigDir,
  readJsonFile,
  writeJsonFile,
  appendJsonlFile,
  readJsonlFile,
} from './storage.js';

describe('storage', () => {
  let originalHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-test-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getConfigDir', () => {
    it('should return ~/.paperwall/ path', () => {
      const dir = getConfigDir();
      expect(dir).toBe(path.join(tmpDir, '.paperwall'));
    });

    it('should create directory if it does not exist', () => {
      const dir = getConfigDir();
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('should set directory permissions to 0o700', () => {
      const dir = getConfigDir();
      const stats = fs.statSync(dir);
      expect(stats.mode & 0o777).toBe(0o700);
    });

    it('should not fail if directory already exists', () => {
      getConfigDir();
      const dir = getConfigDir();
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('readJsonFile / writeJsonFile', () => {
    it('should write and read JSON round-trip', () => {
      const data = { address: '0x1234', network: 'eip155:324705682' };
      writeJsonFile('test.json', data);
      const result = readJsonFile<typeof data>('test.json');
      expect(result).toEqual(data);
    });

    it('should return null for non-existent file', () => {
      const result = readJsonFile('nonexistent.json');
      expect(result).toBeNull();
    });

    it('should set file permissions to 0o600', () => {
      writeJsonFile('secure.json', { secret: true });
      const filePath = path.join(getConfigDir(), 'secure.json');
      const stats = fs.statSync(filePath);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should overwrite existing file', () => {
      writeJsonFile('test.json', { version: 1 });
      writeJsonFile('test.json', { version: 2 });
      const result = readJsonFile<{ version: number }>('test.json');
      expect(result?.version).toBe(2);
    });
  });

  describe('appendJsonlFile / readJsonlFile', () => {
    it('should append and read single entry', () => {
      const entry = { ts: '2026-01-01', amount: '100' };
      appendJsonlFile('history.jsonl', entry);
      const entries = readJsonlFile<typeof entry>('history.jsonl');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it('should append multiple entries', () => {
      appendJsonlFile('history.jsonl', { id: 1 });
      appendJsonlFile('history.jsonl', { id: 2 });
      appendJsonlFile('history.jsonl', { id: 3 });
      const entries = readJsonlFile<{ id: number }>('history.jsonl');
      expect(entries).toHaveLength(3);
      expect(entries[0]?.id).toBe(1);
      expect(entries[2]?.id).toBe(3);
    });

    it('should return empty array for non-existent file', () => {
      const entries = readJsonlFile('nonexistent.jsonl');
      expect(entries).toEqual([]);
    });

    it('should set file permissions to 0o600', () => {
      appendJsonlFile('log.jsonl', { test: true });
      const filePath = path.join(getConfigDir(), 'log.jsonl');
      const stats = fs.statSync(filePath);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should handle empty lines gracefully', () => {
      appendJsonlFile('data.jsonl', { a: 1 });
      // Manually append an empty line
      const filePath = path.join(getConfigDir(), 'data.jsonl');
      fs.appendFileSync(filePath, '\n');
      appendJsonlFile('data.jsonl', { a: 2 });
      const entries = readJsonlFile<{ a: number }>('data.jsonl');
      expect(entries).toHaveLength(2);
    });
  });
});
