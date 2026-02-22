import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mutable mock state
let mockPlatform = 'linux';
let mockHomedir = '/home/testuser';
let mockSkillSrc = '/fake/skills/paperwall';
let mockCommandExists = false;

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
    if (mockCommandExists) return Buffer.from('/usr/bin/paperwall');
    throw new Error('not found');
  }),
}));

// We need to mock getSkillSrc since it uses import.meta.url
vi.mock('./platform.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./platform.js')>();
  return {
    ...actual,
    getSkillSrc: () => mockSkillSrc,
  };
});

describe('config-writers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-cw-test-'));
    mockPlatform = 'linux';
    mockHomedir = tmpDir;
    mockSkillSrc = '/fake/skills/paperwall';
    mockCommandExists = false;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('installSkill', () => {
    it('should fall back to MCP when skill source has no SKILL.md', async () => {
      // mockSkillSrc points to a dir without SKILL.md — should fall back to MCP
      const { installSkill } = await import('./config-writers.js');
      const destDir = path.join(tmpDir, '.claude', 'skills');

      installSkill(destDir, 'Claude Code');

      // Should have written MCP config instead
      const mcpPath = path.join(tmpDir, '.claude', 'mcp.json');
      expect(fs.existsSync(mcpPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as {
        mcpServers: { paperwall: { type: string } };
      };
      expect(config.mcpServers.paperwall.type).toBe('stdio');
    });

    it('should fall back to Gemini MCP when skill source missing for Gemini CLI', async () => {
      const { installSkill } = await import('./config-writers.js');
      const destDir = path.join(tmpDir, '.gemini', 'skills');

      installSkill(destDir, 'Gemini CLI');

      const mcpPath = path.join(tmpDir, '.gemini', 'settings.json');
      expect(fs.existsSync(mcpPath)).toBe(true);
    });

    it('should create symlink when SKILL.md exists on Unix', async () => {
      // Create a real skill source directory with SKILL.md
      const skillSrc = path.join(tmpDir, 'skill-src');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# Skill');
      mockSkillSrc = skillSrc;

      const { installSkill } = await import('./config-writers.js');
      const destDir = path.join(tmpDir, '.claude', 'skills');

      installSkill(destDir, 'Claude Code');

      const dest = path.join(destDir, 'paperwall');
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(dest)).toBe(skillSrc);
    });

    it('should replace existing symlink', async () => {
      const skillSrc = path.join(tmpDir, 'skill-src');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# Skill');
      mockSkillSrc = skillSrc;

      const destDir = path.join(tmpDir, '.claude', 'skills');
      const dest = path.join(destDir, 'paperwall');
      fs.mkdirSync(destDir, { recursive: true });
      fs.symlinkSync('/old/path', dest);

      const { installSkill } = await import('./config-writers.js');
      installSkill(destDir, 'Claude Code');

      expect(fs.readlinkSync(dest)).toBe(skillSrc);
    });

    it('should fall back to MCP when destination is a regular directory', async () => {
      const skillSrc = path.join(tmpDir, 'skill-src');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# Skill');
      mockSkillSrc = skillSrc;

      const destDir = path.join(tmpDir, '.claude', 'skills');
      const dest = path.join(destDir, 'paperwall');
      fs.mkdirSync(dest, { recursive: true });

      const { installSkill } = await import('./config-writers.js');
      installSkill(destDir, 'Claude Code');

      // Should have fallen back to MCP config
      const mcpPath = path.join(tmpDir, '.claude', 'mcp.json');
      expect(fs.existsSync(mcpPath)).toBe(true);
    });

    it('should copy directory on Windows instead of symlink', async () => {
      mockPlatform = 'win32';

      const skillSrc = path.join(tmpDir, 'skill-src');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# Skill');
      fs.writeFileSync(path.join(skillSrc, 'extra.txt'), 'data');
      mockSkillSrc = skillSrc;

      const { installSkill } = await import('./config-writers.js');
      const destDir = path.join(tmpDir, '.claude', 'skills');

      installSkill(destDir, 'Claude Code');

      const dest = path.join(destDir, 'paperwall');
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
      expect(fs.existsSync(path.join(dest, 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'extra.txt'))).toBe(true);
    });
  });

  describe('writeMcpConfig', () => {
    it('should write fresh config on corrupted JSON', async () => {
      const { writeMcpConfig } = await import('./config-writers.js');
      const dest = path.join(tmpDir, 'mcp.json');
      fs.writeFileSync(dest, 'not valid json!!!');

      writeMcpConfig(dest, ['paperwall', 'mcp']);

      const config = JSON.parse(fs.readFileSync(dest, 'utf-8')) as {
        mcpServers: { paperwall: { type: string } };
      };
      expect(config.mcpServers.paperwall.type).toBe('stdio');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('could not parse'),
      );
    });
  });
});
