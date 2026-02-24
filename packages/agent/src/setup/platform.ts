import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// -- Types ---

export type Platform = 'win32' | 'darwin' | 'linux';

export interface ConfigPaths {
  readonly claudeCode: string;
  readonly claudeCodeMd: string;
  readonly cursor: string;
  readonly windsurf: string;
  readonly codex: string;
  readonly codexAgentsMd: string;
  readonly openCode: string;
  readonly cursorRules: string;
  readonly windsurfRules: string;
  readonly claudeDesktop: string;
  readonly geminiCli: string;
  readonly geminiMd: string;
  readonly antigravity: string;
  readonly geminiSkills: string;
  readonly claudeSkills: string;
  readonly wallet: string;
}

// -- Public API ---

export function getPlatform(): Platform {
  const p = platform();
  if (p === 'win32' || p === 'darwin') return p;
  return 'linux'; // Default to Linux-style paths for all Unix-like platforms
}

export function getHome(): string {
  return homedir();
}

/**
 * Returns the platform-specific application data directory.
 * - Windows: %APPDATA% (e.g. C:\Users\user\AppData\Roaming)
 * - macOS: ~/Library/Application Support
 * - Linux: ~/.config
 */
export function getAppDataDir(): string {
  const p = getPlatform();
  if (p === 'win32') return process.env['APPDATA'] ?? join(getHome(), 'AppData', 'Roaming');
  if (p === 'darwin') return join(getHome(), 'Library', 'Application Support');
  return join(getHome(), '.config');
}

/**
 * Returns all AI client config file paths for the current platform.
 */
export function getConfigPaths(): ConfigPaths {
  const home = getHome();
  const appData = getAppDataDir();
  const isWin = getPlatform() === 'win32';

  return {
    claudeCode: join(home, '.claude', 'mcp.json'),
    claudeCodeMd: join(home, '.claude', 'CLAUDE.md'),
    cursor: isWin
      ? join(appData, 'Cursor', 'mcp.json')
      : join(home, '.cursor', 'mcp.json'),
    windsurf: isWin
      ? join(appData, 'Codeium', 'windsurf', 'mcp_config.json')
      : join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    codex: join(home, '.codex', 'config.toml'),
    codexAgentsMd: join(home, '.codex', 'AGENTS.md'),
    openCode: isWin
      ? join(appData, 'opencode', 'opencode.json')
      : join(home, '.config', 'opencode', 'opencode.json'),
    cursorRules: join(home, '.cursor', 'rules', 'paperwall.mdc'),
    windsurfRules: join(home, '.windsurf', 'rules', 'paperwall.md'),
    claudeDesktop: join(appData, 'Claude', 'claude_desktop_config.json'),
    geminiCli: join(home, '.gemini', 'settings.json'),
    geminiMd: join(home, '.gemini', 'GEMINI.md'),
    antigravity: isWin
      ? join(appData, 'gemini', 'antigravity', 'mcp_config.json')
      : join(home, '.gemini', 'antigravity', 'mcp_config.json'),
    geminiSkills: join(home, '.gemini', 'skills'),
    claudeSkills: join(home, '.claude', 'skills'),
    wallet: join(home, '.paperwall', 'wallet.json'),
  };
}

/**
 * Returns the path to the skills/paperwall directory relative to this package.
 */
export function getSkillSrc(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), '..', '..', 'skills', 'paperwall');
}

/**
 * Returns the path to dist/cli.js relative to this package.
 */
export function getCliPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), '..', '..', 'dist', 'cli.js');
}

/**
 * Checks if a command is available on PATH (cross-platform).
 */
export function commandExists(cmd: string): boolean {
  try {
    if (getPlatform() === 'win32') {
      execFileSync('where', [cmd], { stdio: 'pipe' });
    } else {
      execFileSync('sh', ['-c', 'command -v "$1"', '--', cmd], { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the MCP server command for config files.
 * Priority: global `paperwall` > local `node dist/cli.js` > `npx @kobaru/paperwall`
 */
export function getMcpCommand(): readonly string[] {
  if (commandExists('paperwall')) {
    return ['paperwall', 'mcp'];
  }
  const cliPath = getCliPath();
  if (existsSync(cliPath)) {
    return ['node', cliPath, 'mcp'];
  }
  return ['npx', '@kobaru/paperwall', 'mcp'];
}
