import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock inquirer modules before importing setup
vi.mock('@inquirer/select', () => ({ default: vi.fn() }));
vi.mock('@inquirer/input', () => ({ default: vi.fn() }));
vi.mock('@inquirer/password', () => ({ default: vi.fn() }));
vi.mock('@inquirer/confirm', () => ({ default: vi.fn() }));

// Mock wallet and budget to avoid real crypto ops
vi.mock('./wallet.js', () => ({
  createWallet: vi.fn(),
  importWallet: vi.fn(),
  getKeyStorage: vi.fn().mockReturnValue('file'),
}));

vi.mock('./budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./budget.js')>();
  return {
    ...actual,
    setBudget: vi.fn().mockReturnValue({
      perRequestMax: '0.10',
      dailyMax: '1.00',
      totalMax: '10.00',
    }),
  };
});

vi.mock('./storage.js', () => ({
  readJsonFile: vi.fn().mockReturnValue({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    networkId: 'eip155:324705682',
    encryptionMode: 'machine-bound',
  }),
  getConfigDir: vi.fn().mockReturnValue('/tmp/test/.paperwall'),
  readJsonlFile: vi.fn().mockReturnValue([]),
  writeJsonFile: vi.fn(),
  appendJsonlFile: vi.fn(),
}));

// Mock child_process to control commandExists behavior
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn().mockImplementation(() => {
    throw new Error('command not found');
  }),
}));

describe('setup', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-setup-test-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('runSetup', () => {
    it('should skip all stages when all skip flags are set', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      const { runSetup } = await import('./setup.js');

      await runSetup({ skipAi: true, skipWallet: true, skipBudget: true });

      expect(select).not.toHaveBeenCalled();
    });

    it('should run AI client stage when not skipped', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('manual');

      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false); // skip budget

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true });

      expect(select).toHaveBeenCalledTimes(1);
      expect(select).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Choose your AI client integration:',
      }));
    });
  });

  describe('AI client integration — MCP configs', () => {
    it('should write fresh Claude Code MCP config', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('claude-code');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const configPath = path.join(tmpDir, '.claude', 'mcp.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        mcpServers: { paperwall: { type: string; command: string; args: string[] } };
      };
      expect(config.mcpServers.paperwall.type).toBe('stdio');
      expect(config.mcpServers.paperwall.args).toContain('mcp');

      // Should also write CLAUDE.md
      const claudeMd = path.join(tmpDir, '.claude', 'CLAUDE.md');
      expect(fs.existsSync(claudeMd)).toBe(true);
      const content = fs.readFileSync(claudeMd, 'utf-8');
      expect(content).toContain('<!-- paperwall-start -->');
      expect(content).toContain('fetch_url');
    });

    it('should merge into existing MCP config', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('cursor');

      // Create existing config (cursor uses ~/.cursor on Linux)
      const configDir = path.join(tmpDir, '.cursor');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'mcp.json');
      fs.writeFileSync(configPath, JSON.stringify({
        mcpServers: { other: { type: 'stdio', command: 'other', args: [] } },
      }, null, 2));

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(config.mcpServers['other']).toBeDefined();
      expect(config.mcpServers['paperwall']).toBeDefined();
    });

    it('should write Codex TOML config', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('codex');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const configPath = path.join(tmpDir, '.codex', 'config.toml');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('[mcp_servers.paperwall]');

      const agentsMd = path.join(tmpDir, '.codex', 'AGENTS.md');
      expect(fs.existsSync(agentsMd)).toBe(true);
    });

    it('should skip Codex config if paperwall already present', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('codex');

      const configDir = path.join(tmpDir, '.codex');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'config.toml'),
        '[mcp_servers.paperwall]\ncommand = "old"\n');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const content = fs.readFileSync(path.join(configDir, 'config.toml'), 'utf-8');
      const matches = content.match(/\[mcp_servers\.paperwall\]/g);
      expect(matches?.length).toBe(1);
    });

    it('should write OpenCode config', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('opencode');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const configPath = path.join(tmpDir, '.config', 'opencode', 'opencode.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        $schema: string;
        mcp: { paperwall: { type: string } };
      };
      expect(config.$schema).toBe('https://opencode.ai/config.json');
      expect(config.mcp.paperwall.type).toBe('local');
    });

    it('should write Gemini CLI config with GEMINI.md', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('gemini-cli');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const configPath = path.join(tmpDir, '.gemini', 'settings.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const geminiMd = path.join(tmpDir, '.gemini', 'GEMINI.md');
      expect(fs.existsSync(geminiMd)).toBe(true);
      expect(fs.readFileSync(geminiMd, 'utf-8')).toContain('<!-- paperwall-start -->');
    });

    it('should print manual config without writing files', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('manual');

      const logs: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const jsonOutput = logs.find((l) => l.includes('mcpServers'));
      expect(jsonOutput).toBeDefined();
      const config = JSON.parse(jsonOutput!) as { mcpServers: { paperwall: unknown } };
      expect(config.mcpServers.paperwall).toBeDefined();
    });
  });

  describe('AI client integration — instructions block', () => {
    it('should replace existing instructions block', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('claude-code');

      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'),
        '# My Project\n\n<!-- paperwall-start -->\nOLD CONTENT\n<!-- paperwall-end -->\n\n# Other stuff\n');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const content = fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('fetch_url');
      expect(content).not.toContain('OLD CONTENT');
      expect(content).toContain('# My Project');
      expect(content).toContain('# Other stuff');
    });

    it('should append instructions block to existing file without markers', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('claude-code');

      const claudeDir = path.join(tmpDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# My Project\n');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipWallet: true, skipBudget: true });

      const content = fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('# My Project');
      expect(content).toContain('<!-- paperwall-start -->');
    });
  });

  describe('wallet setup', () => {
    it('should skip wallet setup when wallet exists', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false); // skip budget

      const paperwallDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(paperwallDir, { recursive: true });
      fs.writeFileSync(path.join(paperwallDir, 'wallet.json'), '{}');

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true });

      expect(select).not.toHaveBeenCalled();
    });

    it('should create wallet when user chooses create', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('create');

      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false);

      const { createWallet } = await import('./wallet.js');
      (createWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        network: 'eip155:324705682',
        storagePath: '/tmp/test/.paperwall/wallet.json',
      });

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true });

      expect(createWallet).toHaveBeenCalledWith({});
    });

    it('should import wallet when user confirms risks', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('import');

      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(true);
      confirmFn.mockResolvedValueOnce(false);

      const passwordFn = (await import('@inquirer/password')).default as ReturnType<typeof vi.fn>;
      passwordFn.mockResolvedValueOnce('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');

      const { importWallet } = await import('./wallet.js');
      (importWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        network: 'eip155:324705682',
        storagePath: '/tmp/test/.paperwall/wallet.json',
      });

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true });

      expect(importWallet).toHaveBeenCalledWith(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        {},
      );
    });

    it('should cancel import when user declines risk warning', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('import');

      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false);
      confirmFn.mockResolvedValueOnce(false);

      const { importWallet } = await import('./wallet.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true });

      expect(importWallet).not.toHaveBeenCalled();
    });

    it('should force wallet setup even when wallet exists', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('create');

      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false);

      const paperwallDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(paperwallDir, { recursive: true });
      fs.writeFileSync(path.join(paperwallDir, 'wallet.json'), '{}');

      const { createWallet } = await import('./wallet.js');
      (createWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        network: 'eip155:324705682',
        storagePath: '/tmp/test/.paperwall/wallet.json',
      });

      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true, force: true });

      expect(createWallet).toHaveBeenCalled();
    });

    it('should skip wallet when user chooses skip', async () => {
      const select = (await import('@inquirer/select')).default as ReturnType<typeof vi.fn>;
      select.mockResolvedValueOnce('skip');

      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false);

      const { createWallet, importWallet } = await import('./wallet.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true });

      expect(createWallet).not.toHaveBeenCalled();
      expect(importWallet).not.toHaveBeenCalled();
    });
  });

  describe('budget setup', () => {
    it('should set budget when user provides values', async () => {
      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(true);

      const inputFn = (await import('@inquirer/input')).default as ReturnType<typeof vi.fn>;
      inputFn.mockResolvedValueOnce('0.10');
      inputFn.mockResolvedValueOnce('1.00');
      inputFn.mockResolvedValueOnce('10.00');

      const { setBudget } = await import('./budget.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true, skipWallet: true });

      expect(setBudget).toHaveBeenCalledWith({
        perRequestMax: '0.10',
        dailyMax: '1.00',
        totalMax: '10.00',
      });
    });

    it('should skip budget when user declines', async () => {
      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(false);

      const { setBudget } = await import('./budget.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true, skipWallet: true });

      expect(setBudget).not.toHaveBeenCalled();
    });

    it('should skip budget when all inputs are empty', async () => {
      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(true);

      const inputFn = (await import('@inquirer/input')).default as ReturnType<typeof vi.fn>;
      inputFn.mockResolvedValueOnce('');
      inputFn.mockResolvedValueOnce('');
      inputFn.mockResolvedValueOnce('');

      const { setBudget } = await import('./budget.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true, skipWallet: true });

      expect(setBudget).not.toHaveBeenCalled();
    });

    it('should reject invalid budget amounts', async () => {
      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(true);

      const inputFn = (await import('@inquirer/input')).default as ReturnType<typeof vi.fn>;
      inputFn.mockResolvedValueOnce('abc');
      inputFn.mockResolvedValueOnce('');
      inputFn.mockResolvedValueOnce('');

      const { setBudget } = await import('./budget.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true, skipWallet: true });

      expect(setBudget).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid amount'),
      );
    });

    it('should set only provided budget fields', async () => {
      const confirmFn = (await import('@inquirer/confirm')).default as ReturnType<typeof vi.fn>;
      confirmFn.mockResolvedValueOnce(true);

      const inputFn = (await import('@inquirer/input')).default as ReturnType<typeof vi.fn>;
      inputFn.mockResolvedValueOnce('0.05');
      inputFn.mockResolvedValueOnce('');
      inputFn.mockResolvedValueOnce('');

      const { setBudget } = await import('./budget.js');
      const { runSetup } = await import('./setup.js');
      await runSetup({ skipAi: true, skipWallet: true });

      expect(setBudget).toHaveBeenCalledWith({ perRequestMax: '0.05' });
    });
  });
});
