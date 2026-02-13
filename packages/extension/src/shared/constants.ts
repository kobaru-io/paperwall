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
      name: 'SKALE Base Sepolia',
      rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha',
      usdcAddress: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      chainId: 324705682,
    },
  ],
  [
    'eip155:1187947933',
    {
      name: 'SKALE Base',
      rpcUrl: 'https://skale-base.skalenodes.com/v1/base',
      usdcAddress: '0x85889c8c714505E0c94b30fcfcF64fE3Ac8FCb20',
      chainId: 1187947933,
    },
  ],
]);

export const DEFAULT_NETWORK = 'eip155:324705682';

export function getNetwork(caip2: string): NetworkConfig {
  const config = KNOWN_NETWORKS.get(caip2);
  if (!config) {
    throw new Error(`Unsupported network: ${caip2}`);
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

export function getExpectedAsset(caip2: string): string | null {
  const config = KNOWN_NETWORKS.get(caip2);
  return config ? config.usdcAddress : null;
}
