import select from '@inquirer/select';
import input from '@inquirer/input';
import password from '@inquirer/password';
import confirm from '@inquirer/confirm';
import { existsSync } from 'node:fs';
import { createWallet, importWallet, getKeyStorage } from './wallet.js';
import { setBudget, usdcToSmallest } from './budget.js';
import { readJsonFile } from './storage.js';
import { getConfigPaths, getMcpCommand } from './setup/platform.js';
import { writeMcpConfig, writeCodexConfig, writeOpenCodeConfig, writeInstructionsBlock, installSkill, printManualConfig } from './setup/config-writers.js';
import type { WalletFile } from './wallet.js';

// -- Types ---

interface SetupOptions {
  readonly skipWallet?: boolean;
  readonly skipBudget?: boolean;
  readonly skipAi?: boolean;
  readonly force?: boolean;
}

// -- Public API ---

export async function runSetup(options: SetupOptions): Promise<void> {
  console.log('');
  console.log('  paperwall setup');
  console.log('  ───────────────');
  console.log('');

  if (!options.skipAi) {
    await setupAiClient();
  }

  if (!options.skipWallet) {
    await setupWallet(options.force);
  }

  if (!options.skipBudget) {
    await setupBudget();
  }

  console.log('');
  console.log('  ✓ Setup complete!');
  console.log('');
  console.log('  Try it out:');
  console.log('    paperwall wallet balance');
  console.log('    paperwall fetch <url> --max-price 0.05');
  console.log('');
}

// -- AI Client Integration ---

interface AiClient {
  readonly name: string;
  readonly value: string;
  readonly description: string;
}

const AI_CLIENTS: readonly AiClient[] = [
  { name: 'Claude Code',        value: 'claude-code',    description: 'MCP server' },
  { name: 'Cursor',             value: 'cursor',         description: 'MCP server' },
  { name: 'Windsurf',           value: 'windsurf',       description: 'MCP server' },
  { name: 'Codex',              value: 'codex',          description: 'MCP server' },
  { name: 'OpenCode',           value: 'opencode',       description: 'MCP server' },
  { name: 'Claude Desktop',     value: 'claude-desktop', description: 'MCP server' },
  { name: 'Gemini CLI',         value: 'gemini-cli',     description: 'MCP server' },
  { name: 'Antigravity',        value: 'antigravity',    description: 'MCP server' },
  { name: 'Gemini CLI (skill)', value: 'gemini-skill',   description: 'Agent skill' },
  { name: 'Claude Code (skill)', value: 'claude-skill',  description: 'Agent skill' },
  { name: 'Manual / Skip',      value: 'manual',         description: 'Print config' },
];

async function setupAiClient(): Promise<void> {
  const choice = await select({
    message: 'Choose your AI client integration:',
    choices: AI_CLIENTS.map((c) => ({
      name: `${c.name}  (${c.description})`,
      value: c.value,
    })),
  });

  const paths = getConfigPaths();
  const mcpCommand = getMcpCommand();

  switch (choice) {
    case 'claude-code':
      writeMcpConfig(paths.claudeCode, mcpCommand);
      writeInstructionsBlock(paths.claudeCodeMd, 'CLAUDE.md');
      break;
    case 'cursor':
      writeMcpConfig(paths.cursor, mcpCommand);
      break;
    case 'windsurf':
      writeMcpConfig(paths.windsurf, mcpCommand);
      break;
    case 'codex':
      writeCodexConfig(mcpCommand);
      writeInstructionsBlock(paths.codexAgentsMd, 'AGENTS.md');
      break;
    case 'opencode':
      writeOpenCodeConfig(mcpCommand);
      break;
    case 'claude-desktop':
      writeMcpConfig(paths.claudeDesktop, mcpCommand);
      console.log('  Restart Claude Desktop to pick up the new MCP server.');
      break;
    case 'gemini-cli':
      writeMcpConfig(paths.geminiCli, mcpCommand);
      writeInstructionsBlock(paths.geminiMd, 'GEMINI.md');
      break;
    case 'antigravity':
      writeMcpConfig(paths.antigravity, mcpCommand);
      writeInstructionsBlock(paths.geminiMd, 'GEMINI.md');
      break;
    case 'gemini-skill':
      installSkill(paths.geminiSkills, 'Gemini CLI');
      break;
    case 'claude-skill':
      installSkill(paths.claudeSkills, 'Claude Code');
      break;
    case 'manual':
      printManualConfig(mcpCommand);
      break;
  }
}

// -- Wallet Setup ---

async function setupWallet(force?: boolean): Promise<void> {
  const paths = getConfigPaths();
  if (existsSync(paths.wallet) && !force) {
    console.log(`  Wallet already configured at ${paths.wallet} — skipping.`);
    return;
  }

  console.log('');
  const choice = await select({
    message: 'Wallet setup — a wallet is required for micropayments:',
    choices: [
      { name: 'Create new wallet (recommended)', value: 'create', description: 'Generates a fresh key dedicated to micropayments' },
      { name: 'Import existing private key', value: 'import', description: 'Use a key you already have' },
      { name: 'Skip — configure later', value: 'skip' },
    ],
  });

  switch (choice) {
    case 'create': {
      const result = await createWallet({});
      const walletFile = readJsonFile<WalletFile>('wallet.json');
      const keyStorage = walletFile ? getKeyStorage(walletFile) : 'file';
      console.log(`  ✓ Wallet created: ${result.address}`);
      console.log(`    Storage: ${paths.wallet} (${keyStorage})`);
      console.log(`    Encryption: AES-256-GCM + PBKDF2 (600k iterations)`);
      console.log('');
      console.log('  Fund it with USDC on SKALE network:');
      console.log('    paperwall wallet address   # get your address');
      console.log('    paperwall wallet balance   # check balance');
      break;
    }
    case 'import': {
      console.log('');
      console.log('  ⚠  WARNING: NEVER import your main wallet key here!');
      console.log('  ⚠  This agent makes AUTOMATED payments — AI assistants');
      console.log('  ⚠  can trigger transactions without manual approval.');
      console.log('  ⚠  Use a DEDICATED wallet funded with $5-$50 USDC.');
      console.log('');
      const confirmed = await confirm({
        message: 'I understand the risks. Continue?',
        default: false,
      });
      if (!confirmed) {
        console.log('  Import cancelled. Create a wallet later: paperwall wallet create');
        break;
      }
      const key = await password({ message: 'Private key (0x-prefixed hex):' });
      const result = await importWallet(key, {});
      console.log(`  ✓ Wallet imported: ${result.address}`);
      console.log(`    Storage: ${paths.wallet}`);
      break;
    }
    case 'skip':
      console.log('  Skipped. Configure later:');
      console.log('    paperwall wallet create');
      console.log('    paperwall wallet import --key 0x<key>');
      break;
  }
}

// -- Budget Setup ---

async function setupBudget(): Promise<void> {
  console.log('');
  const wantBudget = await confirm({
    message: 'Set a spending budget? (recommended)',
    default: true,
  });

  if (!wantBudget) {
    console.log('  Skipped. Set limits later: paperwall budget set --per-request 0.10 --daily 1.00 --total 10.00');
    return;
  }

  const perRequest = await input({ message: 'Max USDC per request (e.g. 0.10):', default: '' });
  const daily = await input({ message: 'Max USDC per day (e.g. 1.00):', default: '' });
  const total = await input({ message: 'Max USDC total (e.g. 10.00):', default: '' });

  const entries: [string, string][] = [
    ['perRequestMax', perRequest],
    ['dailyMax', daily],
    ['totalMax', total],
  ].filter((e): e is [string, string] => e[1] !== '');

  if (entries.length === 0) {
    console.log('  No limits provided — skipping.');
    return;
  }

  const partial: Record<string, string> = {};
  for (const [key, value] of entries) {
    try {
      usdcToSmallest(value);
    } catch {
      console.error(`  Invalid amount "${value}" — must be a number (e.g. 0.10). Skipping budget.`);
      return;
    }
    partial[key] = value;
  }

  setBudget(partial);
  console.log('  ✓ Budget configured.');
}
