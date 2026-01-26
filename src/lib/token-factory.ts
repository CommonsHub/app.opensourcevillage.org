/**
 * Token Factory Integration
 *
 * Manages wallet and token operations using @opencollective/token-factory
 * Uses direct JSON-RPC calls for blockchain queries (no viem dependency)
 */

import { promises as fs } from 'fs';
import path from 'path';

export type SupportedChain = 'localhost' | 'gnosis' | 'gnosis_chiado' | 'base' | 'base_sepolia';

// Chain configurations
const CHAIN_INFO: Record<SupportedChain, { name: string; symbol: string; rpc: string; explorer: string }> = {
  localhost: {
    name: 'Localhost',
    symbol: 'ETH',
    rpc: 'http://127.0.0.1:8545',
    explorer: 'https://voltaire.tevm.sh',
  },
  gnosis: {
    name: 'Gnosis',
    symbol: 'xDAI',
    rpc: 'https://rpc.gnosischain.com',
    explorer: 'https://gnosisscan.io/address',
  },
  gnosis_chiado: {
    name: 'Gnosis Chiado',
    symbol: 'xDAI',
    rpc: 'https://rpc.chiadochain.net',
    explorer: 'https://gnosis-chiado.blockscout.com/address',
  },
  base: {
    name: 'Base',
    symbol: 'ETH',
    rpc: 'https://base.llamarpc.com',
    explorer: 'https://basescan.org/address',
  },
  base_sepolia: {
    name: 'Base Sepolia',
    symbol: 'ETH',
    rpc: 'https://base-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.basescan.org/address',
  },
};

export interface WalletInfo {
  address: string;
  balance: bigint;
  balanceFormatted: string;
  chain: SupportedChain;
  chainName: string;
  nativeCurrency: string;
  explorerUrl: string;
  hasEnoughBalance: boolean;
  minBalance: bigint;
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  chain: SupportedChain;
  deployed: boolean;
}

const SETTINGS_PATH = path.join(process.cwd(), 'settings.json');
const MIN_BALANCE = BigInt(1e15); // 0.001 ETH minimum

/**
 * Make a JSON-RPC call to the blockchain
 */
async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'RPC error');
  }
  return data.result;
}

/**
 * Get native balance for an address via JSON-RPC
 */
async function getNativeBalance(rpcUrl: string, address: string): Promise<bigint> {
  const result = await rpcCall(rpcUrl, 'eth_getBalance', [address, 'latest']);
  return BigInt(result as string);
}

/**
 * Derive address from private key (simple secp256k1)
 */
function privateKeyToAddress(privateKey: string): string {
  // Use dynamic import for crypto operations
  const key = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

  // We need to compute the Ethereum address from private key
  // This requires secp256k1 operations - use the token-factory for this
  // For now, return a placeholder that will be replaced when token-factory is loaded
  return `0x${key.slice(0, 40)}`;
}

/**
 * Format wei to ether string
 */
function formatEther(wei: bigint): string {
  const ether = Number(wei) / 1e18;
  return ether.toFixed(6);
}

/**
 * Get the private key from environment
 * Throws an error if PRIVATE_KEY is not set
 */
export function getPrivateKey(): `0x${string}` {
  const existingKey = process.env.PRIVATE_KEY;

  if (!existingKey) {
    throw new Error(
      'PRIVATE_KEY environment variable is not set. ' +
      'Please configure your .env.local file with a valid private key. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }

  return existingKey.startsWith('0x')
    ? existingKey as `0x${string}`
    : `0x${existingKey}` as `0x${string}`;
}

/**
 * Get the current chain from environment
 */
export function getChain(): SupportedChain {
  const chain = process.env.CHAIN as SupportedChain;
  if (chain && CHAIN_INFO[chain]) {
    return chain;
  }
  return 'localhost';
}

/**
 * Get wallet address from private key using token-factory
 */
async function getAddressFromPrivateKey(privateKey: `0x${string}`): Promise<string> {
  try {
    // Use token-factory's internal viem to get the address
    const { Token } = await import('@opencollective/token-factory');
    const token = new Token({
      name: 'temp',
      symbol: 'TEMP',
      chain: getChain(),
      deployerPrivateKey: privateKey,
    });
    // The Token class stores the deployer address internally
    // We can get it by deploying or predicting - let's use a workaround
    // Actually, let's just compute it ourselves using the private key

    // Simple workaround: create a test and extract from error or use the utils
    const { utils } = await import('@opencollective/token-factory');

    // If utils has a method, use it. Otherwise compute manually
    // For now, let's use a simple computation
    const key = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    // Use Node's crypto to compute keccak256 of public key
    // This is a simplified version - in production use proper secp256k1
    const { createHash } = await import('crypto');

    // For proper address derivation, we need secp256k1
    // Let's use ethers which is already a dependency
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);
    return wallet.address;
  } catch (error) {
    console.error('[TokenFactory] Failed to derive address:', error);
    throw error;
  }
}

/**
 * Get wallet information including address and balance
 */
export async function getWalletInfo(): Promise<WalletInfo> {
  const privateKey = getPrivateKey();
  const chain = getChain();
  const chainInfo = CHAIN_INFO[chain];

  const address = await getAddressFromPrivateKey(privateKey);

  let balance: bigint;
  try {
    balance = await getNativeBalance(chainInfo.rpc, address);
  } catch (error) {
    console.error('[TokenFactory] Failed to fetch balance:', error);
    balance = BigInt(0);
  }

  const explorerUrl = chain === 'localhost'
    ? `${chainInfo.explorer}?address=${address}`
    : `${chainInfo.explorer}/${address}`;

  return {
    address,
    balance,
    balanceFormatted: formatEther(balance),
    chain,
    chainName: chainInfo.name,
    nativeCurrency: chainInfo.symbol,
    explorerUrl,
    hasEnoughBalance: balance >= MIN_BALANCE,
    minBalance: MIN_BALANCE,
  };
}

/**
 * Load settings from settings.json
 */
export async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save settings to settings.json
 */
export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');

/**
 * Update a key in .env.local file
 */
export async function updateEnvLocal(key: string, value: string): Promise<void> {
  let content = '';

  try {
    content = await fs.readFile(ENV_LOCAL_PATH, 'utf-8');
  } catch {
    // File doesn't exist, create with header
    content = '# Open Source Village - Local Environment Variables\n\n';
  }

  const lines = content.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}=`)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    // Add the key at the end
    lines.push(`${key}=${value}`);
  }

  await fs.writeFile(ENV_LOCAL_PATH, lines.join('\n'));
  console.log(`[TokenFactory] Updated ${key} in .env.local`);
}

/**
 * Get token info from environment variables (TOKEN_ADDRESS, TOKEN_NAME, TOKEN_SYMBOL, CHAIN)
 */
export async function getTokenInfo(): Promise<TokenInfo | null> {
  const envTokenAddress = process.env.TOKEN_ADDRESS;

  if (!envTokenAddress || !envTokenAddress.startsWith('0x') || envTokenAddress.length !== 42) {
    return null;
  }

  return {
    address: envTokenAddress,
    name: process.env.TOKEN_NAME || 'Community Token',
    symbol: process.env.TOKEN_SYMBOL || 'OSV',
    chain: getChain(),
    deployed: true,
  };
}

/**
 * Deploy a new token and save to .env.local
 */
export async function deployToken(
  name: string = 'Open Source Village Token',
  symbol: string = 'OSV',
  chainOverride?: SupportedChain
): Promise<TokenInfo> {
  const { Token } = await import('@opencollective/token-factory');

  const chain = chainOverride || getChain();
  const privateKey = getPrivateKey();

  console.log(`[TokenFactory] Deploying token "${name}" (${symbol}) on ${chain}...`);

  const token = new Token({
    name,
    symbol,
    chain,
    deployerPrivateKey: privateKey,
  });

  const tokenAddress = await token.deployToken();

  console.log(`[TokenFactory] Token deployed at: ${tokenAddress}`);

  // Save all token info to .env.local
  await updateEnvLocal('TOKEN_ADDRESS', tokenAddress);
  await updateEnvLocal('TOKEN_NAME', name);
  await updateEnvLocal('TOKEN_SYMBOL', symbol);

  // If chain was overridden, also save CHAIN to .env.local
  if (chainOverride) {
    await updateEnvLocal('CHAIN', chainOverride);
  }

  return {
    address: tokenAddress,
    name,
    symbol,
    chain,
    deployed: true,
  };
}

/**
 * Get or deploy token
 */
export async function getOrDeployToken(
  name: string = 'Open Source Village Token',
  symbol: string = 'OSV',
  chainOverride?: SupportedChain
): Promise<TokenInfo> {
  const chain = chainOverride || getChain();
  const existingToken = await getTokenInfo();

  if (existingToken && existingToken.chain === chain) {
    console.log(`[TokenFactory] Using existing token at ${existingToken.address}`);
    return existingToken;
  }

  return await deployToken(name, symbol, chainOverride);
}

/**
 * Get a Token instance for operations
 */
export async function getTokenInstance() {
  const { Token } = await import('@opencollective/token-factory');

  const tokenInfo = await getTokenInfo();
  const chain = getChain();
  const privateKey = getPrivateKey();

  return new Token({
    name: tokenInfo?.name || 'Open Source Village Token',
    symbol: tokenInfo?.symbol || 'OSV',
    chain,
    deployerPrivateKey: privateKey,
    tokenAddress: tokenInfo?.address as `0x${string}` | undefined,
  });
}

/**
 * Get wallet address for a nostr npub
 */
export async function getWalletAddressForNpub(npub: string): Promise<string> {
  const { Token } = await import('@opencollective/token-factory');
  const token = new Token({
    name: 'temp',
    symbol: 'TEMP',
    chain: getChain(),
  });
  return token.getUserAddress('nostr', npub);
}

/**
 * Mint tokens to an npub
 */
export async function mintToNpub(npub: string, amount: number): Promise<string | null> {
  const token = await getTokenInstance();
  const hash = await token.mintTo(amount, `nostr:${npub}`);
  return hash;
}

/**
 * Get token balance for an npub
 */
export async function getBalanceForNpub(npub: string): Promise<bigint> {
  const token = await getTokenInstance();
  return await token.getBalance(`nostr:${npub}`);
}

/**
 * Transfer tokens between npubs
 */
export async function transferTokens(
  fromNpub: string,
  toNpub: string,
  amount: number
): Promise<string> {
  const token = await getTokenInstance();
  const hash = await token.transfer(`nostr:${fromNpub}`, `nostr:${toNpub}`, amount);
  return hash;
}
