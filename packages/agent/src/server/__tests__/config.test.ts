import { describe, it, expect, afterEach } from 'vitest';
import { resolveServerConfig } from '../config.js';

describe('resolveServerConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('PAPERWALL_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('uses defaults when nothing configured', () => {
    const config = resolveServerConfig({});
    expect(config.port).toBe(4000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.accessKeys).toEqual([]);
  });

  it('CLI args override env vars', () => {
    process.env['PAPERWALL_PORT'] = '8080';
    const config = resolveServerConfig({ port: '3000' });
    expect(config.port).toBe(3000);
  });

  it('env vars override defaults', () => {
    process.env['PAPERWALL_PORT'] = '8080';
    process.env['PAPERWALL_ACCESS_KEYS'] = 'key1,key2';
    const config = resolveServerConfig({});
    expect(config.port).toBe(8080);
    expect(config.accessKeys).toEqual(['key1', 'key2']);
  });

  it('parses network from CLI', () => {
    const config = resolveServerConfig({ network: 'eip155:1187947933' });
    expect(config.network).toBe('eip155:1187947933');
  });
});
