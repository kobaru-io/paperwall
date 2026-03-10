export interface NetworkConfig {
  readonly name: string;
  readonly rpcUrl: string;
  readonly usdcAddress: `0x${string}`;
  readonly chainId: number;
}

const KNOWN_NETWORKS: ReadonlyMap<string, NetworkConfig> = new Map([
  [
    'eip155:324705682',
    {
      name: 'SKALE Testnet',
      rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha',
      usdcAddress: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      chainId: 324705682,
    },
  ],
  [
    'eip155:84532',
    {
      name: 'Base Sepolia',
      rpcUrl: 'https://sepolia.base.org',
      usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      chainId: 84532,
    },
  ],
  [
    'eip155:1187947933',
    {
      name: 'SKALE Mainnet',
      rpcUrl: 'https://skale-base.skalenodes.com/v1/base',
      usdcAddress: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
      chainId: 1187947933,
    },
  ],
  [
    'eip155:8453',
    {
      name: 'Base Mainnet',
      rpcUrl: 'https://mainnet.base.org',
      usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      chainId: 8453,
    },
  ],
]);

const TESTNET_NETWORKS: ReadonlySet<string> = new Set([
  'eip155:324705682',
  'eip155:84532',
]);

const NETWORK_PRIORITIES: ReadonlyMap<string, number> = new Map([
  ['eip155:324705682', 0],
  ['eip155:84532', 1],
  ['eip155:1187947933', 2],
  ['eip155:8453', 3],
]);

export function getNetwork(caip2: string): NetworkConfig {
  const config = KNOWN_NETWORKS.get(caip2);
  if (!config) {
    throw new Error(`unsupported network: ${caip2}`);
  }
  return config;
}

export function parseChainId(caip2: string): number {
  const match = /^eip155:(\d+)$/.exec(caip2);
  if (!match?.[1]) {
    throw new Error(`Invalid CAIP-2 format (expected eip155:<chainId>): ${caip2}`);
  }
  return Number(match[1]);
}

export function getAllNetworks(): ReadonlyMap<string, NetworkConfig> {
  return KNOWN_NETWORKS;
}

export function getExpectedAsset(caip2: string): `0x${string}` | null {
  const config = KNOWN_NETWORKS.get(caip2);
  return config ? config.usdcAddress : null;
}

export function isTestnet(caip2: string): boolean {
  return TESTNET_NETWORKS.has(caip2);
}

export function getNetworkPriority(caip2: string): number {
  return NETWORK_PRIORITIES.get(caip2) ?? Infinity;
}
