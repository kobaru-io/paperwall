import { readJsonFile } from '../storage.js';
import { parseAccessKeys } from './access-gate.js';
import type { ServerConfig } from './types.js';

interface CliOptions {
  readonly port?: string;
  readonly host?: string;
  readonly network?: string;
  readonly authTtl?: string;
}

const SERVER_CONFIG_FILENAME = 'server.json';

export function resolveServerConfig(cli: CliOptions): ServerConfig {
  const file = readJsonFile<Partial<ServerConfig>>(SERVER_CONFIG_FILENAME);

  const port = parseInt(
    cli.port ??
      process.env['PAPERWALL_PORT'] ??
      String(file?.port ?? 4000),
    10,
  );
  const host =
    cli.host ??
    process.env['PAPERWALL_HOST'] ??
    file?.host ??
    '0.0.0.0';
  const network =
    cli.network ??
    process.env['PAPERWALL_NETWORK'] ??
    file?.network ??
    'eip155:324705682';

  const authTtl = parseInt(
    cli.authTtl ??
      process.env['PAPERWALL_AUTH_TTL'] ??
      String(file?.authTtl ?? 300),
    10,
  );

  const envKeys = parseAccessKeys(process.env['PAPERWALL_ACCESS_KEYS']);
  const accessKeys =
    envKeys.length > 0 ? envKeys : (file?.accessKeys ?? []);

  return { port, host, network, accessKeys, authTtl };
}
