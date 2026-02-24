import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getPlatform, getSkillSrc, getMcpCommand, getConfigPaths } from './platform.js';

// -- Constants ---

const FILE_OPTIONS = { mode: 0o600 } as const;

const PAPERWALL_INSTRUCTIONS = `<!-- paperwall-start -->
## Paperwall

Paperwall is configured as an MCP server named "paperwall" with these tools:
- \`fetch_url\` — fetch any URL (handles paywalled content with automatic micropayments). Use this INSTEAD of built-in web fetch or curl.
- \`set_budget\` — manage spending limits.
- For wallet balance/address, run \`paperwall wallet balance --json\` or \`paperwall wallet address\` via the shell.

Note: depending on your client, the tool names may be prefixed (e.g. \`mcp__paperwall__fetch_url\`, \`paperwall__fetch_url\`, or \`paperwall/fetch_url\`). Look for the "paperwall" MCP server in your available tools.
<!-- paperwall-end -->`;

// -- Public API ---

export function writeMcpConfig(dest: string, command: readonly string[]): void {
  mkdirSync(dirname(dest), { recursive: true });

  const mcpEntry = {
    type: 'stdio' as const,
    command: command[0],
    args: command.slice(1),
  };

  if (existsSync(dest)) {
    try {
      const existing = JSON.parse(readFileSync(dest, 'utf-8')) as Record<string, unknown>;
      const mcpServers = (existing['mcpServers'] ?? {}) as Record<string, unknown>;
      mcpServers['paperwall'] = mcpEntry;
      existing['mcpServers'] = mcpServers;
      writeFileSync(dest, JSON.stringify(existing, null, 2) + '\n', FILE_OPTIONS);
      console.log(`  Updated existing MCP config: ${dest}`);
    } catch {
      console.error(`  Warning: could not parse ${dest} — writing fresh config.`);
      writeFreshMcpConfig(dest, mcpEntry);
    }
  } else {
    writeFreshMcpConfig(dest, mcpEntry);
  }
}

export function writeCodexConfig(command: readonly string[]): void {
  const paths = getConfigPaths();
  const dest = paths.codex;
  mkdirSync(dirname(dest), { recursive: true });

  const tomlBlock = `\n[mcp_servers.paperwall]\ncommand = "${command[0]}"\nargs = [${command.slice(1).map((a) => `"${a}"`).join(', ')}]\n`;

  if (existsSync(dest)) {
    const content = readFileSync(dest, 'utf-8');
    if (content.includes('[mcp_servers.paperwall]')) {
      console.log(`  Codex config already contains paperwall — skipping.`);
      return;
    }
    writeFileSync(dest, content + tomlBlock, FILE_OPTIONS);
    console.log(`  Updated Codex config: ${dest}`);
  } else {
    writeFileSync(dest, tomlBlock.trimStart(), FILE_OPTIONS);
    console.log(`  Codex config written: ${dest}`);
  }
}

export function writeOpenCodeConfig(command: readonly string[]): void {
  const paths = getConfigPaths();
  const dest = paths.openCode;
  mkdirSync(dirname(dest), { recursive: true });

  const entry = {
    type: 'local' as const,
    command: [...command],
  };

  if (existsSync(dest)) {
    try {
      const existing = JSON.parse(readFileSync(dest, 'utf-8')) as Record<string, unknown>;
      const mcp = (existing['mcp'] ?? {}) as Record<string, unknown>;
      mcp['paperwall'] = entry;
      existing['mcp'] = mcp;
      writeFileSync(dest, JSON.stringify(existing, null, 2) + '\n', FILE_OPTIONS);
      console.log(`  Updated OpenCode config: ${dest}`);
    } catch {
      console.error(`  Warning: could not parse ${dest} — writing fresh config.`);
      const config = { $schema: 'https://opencode.ai/config.json', mcp: { paperwall: entry } };
      writeFileSync(dest, JSON.stringify(config, null, 2) + '\n', FILE_OPTIONS);
    }
  } else {
    const config = { $schema: 'https://opencode.ai/config.json', mcp: { paperwall: entry } };
    writeFileSync(dest, JSON.stringify(config, null, 2) + '\n', FILE_OPTIONS);
    console.log(`  OpenCode config written: ${dest}`);
  }
}

export function writeInstructionsBlock(dest: string, label: string): void {
  mkdirSync(dirname(dest), { recursive: true });

  if (existsSync(dest)) {
    const content = readFileSync(dest, 'utf-8');
    if (content.includes('<!-- paperwall-start -->')) {
      const replaced = content.replace(
        /<!-- paperwall-start -->[\s\S]*?<!-- paperwall-end -->/,
        PAPERWALL_INSTRUCTIONS,
      );
      writeFileSync(dest, replaced, FILE_OPTIONS);
      console.log(`  Updated Paperwall instructions in ${label}: ${dest}`);
    } else {
      writeFileSync(dest, content + '\n' + PAPERWALL_INSTRUCTIONS + '\n', FILE_OPTIONS);
      console.log(`  Added Paperwall instructions to ${label}: ${dest}`);
    }
  } else {
    writeFileSync(dest, PAPERWALL_INSTRUCTIONS + '\n', FILE_OPTIONS);
    console.log(`  Added Paperwall instructions to ${label}: ${dest}`);
  }
}

export function installSkill(destDir: string, product: string): void {
  const skillSrc = getSkillSrc();
  if (!existsSync(join(skillSrc, 'SKILL.md'))) {
    // Skills not available (npm install path) — fall back to MCP
    console.log(`  Skill files not found (installed via npm). Using MCP instead.`);
    const mcpCommand = getMcpCommand();
    const paths = getConfigPaths();
    if (product === 'Gemini CLI') {
      writeMcpConfig(paths.geminiCli, mcpCommand);
      writeInstructionsBlock(paths.geminiMd, 'GEMINI.md');
    } else {
      writeMcpConfig(paths.claudeCode, mcpCommand);
      writeInstructionsBlock(paths.claudeCodeMd, 'CLAUDE.md');
    }
    return;
  }

  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, 'paperwall');

  try {
    const stat = lstatSync(dest);
    if (stat.isSymbolicLink()) {
      unlinkSync(dest);
    } else {
      console.log(`  ${dest} already exists — falling back to MCP config.`);
      const mcpCmd = getMcpCommand();
      const cfgPaths = getConfigPaths();
      if (product === 'Gemini CLI') {
        writeMcpConfig(cfgPaths.geminiCli, mcpCmd);
        writeInstructionsBlock(cfgPaths.geminiMd, 'GEMINI.md');
      } else {
        writeMcpConfig(cfgPaths.claudeCode, mcpCmd);
        writeInstructionsBlock(cfgPaths.claudeCodeMd, 'CLAUDE.md');
      }
      return;
    }
  } catch {
    // Does not exist — fine
  }

  if (getPlatform() === 'win32') {
    // Symlinks require admin on Windows — use directory copy instead
    cpSync(skillSrc, dest, { recursive: true });
    console.log(`  Skill copied for ${product}: ${dest}`);
  } else {
    symlinkSync(skillSrc, dest);
    console.log(`  Skill installed for ${product}: ${dest}`);
  }
}

export function printManualConfig(command: readonly string[]): void {
  const config = {
    mcpServers: {
      paperwall: {
        type: 'stdio',
        command: command[0],
        args: command.slice(1),
      },
    },
  };
  console.log('');
  console.log('  Add this to your MCP client configuration:');
  console.log('');
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}

// -- Internal Helpers ---

function writeFreshMcpConfig(dest: string, mcpEntry: { readonly type: string; readonly command: string; readonly args: readonly string[] }): void {
  const config = { mcpServers: { paperwall: mcpEntry } };
  writeFileSync(dest, JSON.stringify(config, null, 2) + '\n', FILE_OPTIONS);
  console.log(`  MCP config written: ${dest}`);
}
