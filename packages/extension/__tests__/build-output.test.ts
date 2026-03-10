import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const distDir = path.resolve(__dirname, '../dist-chrome');
const distFirefoxDir = path.resolve(__dirname, '../dist-firefox');
const buildExists = fs.existsSync(distDir) && fs.existsSync(distFirefoxDir);

describe.skipIf(!buildExists)('Build output manifests', () => {
  const chromeManifestPath = path.join(distDir, 'manifest.json');
  const firefoxManifestPath = path.join(distFirefoxDir, 'manifest.json');

  // TODO(review): Add assertion that dist/manifest.json does NOT contain browser_specific_settings (Chrome silently ignores it, but asserting absence documents the intent) - ring:business-logic-reviewer, 2026-03-09, Severity: Low
  it('Chrome dist/manifest.json exists and is valid JSON', () => {
    expect(fs.existsSync(chromeManifestPath)).toBe(true);
    const raw = fs.readFileSync(chromeManifestPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('Chrome dist/manifest.json has manifest_version === 3', () => {
    const manifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
  });

  it('Chrome dist/manifest.json has background.service_worker === "background.js"', () => {
    const manifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8'));
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe('background.js');
  });

  it('Firefox dist-firefox/manifest.json exists and is valid JSON', () => {
    expect(fs.existsSync(firefoxManifestPath)).toBe(true);
    const raw = fs.readFileSync(firefoxManifestPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('Firefox dist-firefox/manifest.json has manifest_version === 3', () => {
    const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
  });

  it('Firefox dist-firefox/manifest.json has background.scripts containing "background.js"', () => {
    const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));
    expect(manifest.background).toBeDefined();
    expect(Array.isArray(manifest.background.scripts)).toBe(true);
    expect(manifest.background.scripts).toContain('background.js');
    // Dual-field background: Chrome uses service_worker, Firefox uses scripts.
    // Both keys coexist intentionally — each browser ignores the key it doesn't support.
    // TODO(review): research.md citation refers to docs/pre-dev/firefox-extension/research.md - not in packages/extension/, use relative path or inline rationale - ring:business-logic-reviewer, 2026-03-09, Severity: Low
    // See research.md "Critical Issues #2" and web-ext lint (BACKGROUND_SERVICE_WORKER_IGNORED = expected).
    expect(manifest.background.service_worker).toBe('background.js'); // intentionally present — Chrome compat
  });

  it('Firefox dist-firefox/manifest.json has browser_specific_settings.gecko.id === "paperwall@kobaru.io"', () => {
    const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));
    expect(manifest.browser_specific_settings).toBeDefined();
    expect(manifest.browser_specific_settings.gecko).toBeDefined();
    expect(manifest.browser_specific_settings.gecko.id).toBe('paperwall@kobaru.io');
  });

  it('Chrome dist/icons/ directory exists', () => {
    const iconsDir = path.join(distDir, 'icons');
    expect(fs.existsSync(iconsDir)).toBe(true);
    expect(fs.statSync(iconsDir).isDirectory()).toBe(true);
  });

  it('Chrome dist/icons/ contains icon-16.png, icon-32.png, icon-48.png, and icon-128.png', () => {
    const iconsDir = path.join(distDir, 'icons');
    expect(fs.existsSync(path.join(iconsDir, 'icon-16.png'))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, 'icon-32.png'))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, 'icon-48.png'))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, 'icon-128.png'))).toBe(true);
  });

  it('Firefox dist-firefox/icons/ directory exists', () => {
    const iconsDir = path.join(distFirefoxDir, 'icons');
    expect(fs.existsSync(iconsDir)).toBe(true);
    expect(fs.statSync(iconsDir).isDirectory()).toBe(true);
  });

  it('Firefox dist-firefox/icons/ contains icon-16.png, icon-32.png, icon-48.png, and icon-128.png', () => {
    const iconsDir = path.join(distFirefoxDir, 'icons');
    expect(fs.existsSync(path.join(iconsDir, 'icon-16.png'))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, 'icon-32.png'))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, 'icon-48.png'))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, 'icon-128.png'))).toBe(true);
  });

  it('Chrome dist/manifest.json host_permissions includes Base Sepolia RPC', () => {
    const manifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8'));
    expect(manifest.host_permissions).toContain('https://sepolia.base.org/*');
  });

  it('Chrome dist/manifest.json host_permissions includes Base Mainnet RPC', () => {
    const manifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8'));
    expect(manifest.host_permissions).toContain('https://mainnet.base.org/*');
  });

  it('Firefox dist-firefox/manifest.json host_permissions includes Base Sepolia RPC', () => {
    const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));
    expect(manifest.host_permissions).toContain('https://sepolia.base.org/*');
  });

  it('Firefox dist-firefox/manifest.json host_permissions includes Base Mainnet RPC', () => {
    const manifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));
    expect(manifest.host_permissions).toContain('https://mainnet.base.org/*');
  });
});

describe.skipIf(buildExists)('Build output manifests (skipped — artifacts not found)', () => {
  it('skips all assertions — run npm run build first', () => {
    console.warn('Build artifacts not found — run npm run build first');
  });
});
