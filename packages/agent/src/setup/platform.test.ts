import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Must use vi.mock for ESM modules
let mockPlatform = 'linux';
let mockHomedir = '/home/testuser';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: () => mockPlatform,
    homedir: () => mockHomedir,
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockImplementation(() => {
    throw new Error('not found');
  }),
}));

describe('platform', () => {
  beforeEach(() => {
    mockPlatform = 'linux';
    mockHomedir = '/home/testuser';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConfigPaths', () => {
    it('should return Linux paths by default', async () => {
      const { getConfigPaths } = await import('./platform.js');
      const paths = getConfigPaths();

      expect(paths.claudeCode).toBe('/home/testuser/.claude/mcp.json');
      expect(paths.cursor).toBe('/home/testuser/.cursor/mcp.json');
      expect(paths.windsurf).toBe('/home/testuser/.codeium/windsurf/mcp_config.json');
      expect(paths.claudeDesktop).toBe('/home/testuser/.config/Claude/claude_desktop_config.json');
      expect(paths.openCode).toBe('/home/testuser/.config/opencode/opencode.json');
      expect(paths.antigravity).toBe('/home/testuser/.gemini/antigravity/mcp_config.json');
      expect(paths.wallet).toBe('/home/testuser/.paperwall/wallet.json');
    });

    it('should return macOS paths', async () => {
      mockPlatform = 'darwin';

      const { getConfigPaths } = await import('./platform.js');
      const paths = getConfigPaths();

      expect(paths.cursor).toBe('/home/testuser/.cursor/mcp.json');
      expect(paths.claudeDesktop).toBe('/home/testuser/Library/Application Support/Claude/claude_desktop_config.json');
      expect(paths.openCode).toBe('/home/testuser/.config/opencode/opencode.json');
    });

    it('should return Windows paths with %APPDATA%', async () => {
      mockPlatform = 'win32';

      const originalAppData = process.env['APPDATA'];
      process.env['APPDATA'] = 'C:\\Users\\testuser\\AppData\\Roaming';

      try {
        const { getConfigPaths } = await import('./platform.js');
        const paths = getConfigPaths();

        expect(paths.cursor).toContain('AppData');
        expect(paths.cursor).toContain('Cursor');
        expect(paths.windsurf).toContain('Codeium');
        expect(paths.claudeDesktop).toContain('Claude');
        expect(paths.openCode).toContain('opencode');
        expect(paths.antigravity).toContain('gemini');

        // Home-based paths stay the same
        expect(paths.claudeCode).toBe('/home/testuser/.claude/mcp.json');
        expect(paths.wallet).toBe('/home/testuser/.paperwall/wallet.json');
      } finally {
        if (originalAppData === undefined) {
          delete process.env['APPDATA'];
        } else {
          process.env['APPDATA'] = originalAppData;
        }
      }
    });
  });

  describe('getAppDataDir', () => {
    it('should return ~/.config on Linux', async () => {
      const { getAppDataDir } = await import('./platform.js');
      expect(getAppDataDir()).toBe('/home/testuser/.config');
    });

    it('should return ~/Library/Application Support on macOS', async () => {
      mockPlatform = 'darwin';

      const { getAppDataDir } = await import('./platform.js');
      expect(getAppDataDir()).toBe('/home/testuser/Library/Application Support');
    });

    it('should return %APPDATA% on Windows', async () => {
      mockPlatform = 'win32';

      const originalAppData = process.env['APPDATA'];
      process.env['APPDATA'] = 'C:\\Users\\testuser\\AppData\\Roaming';

      try {
        const { getAppDataDir } = await import('./platform.js');
        expect(getAppDataDir()).toBe('C:\\Users\\testuser\\AppData\\Roaming');
      } finally {
        if (originalAppData === undefined) {
          delete process.env['APPDATA'];
        } else {
          process.env['APPDATA'] = originalAppData;
        }
      }
    });
  });

  describe('commandExists', () => {
    it('should use "command -v" on Linux/macOS', async () => {
      const { execFileSync } = await import('node:child_process');
      (execFileSync as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('/usr/bin/node'));

      const { commandExists } = await import('./platform.js');
      expect(commandExists('node')).toBe(true);
      expect(execFileSync).toHaveBeenCalledWith('sh', ['-c', 'command -v "$1"', '--', 'node'], { stdio: 'pipe' });
    });

    it('should use "where" on Windows', async () => {
      mockPlatform = 'win32';

      const { execFileSync } = await import('node:child_process');
      (execFileSync as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('C:\\node.exe'));

      const { commandExists } = await import('./platform.js');
      expect(commandExists('node')).toBe(true);
      expect(execFileSync).toHaveBeenCalledWith('where', ['node'], { stdio: 'pipe' });
    });

    it('should return false when command not found', async () => {
      const { execFileSync } = await import('node:child_process');
      (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('not found');
      });

      const { commandExists } = await import('./platform.js');
      expect(commandExists('nonexistent')).toBe(false);
    });
  });

  describe('getMcpCommand', () => {
    it('should use paperwall if available on PATH', async () => {
      const { execFileSync } = await import('node:child_process');
      (execFileSync as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('/usr/local/bin/paperwall'));

      const { getMcpCommand } = await import('./platform.js');
      expect(getMcpCommand()).toEqual(['paperwall', 'mcp']);
    });

    it('should fall back to npx when not on PATH and no local cli.js', async () => {
      const { execFileSync } = await import('node:child_process');
      (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('not found');
      });

      const { getMcpCommand } = await import('./platform.js');
      const cmd = getMcpCommand();
      expect(cmd[cmd.length - 1]).toBe('mcp');
    });
  });
});
