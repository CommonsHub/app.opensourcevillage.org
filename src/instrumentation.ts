/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts
 *
 * Validates critical service connections:
 * - Blockchain RPC (based on CHAIN env var)
 * - At least one Nostr relay
 */

import { nip19, getPublicKey } from 'nostr-tools';

// Chain RPC configurations (must match token-factory.ts)
const CHAIN_RPC: Record<string, { name: string; rpc: string }> = {
  localhost: { name: 'Localhost', rpc: 'http://127.0.0.1:8545' },
  gnosis: { name: 'Gnosis', rpc: 'https://rpc.gnosischain.com' },
  gnosis_chiado: { name: 'Gnosis Chiado', rpc: 'https://rpc.chiadochain.net' },
  base: { name: 'Base', rpc: 'https://base.llamarpc.com' },
  base_sepolia: { name: 'Base Sepolia', rpc: 'https://base-sepolia-rpc.publicnode.com' },
};

/**
 * Test blockchain RPC connectivity
 */
async function testRpcConnection(rpcUrl: string): Promise<{ success: boolean; chainId?: string; error?: string }> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error.message || 'RPC error' };
    }

    return { success: true, chainId: data.result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * Test Nostr relay connectivity using WebSocket
 */
async function testRelayConnection(relayUrl: string): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    try {
      const wsModule = await import('ws');
      const https = await import('https');
      const WebSocket = wsModule.default || wsModule.WebSocket;

      // Force HTTP/1.1 via ALPN (WebSocket doesn't work with HTTP/2)
      const agent = relayUrl.startsWith('wss://')
        ? new https.Agent({ ALPNProtocols: ['http/1.1'] })
        : undefined;
      const ws = new WebSocket(relayUrl, { agent });
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ success: false, error: 'Connection timeout (10s)' });
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ success: true });
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      resolve({ success: false, error });
    }
  });
}

/**
 * Exit the process with an error message and suggestions
 */
function exitWithError(service: string, details: string, suggestions: string[]): never {
  console.error('\n');
  console.error('╔════════════════════════════════════════════════════════════════╗');
  console.error('║                    STARTUP ERROR                               ║');
  console.error('╚════════════════════════════════════════════════════════════════╝');
  console.error(`\n❌ Failed to connect to ${service}\n`);
  console.error(`   ${details}\n`);
  console.error('💡 Suggestions to fix:\n');
  suggestions.forEach((s, i) => console.error(`   ${i + 1}. ${s}`));
  console.error('\n');
  process.exit(1);
}

export async function register() {
  console.log('[Instrumentation] register() called, NEXT_RUNTIME:', process.env.NEXT_RUNTIME);

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('\n=== Open Source Village Server Starting ===\n');

    const chain = (process.env.CHAIN || 'localhost') as string;
    const chainConfig = CHAIN_RPC[chain] || CHAIN_RPC.localhost;

    // ─────────────────────────────────────────────────────────────────
    // CRITICAL CHECK 1: Blockchain RPC Connectivity
    // ─────────────────────────────────────────────────────────────────
    console.log(`[RPC] Testing connection to ${chainConfig.name} (${chain})...`);
    console.log(`[RPC] URL: ${chainConfig.rpc}`);

    const rpcResult = await testRpcConnection(chainConfig.rpc);

    if (!rpcResult.success) {
      const suggestions = chain === 'localhost'
        ? [
            'Start a local blockchain node (e.g., Anvil, Hardhat, or Ganache)',
            'Run: anvil (if using Foundry)',
            'Run: npx hardhat node (if using Hardhat)',
            'Or change CHAIN to a public network: CHAIN=gnosis or CHAIN=base',
          ]
        : [
            `Check if ${chainConfig.name} RPC is available: ${chainConfig.rpc}`,
            'Try a different RPC endpoint for this chain',
            'Check your internet connection',
            'The public RPC might be rate-limited - try again later',
          ];

      exitWithError(
        `Blockchain RPC (${chainConfig.name})`,
        `Error: ${rpcResult.error}`,
        suggestions
      );
    }

    console.log(`[RPC] ✓ Connected to ${chainConfig.name} (chainId: ${rpcResult.chainId})\n`);

    // ─────────────────────────────────────────────────────────────────
    // CRITICAL CHECK 2: Nostr Relay Connectivity
    // ─────────────────────────────────────────────────────────────────
    let relays: string[] = [];

    try {
      const fs = await import('fs');
      const path = await import('path');
      const settingsPath = path.join(process.cwd(), 'settings.json');
      const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsContent);
      relays = settings.nostrRelays || [];
    } catch (err) {
      exitWithError(
        'Nostr Relays',
        `Failed to load settings.json: ${err instanceof Error ? err.message : String(err)}`,
        [
          'Ensure settings.json exists in the project root',
          'Check that settings.json is valid JSON',
          'Add a "nostrRelays" array with relay URLs',
        ]
      );
    }

    if (relays.length === 0) {
      exitWithError(
        'Nostr Relays',
        'No Nostr relays configured in settings.json',
        [
          'Add relay URLs to settings.json under "nostrRelays" array',
          'Example: "nostrRelays": ["wss://relay.damus.io", "wss://nos.lol"]',
        ]
      );
    }

    console.log(`[NOSTR Relays] Testing ${relays.length} configured relay(s)...`);

    const relayResults: { url: string; success: boolean; error?: string }[] = [];

    for (const relay of relays) {
      console.log(`[NOSTR Relays] Testing: ${relay}`);
      const result = await testRelayConnection(relay);
      relayResults.push({ url: relay, ...result });

      if (result.success) {
        console.log(`[NOSTR Relays] ✓ ${relay}`);
      } else {
        console.log(`[NOSTR Relays] ✗ ${relay} - ${result.error}`);
      }
    }

    const connectedRelays = relayResults.filter(r => r.success);
    const failedRelays = relayResults.filter(r => !r.success);

    if (connectedRelays.length === 0) {
      const isLocalhost = relays.some(r => r.includes('localhost') || r.includes('127.0.0.1'));
      const suggestions = isLocalhost
        ? [
            'Start a local Nostr relay (e.g., strfry, nostream)',
            'Run: docker run -p 80:80 -e REAL_IP_HEADER="" scsibug/nostr-rs-relay',
            'Or update settings.json to use public relays: ["wss://relay.damus.io", "wss://nos.lol"]',
          ]
        : [
            'Check if the configured relays are online',
            'Update settings.json with different relays: wss://relay.damus.io, wss://nos.lol, wss://relay.snort.social',
            'Check your internet connection',
            'Some relays may require authentication or be rate-limited',
          ];

      const failedDetails = failedRelays.map(r => `  - ${r.url}: ${r.error}`).join('\n');

      exitWithError(
        'Nostr Relays',
        `Could not connect to any relay:\n${failedDetails}`,
        suggestions
      );
    }

    console.log(`\n[NOSTR Relays] ✓ Connected to ${connectedRelays.length}/${relays.length} relay(s)\n`);

    // ─────────────────────────────────────────────────────────────────
    // Continue with normal startup (wallet info, token info, etc.)
    // ─────────────────────────────────────────────────────────────────

    // Log Wallet Info (0x address and balance)
    try {
      const { getWalletInfo, getTokenInfo } = await import('@/lib/token-factory');
      const wallet = await getWalletInfo();

      console.log('[Wallet] Address:', wallet.address);
      console.log('[Wallet] Chain:', wallet.chainName, `(${wallet.chain})`);
      console.log('[Wallet] Balance:', wallet.balanceFormatted, wallet.nativeCurrency);
      console.log('[Wallet] Explorer:', wallet.explorerUrl);

      if (!wallet.hasEnoughBalance) {
        console.warn('[Wallet] WARNING: Insufficient balance! Minimum required: 0.001', wallet.nativeCurrency);
      }

      // Check for deployed token
      const token = await getTokenInfo();
      if (token) {
        console.log('\n[Token] Name:', token.name, `(${token.symbol})`);
        console.log('[Token] Address:', token.address);
      } else {
        console.log('\n[Token] No token deployed yet');
      }
    } catch (err) {
      if (process.env.PRIVATE_KEY) {
        console.error('[Wallet] Failed to get wallet info:', err);
      } else {
        console.log('[Wallet] PRIVATE_KEY not set - token features disabled');
      }
    }

    // Log NOSTR Admin Account
    const nsec = process.env.NOSTR_NSEC;
    if (nsec) {
      try {
        const { data: secretKey } = nip19.decode(nsec);
        const publicKey = getPublicKey(secretKey as Uint8Array);
        const npub = nip19.npubEncode(publicKey);

        console.log('\n[NOSTR] npub:', npub);
        console.log('[NOSTR] pubkey:', publicKey);
      } catch (err) {
        console.error('[NOSTR] Failed to decode NOSTR_NSEC:', err);
      }
    } else {
      console.warn('\n[NOSTR] No NOSTR_NSEC found in environment');
    }

    // Log connected relays summary
    console.log('\n[NOSTR Relays] Active relays:');
    for (const relay of connectedRelays) {
      console.log(`[NOSTR Relays]   ✓ ${relay.url}`);
    }
    if (failedRelays.length > 0) {
      console.log('[NOSTR Relays] Unavailable relays:');
      for (const relay of failedRelays) {
        console.log(`[NOSTR Relays]   ✗ ${relay.url}`);
      }
    }

    console.log('\n========================================\n');
  }
}
