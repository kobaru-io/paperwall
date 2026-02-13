/**
 * Integration Test Setup
 *
 * Shared setup for integration tests across all Paperwall components:
 * - SDK (publisher-side script)
 * - Extension (browser extension)
 * - Agent (CLI tool)
 * - Demo (demo website)
 *
 * Loads .env.test from the project root for E2E credentials.
 * See .env.test.example for required variables.
 */

import { spawn, ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// ── Env File Loader ──────────────────────────────────────────────

/**
 * Loads KEY=VALUE pairs from .env.test into process.env.
 * Skips blank lines, comments (#), and vars already set in the environment.
 * No external dependencies — plain fs + string parsing.
 */
function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    // File not found — that's fine, env vars can be set externally
    return;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // Don't overwrite existing env vars (explicit env takes precedence)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Load .env.test from project root (two levels up from test/integration/)
const projectRoot = join(process.cwd(), '../..');
loadEnvFile(join(projectRoot, '.env.test'));

// ── Test Environment Config ──────────────────────────────────────

/** Returns the configured test env var, or undefined if not set. */
export function testEnv(key: string): string | undefined {
  return process.env[key];
}

/** Returns true when .env.test provides the minimum E2E credentials. */
export function hasE2ECredentials(): boolean {
  const pk = testEnv('PAPERWALL_PRIVATE_KEY');
  const payTo = testEnv('TEST_PAY_TO');
  return !!pk && !pk.includes('_YOUR_') && !!payTo && !payTo.includes('_YOUR_');
}

// ── Types ────────────────────────────────────────────────────────

export interface TestEnvironment {
  readonly facilitatorUrl: string;
  readonly payTo: string;
  readonly network: string;
  readonly privateKey: string;
  readonly accessKey: string;
  /** Price in smallest units (e.g. "1" = 0.000001 USDC). */
  readonly price: string;
  readonly demoUrl: string;
  readonly agentA2AUrl: string;
  readonly testWalletDir: string;
  cleanup: () => Promise<void>;
}

export interface TestWallet {
  address: string;
  privateKey: string;
}

/**
 * Creates a temporary wallet for testing
 */
export async function createTestWallet(): Promise<TestWallet> {
  const privateKey = '0x' + randomBytes(32).toString('hex');

  // In real tests, we'd derive the address from the private key
  // For now, using a placeholder
  const address = '0x' + randomBytes(20).toString('hex');

  return { address, privateKey };
}

/**
 * Creates a temporary directory for test data
 */
export async function createTestDir(): Promise<string> {
  const testDir = join(tmpdir(), 'paperwall-test-' + randomBytes(8).toString('hex'));
  await mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '0.0.0.0', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Starts a simple HTTP server for the demo site
 */
export async function startDemoServer(port?: number): Promise<{ url: string; stop: () => Promise<void> }> {
  const actualPort = port ? await findAvailablePort(port) : await findAvailablePort(8080);
  return new Promise((resolve, reject) => {
    const rootDir = join(process.cwd(), '../..');
    const server = spawn('node', ['server.js', actualPort.toString()], {
      cwd: join(rootDir, 'demo'),
      stdio: 'pipe',
      detached: false,
    });

    let started = false;
    let timeoutHandle: NodeJS.Timeout;

    server.stdout?.on('data', (data) => {
      if (!started && data.toString().includes('Paperwall Demo Server')) {
        started = true;
        clearTimeout(timeoutHandle);
        resolve({
          url: `http://localhost:${actualPort}`,
          stop: async () => {
            return new Promise<void>((res) => {
              server.kill('SIGTERM');
              setTimeout(() => {
                if (!server.killed) {
                  server.kill('SIGKILL');
                }
                res();
              }, 200);
            });
          },
        });
      }
    });

    server.stderr?.on('data', (data) => {
      console.error('Demo server error:', data.toString());
    });

    server.on('error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    // Timeout after 10 seconds
    timeoutHandle = setTimeout(() => {
      if (!started) {
        server.kill('SIGKILL');
        reject(new Error('Demo server failed to start after 10 seconds'));
      }
    }, 10000);
  });
}

/**
 * Starts the agent A2A server
 */
export async function startAgentServer(
  walletDir: string,
  port?: number,
  options?: { privateKey?: string; accessKey?: string; network?: string },
): Promise<{ url: string; stop: () => Promise<void> }> {
  const actualPort = port ? await findAvailablePort(port) : await findAvailablePort(4000);
  return new Promise((resolve, reject) => {
    const rootDir = join(process.cwd(), '../..');
    const env: Record<string, string | undefined> = {
      ...process.env,
      PAPERWALL_DATA_DIR: walletDir,
      PAPERWALL_PORT: actualPort.toString(),
      PAPERWALL_ACCESS_KEYS: options?.accessKey ?? 'test-key-123',
    };
    if (options?.privateKey) env['PAPERWALL_PRIVATE_KEY'] = options.privateKey;
    if (options?.network) env['PAPERWALL_NETWORK'] = options.network;

    const server = spawn('node', ['dist/cli.js', 'serve', '--port', actualPort.toString()], {
      cwd: join(rootDir, 'packages/agent'),
      env,
      stdio: 'pipe',
      detached: false,
    });

    let started = false;
    let timeoutHandle: NodeJS.Timeout;

    const checkStarted = (data: Buffer) => {
      const output = data.toString();
      if (!started && (output.includes('listening') || output.includes('started') || output.includes('A2A Server started'))) {
        started = true;
        clearTimeout(timeoutHandle);
        resolve({
          url: `http://localhost:${actualPort}`,
          stop: async () => {
            return new Promise<void>((res) => {
              server.kill('SIGTERM');
              setTimeout(() => {
                if (!server.killed) {
                  server.kill('SIGKILL');
                }
                res();
              }, 200);
            });
          },
        });
      }
    };

    server.stdout?.on('data', checkStarted);

    server.stderr?.on('data', (data) => {
      console.error('Agent server error:', data.toString());
      // Also check stderr for startup messages (agent logs go to stderr)
      checkStarted(data);
    });

    server.on('error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    timeoutHandle = setTimeout(() => {
      if (!started) {
        server.kill('SIGKILL');
        reject(new Error('Agent server failed to start after 10 seconds'));
      }
    }, 10000);
  });
}

/**
 * Sets up a complete test environment.
 * Reads credentials from process.env (loaded from .env.test).
 */
export async function setupTestEnvironment(): Promise<TestEnvironment> {
  const testWalletDir = await createTestDir();
  const facilitatorUrl = testEnv('TEST_FACILITATOR_URL') ?? 'https://gateway.kobaru.io';
  const payTo = testEnv('TEST_PAY_TO') ?? '0x0000000000000000000000000000000000000000';
  const network = testEnv('TEST_NETWORK') ?? 'eip155:324705682';
  const privateKey = testEnv('PAPERWALL_PRIVATE_KEY') ?? '';
  const accessKey = testEnv('TEST_ACCESS_KEY') ?? 'test-key-123';
  const price = testEnv('TEST_PRICE') ?? '1';

  // Start demo server (uses dynamic port allocation)
  const demo = await startDemoServer();

  // Start agent A2A server (with private key so it can sign payments, uses dynamic port allocation)
  const agent = await startAgentServer(testWalletDir, undefined, {
    privateKey: privateKey || undefined,
    accessKey,
    network,
  });

  return {
    facilitatorUrl,
    payTo,
    network,
    privateKey,
    accessKey,
    price,
    demoUrl: demo.url,
    agentA2AUrl: agent.url,
    testWalletDir,
    cleanup: async () => {
      await demo.stop();
      await agent.stop();
      await rm(testWalletDir, { recursive: true, force: true });
    },
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Makes an HTTP request (simple wrapper)
 */
export async function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
  });

  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    body,
    headers,
  };
}
