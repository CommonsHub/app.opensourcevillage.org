#!/usr/bin/env npx tsx
/**
 * Standalone Payment Processor
 *
 * Independent process that listens to NOSTR relays for kind 9734 (payment request) events,
 * processes token operations (mint/transfer), and emits kind 9735 (payment receipt) events.
 *
 * Usage:
 *   npm run payment-processor
 *   # or directly:
 *   npx tsx scripts/payment-processor.ts
 *
 * Required environment variables:
 *   - PRIVATE_KEY: Deployer private key for token operations (0x... format)
 *   - NOSTR_NSEC: NOSTR secret key for signing receipt events (nsec1... format)
 *
 * Optional environment variables:
 *   - DATA_DIR: Directory for storing data (default: ./data)
 *   - BACKUP_PRIVATE_KEY: Backup private key for Safe operations
 *
 * Processed event IDs are tracked in: DATA_DIR/paymentProcessor/processed_events.json
 * Note: Event logging is handled by the separate record-nostr-events process
 */

// Load environment variables from .env.local or .env
import * as fs from 'fs';
import * as path from 'path';

// Logging helper with timestamp
function log(...args: unknown[]): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}]`, ...args);
}

function logError(...args: unknown[]): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.error(`[${timestamp}]`, ...args);
}

function loadEnvFile(filename: string): boolean {
  const envPath = path.join(process.cwd(), filename);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    return true;
  }
  return false;
}

// Try .env.local first, then .env
if (!loadEnvFile('.env.local')) {
  loadEnvFile('.env');
}

import { Token } from '@opencollective/token-factory';
import type { SupportedChain } from '@opencollective/token-factory';
import { getPublicKey, nip19 } from 'nostr-tools';
import {
  NOSTR_KINDS,
  parsePaymentRequestEvent,
  createPaymentReceiptEvent,
  decodeNsec,
  type NostrEvent,
} from '../src/lib/nostr-events';
import {
  NostrConnectionPool,
  getRelayUrls,
} from '../src/lib/nostr-server';

// Load settings with type that allows optional token
interface TokenConfig {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  deployedAt?: string;
}

// Token config from environment variables
function getTokenConfig(): TokenConfig | null {
  const address = process.env.TOKEN_ADDRESS;
  if (!address) return null;
  return {
    address,
    name: process.env.TOKEN_NAME || 'Community Token',
    symbol: process.env.TOKEN_SYMBOL || 'OSV',
    chain: process.env.CHAIN || 'gnosis',
  };
}

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PROCESSOR_DIR = path.join(DATA_DIR, 'paymentProcessor');
const PROCESSED_FILE = path.join(PROCESSOR_DIR, 'processed_events.json');

// Chain ID to name mapping
const CHAIN_ID_TO_NAME: Record<number, SupportedChain> = {
  31337: 'localhost',
  100: 'gnosis',
  10200: 'gnosis_chiado',
  8453: 'base',
  84532: 'base_sepolia',
};

// ============================================================================
// State Management
// ============================================================================

interface ProcessorState {
  processedEventIds: Set<string>;
  tokenCache: Map<string, Token>;
}

const state: ProcessorState = {
  processedEventIds: new Set(),
  tokenCache: new Map(),
};

// ============================================================================
// File Storage
// ============================================================================

function ensureProcessorDir(): void {
  if (!fs.existsSync(PROCESSOR_DIR)) {
    fs.mkdirSync(PROCESSOR_DIR, { recursive: true });
    log(`[PaymentProcessor] Created directory: ${PROCESSOR_DIR}`);
  }
}

function loadProcessedEvents(): void {
  ensureProcessorDir();

  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      const content = fs.readFileSync(PROCESSED_FILE, 'utf-8');
      const data = JSON.parse(content);
      state.processedEventIds = new Set(data.processedIds || []);
      log(`[PaymentProcessor] Loaded ${state.processedEventIds.size} processed event IDs`);
    }
  } catch (error) {
    console.error('[PaymentProcessor] Failed to load processed events:', error);
    state.processedEventIds = new Set();
  }
}

function saveProcessedEvents(): void {
  ensureProcessorDir();

  try {
    const data = {
      lastUpdated: new Date().toISOString(),
      count: state.processedEventIds.size,
      processedIds: Array.from(state.processedEventIds),
    };
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[PaymentProcessor] Failed to save processed events:', error);
  }
}

// ============================================================================
// Token Operations
// ============================================================================

function getToken(chainId: number, tokenAddress: string, privateKey: string): Token {
  const chainName = CHAIN_ID_TO_NAME[chainId];
  if (!chainName) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const cacheKey = `${chainId}:${tokenAddress}`;
  let token = state.tokenCache.get(cacheKey);

  if (!token) {
    token = new Token({
      name: 'Community Hour Token',
      symbol: 'CHT',
      chain: chainName,
      deployerPrivateKey: privateKey as `0x${string}`,
      tokenAddress: tokenAddress as `0x${string}`,
    });
    state.tokenCache.set(cacheKey, token);
  }

  return token;
}

// ============================================================================
// Payment Processing
// ============================================================================

async function processPaymentRequest(
  event: NostrEvent,
  secretKey: Uint8Array,
  privateKey: string
): Promise<void> {
  // Check if already processed
  if (state.processedEventIds.has(event.id)) {
    log(`[PaymentProcessor] Event ${event.id.slice(0, 8)}... already processed, skipping`);
    return;
  }

  log(`[PaymentProcessor] Processing payment request: ${event.id.slice(0, 8)}...`);

  // Parse the payment request
  const request = parsePaymentRequestEvent(event);
  if (!request) {
    logError(`[PaymentProcessor] Failed to parse payment request: ${event.id}`);
    state.processedEventIds.add(event.id);
    saveProcessedEvents();
    return;
  }

  const method = request.method || 'transfer';

  // Validate signature: only process requests signed by the authorized party
  const serverPubkey = getPublicKey(secretKey);

  if (method === 'mint' || method === 'burn') {
    // Mint and burn must be signed by the server
    if (event.pubkey !== serverPubkey) {
      logError(`[PaymentProcessor] REJECTED: ${method} request not signed by server`);
      logError(`[PaymentProcessor] Event details:`, {
        eventId: event.id,
        eventPubkey: event.pubkey,
        expectedPubkey: serverPubkey,
        method,
        sender: request.sender,
        recipient: request.recipient,
        amount: request.amount,
        context: request.context,
      });
      state.processedEventIds.add(event.id);
      saveProcessedEvents();
      return;
    }
  } else {
    // Transfer must be signed by the sender
    // Decode sender npub to hex pubkey for comparison
    let senderPubkey: string;
    try {
      const decoded = nip19.decode(request.sender);
      if (decoded.type !== 'npub') {
        throw new Error('Sender is not an npub');
      }
      senderPubkey = decoded.data;
    } catch (error) {
      logError(`[PaymentProcessor] REJECTED: Failed to decode sender npub: ${request.sender}`);
      state.processedEventIds.add(event.id);
      saveProcessedEvents();
      return;
    }

    if (event.pubkey !== senderPubkey) {
      logError(`[PaymentProcessor] REJECTED: Transfer request not signed by sender`);
      logError(`[PaymentProcessor] Event details:`, {
        eventId: event.id,
        eventPubkey: event.pubkey,
        expectedPubkey: senderPubkey,
        method,
        sender: request.sender,
        recipient: request.recipient,
        amount: request.amount,
        context: request.context,
      });
      state.processedEventIds.add(event.id);
      saveProcessedEvents();
      return;
    }
  }

  log(`[PaymentProcessor] Payment details:`, {
    method,
    from: request.sender.slice(0, 15) + '...',
    to: request.recipient.slice(0, 15) + '...',
    amount: request.amount,
    tokenSymbol: request.tokenSymbol,
    chainId: request.chainId,
    context: request.context,
  });

  let txHash: string = '0x0';
  let success = false;
  let errorMessage: string | undefined;

  try {
    // Get token instance
    const token = getToken(request.chainId, request.tokenAddress, privateKey);

    if (method === 'mint') {
      // Mint new tokens to the recipient
      log(`[PaymentProcessor] Minting ${request.amount} tokens to ${request.recipient.slice(0, 15)}...`);
      txHash = await token.mintTo(request.amount, `nostr:${request.recipient}`) || '0x0';

      if (txHash && txHash !== '0x0') {
        log(`[PaymentProcessor] Mint successful: ${txHash}`);
        success = true;
      } else {
        throw new Error('Mint returned no transaction hash');
      }
    } else if (method === 'burn') {
      // Burn tokens from sender (used for workshop proposals)
      log(`[PaymentProcessor] Burning ${request.amount} tokens from ${request.sender.slice(0, 15)}...`);
      txHash = await token.burnFrom(request.amount, `nostr:${request.sender}`) || '0x0';

      if (txHash && txHash !== '0x0') {
        log(`[PaymentProcessor] Burn successful: ${txHash}`);
        success = true;
      } else {
        throw new Error('Burn returned no transaction hash');
      }
    } else {
      // Transfer tokens from sender to recipient
      log(`[PaymentProcessor] Transferring ${request.amount} tokens...`);
      txHash = await token.transfer(
        `nostr:${request.sender}`,
        `nostr:${request.recipient}`,
        request.amount
      ) || '0x0';

      if (txHash && txHash !== '0x0') {
        log(`[PaymentProcessor] Transfer successful: ${txHash}`);
        success = true;
      } else {
        throw new Error('Transfer returned no transaction hash');
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    logError(`[PaymentProcessor] ${method} failed:`, errorMessage);
  }

  // Mark as processed
  state.processedEventIds.add(event.id);
  saveProcessedEvents();

  // Only publish payment receipt (kind 1735) on success
  if (success) {
    try {
      const receiptEvent = createPaymentReceiptEvent(secretKey, {
        paymentRequestEvent: event,
        txHash,
        success,
      });

      await publishToRelays(receiptEvent);
      log(`[PaymentProcessor] Published payment receipt: ${receiptEvent.id.slice(0, 8)}...`);
    } catch (error) {
      logError(`[PaymentProcessor] Failed to publish receipt:`, error);
    }
  } else {
    log(`[PaymentProcessor] Skipping receipt for failed transaction: ${event.id.slice(0, 8)}...`);
  }
}

// ============================================================================
// Relay Communication (using shared NostrConnectionPool)
// ============================================================================

let connectionPool: NostrConnectionPool | null = null;

async function publishToRelays(event: NostrEvent): Promise<void> {
  if (!connectionPool) {
    console.error('[PaymentProcessor] No connection pool available');
    return;
  }

  const result = await connectionPool.publishToAll(event);
  log(`[PaymentProcessor] Receipt published to ${result.successful}/${result.successful + result.failed} relays`);
}

function setupConnectionPool(
  secretKey: Uint8Array,
  privateKey: string
): NostrConnectionPool {
  const pool = new NostrConnectionPool(
    {
      secretKey,
      autoReconnect: true,
      reconnectDelay: 5000,
      onConnect: (url) => log(`[PaymentProcessor] Connected to ${url}`),
      onDisconnect: (url) => log(`[PaymentProcessor] Disconnected from ${url}`),
      onAuth: (url) => log(`[PaymentProcessor] Authenticated with ${url}`),
      onError: (url, error) => logError(`[PaymentProcessor] Error from ${url}:`, error.message),
    },
    '[PaymentProcessor]'
  );

  return pool;
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  log('='.repeat(60));
  log('Payment Processor - Starting');
  log('='.repeat(60));

  // Check required environment variables
  const privateKey = process.env.PRIVATE_KEY;
  const nostrNsec = process.env.NOSTR_NSEC;

  if (!privateKey) {
    console.error('[PaymentProcessor] ERROR: PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  if (!nostrNsec) {
    console.error('[PaymentProcessor] ERROR: NOSTR_NSEC environment variable is required');
    process.exit(1);
  }

  // Check if token is configured via environment variables
  const tokenConfig = getTokenConfig();
  if (!tokenConfig) {
    console.log('[PaymentProcessor] No token configured (TOKEN_ADDRESS env var not set)');
    console.log('[PaymentProcessor] Payment processor will not start.');
    console.log('[PaymentProcessor] To enable payments, set TOKEN_ADDRESS in .env.local and restart the service.');
    console.log('[PaymentProcessor] Exiting gracefully...');
    process.exit(0);
  }

  // Decode NOSTR secret key
  let secretKey: Uint8Array;
  try {
    secretKey = decodeNsec(nostrNsec);
  } catch (error) {
    console.error('[PaymentProcessor] ERROR: Failed to decode NOSTR_NSEC:', error);
    process.exit(1);
  }

  // Derive npub from secret key
  const pubkey = getPublicKey(secretKey);
  const npub = nip19.npubEncode(pubkey);

  // Display startup information
  console.log('[PaymentProcessor] ------------------------------------');
  log(`[PaymentProcessor] npub: ${npub}`);
  log(`[PaymentProcessor] Chain: ${tokenConfig.chain}`);
  log(`[PaymentProcessor] Token: ${tokenConfig.symbol} (${tokenConfig.address})`);
  console.log('[PaymentProcessor] ------------------------------------');

  // Load processed events
  loadProcessedEvents();

  // Get relay URLs from environment variable
  const relayUrls = getRelayUrls();
  if (relayUrls.length === 0) {
    console.error('[PaymentProcessor] ERROR: No relay URLs configured. Set NOSTR_RELAYS env variable (comma-separated)');
    process.exit(1);
  }

  log(`[PaymentProcessor] Connecting to ${relayUrls.length} relay(s)...`);
  log(`[PaymentProcessor] Data directory: ${PROCESSOR_DIR}`);

  // Set up connection pool
  connectionPool = setupConnectionPool(secretKey, privateKey);
  const { connected, failed } = await connectionPool.connectToRelays(relayUrls);

  log(`[PaymentProcessor] Connected to ${connected} relay(s), ${failed} failed`);

  if (connected === 0) {
    console.error('[PaymentProcessor] ERROR: Failed to connect to any relay');
    process.exit(1);
  }

  // Subscribe to payment request events
  connectionPool.subscribeAll({
    filters: [{
      kinds: [NOSTR_KINDS.PAYMENT_REQUEST],
      since: Math.floor(Date.now() / 1000) - 3600, // Last hour
    }],
    onEvent: async (event, relayUrl) => {
      if (event.kind === NOSTR_KINDS.PAYMENT_REQUEST) {
        await processPaymentRequest(event, secretKey, privateKey);
      }
    },
    onEose: (relayUrl) => {
      log(`[PaymentProcessor] ${relayUrl}: End of stored events`);
    },
  });

  log(`[PaymentProcessor] Subscribed to kind ${NOSTR_KINDS.PAYMENT_REQUEST} events`);
  console.log('[PaymentProcessor] Listening for payment requests...');
  console.log('[PaymentProcessor] Press Ctrl+C to stop');

  // Handle shutdown
  const shutdown = () => {
    log('\n[PaymentProcessor] Shutting down...');
    saveProcessedEvents();
    connectionPool?.closeAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the processor
main().catch((error) => {
  logError('[PaymentProcessor] Fatal error:', error);
  process.exit(1);
});
