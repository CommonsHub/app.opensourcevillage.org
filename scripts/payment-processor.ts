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

import WebSocket from 'ws';
import { Token } from '@opencollective/token-factory';
import type { SupportedChain } from '@opencollective/token-factory';
import { finalizeEvent, type EventTemplate, getPublicKey, nip19 } from 'nostr-tools';
import {
  NOSTR_KINDS,
  parsePaymentRequestEvent,
  createPaymentReceiptEvent,
  decodeNsec,
  type NostrEvent,
  type PaymentRequestOptions,
} from '../src/lib/nostr-events';

/**
 * Get the relay URL for NIP-42 AUTH events.
 * Use NOSTR_RELAY_AUTH_URL env var to override if pyramid's ServiceURL differs from connection URL.
 */
function getRelayAuthUrl(relayUrl: string): string {
  if (process.env.NOSTR_RELAY_AUTH_URL) {
    return process.env.NOSTR_RELAY_AUTH_URL;
  }
  try {
    const u = new URL(relayUrl);
    u.pathname = '';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return relayUrl;
  }
}

// Load settings
import settings from '../settings.json';

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
    console.log(`[PaymentProcessor] Created directory: ${PROCESSOR_DIR}`);
  }
}

function loadProcessedEvents(): void {
  ensureProcessorDir();

  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      const content = fs.readFileSync(PROCESSED_FILE, 'utf-8');
      const data = JSON.parse(content);
      state.processedEventIds = new Set(data.processedIds || []);
      console.log(`[PaymentProcessor] Loaded ${state.processedEventIds.size} processed event IDs`);
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
    console.log(`[PaymentProcessor] Event ${event.id.slice(0, 8)}... already processed, skipping`);
    return;
  }

  console.log(`[PaymentProcessor] Processing payment request: ${event.id.slice(0, 8)}...`);

  // Parse the payment request
  const request = parsePaymentRequestEvent(event);
  if (!request) {
    console.error(`[PaymentProcessor] Failed to parse payment request: ${event.id}`);
    state.processedEventIds.add(event.id);
    saveProcessedEvents();
    return;
  }

  const method = request.method || 'transfer';

  console.log(`[PaymentProcessor] Payment details:`, {
    method,
    from: request.senderNpub.slice(0, 15) + '...',
    to: request.recipientNpub.slice(0, 15) + '...',
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
      console.log(`[PaymentProcessor] Minting ${request.amount} tokens to ${request.recipientNpub.slice(0, 15)}...`);
      txHash = await token.mintTo(request.amount, `nostr:${request.recipientNpub}`) || '0x0';

      if (txHash && txHash !== '0x0') {
        console.log(`[PaymentProcessor] Mint successful: ${txHash}`);
        success = true;
      } else {
        throw new Error('Mint returned no transaction hash');
      }
    } else if (method === 'burn') {
      // Burn tokens from sender (used for workshop proposals)
      console.log(`[PaymentProcessor] Burning ${request.amount} tokens from ${request.senderNpub.slice(0, 15)}...`);
      txHash = await token.burnFrom(request.amount, `nostr:${request.senderNpub}`) || '0x0';

      if (txHash && txHash !== '0x0') {
        console.log(`[PaymentProcessor] Burn successful: ${txHash}`);
        success = true;
      } else {
        throw new Error('Burn returned no transaction hash');
      }
    } else {
      // Transfer tokens from sender to recipient
      console.log(`[PaymentProcessor] Transferring ${request.amount} tokens...`);
      txHash = await token.transfer(
        `nostr:${request.senderNpub}`,
        `nostr:${request.recipientNpub}`,
        request.amount
      ) || '0x0';

      if (txHash && txHash !== '0x0') {
        console.log(`[PaymentProcessor] Transfer successful: ${txHash}`);
        success = true;
      } else {
        throw new Error('Transfer returned no transaction hash');
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[PaymentProcessor] ${method} failed:`, errorMessage);
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
      console.log(`[PaymentProcessor] Published payment receipt: ${receiptEvent.id.slice(0, 8)}...`);
    } catch (error) {
      console.error(`[PaymentProcessor] Failed to publish receipt:`, error);
    }
  } else {
    console.log(`[PaymentProcessor] Skipping receipt for failed transaction: ${event.id.slice(0, 8)}...`);
  }
}

// ============================================================================
// Relay Communication
// ============================================================================

let relayConnections: Map<string, WebSocket> = new Map();

async function publishToRelays(event: NostrEvent): Promise<void> {
  const eventMessage = JSON.stringify(['EVENT', event]);

  for (const [url, ws] of relayConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(eventMessage);
        console.log(`[PaymentProcessor] Receipt sent to ${url}`);
      } catch (error) {
        console.error(`[PaymentProcessor] Failed to send to ${url}:`, error);
      }
    }
  }
}

function connectToRelay(
  url: string,
  secretKey: Uint8Array,
  privateKey: string
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    console.log(`[PaymentProcessor] Connecting to ${url}...`);

    const ws = new WebSocket(url);
    let authenticated = false;
    let subscribed = false;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection timeout: ${url}`));
    }, 15000);

    // Helper to subscribe after connection/auth
    const subscribe = () => {
      if (subscribed) return;
      subscribed = true;

      const subId = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const filter = {
        kinds: [NOSTR_KINDS.PAYMENT_REQUEST],
        // Get events from the last hour to catch up on missed ones
        since: Math.floor(Date.now() / 1000) - 3600,
      };

      ws.send(JSON.stringify(['REQ', subId, filter]));
      console.log(`[PaymentProcessor] Subscribed to kind ${NOSTR_KINDS.PAYMENT_REQUEST} events`);
    };

    // Helper to handle NIP-42 AUTH challenge
    const handleAuth = (challenge: string) => {
      console.log(`[PaymentProcessor] Handling AUTH challenge from ${url}`);
      const authUrl = getRelayAuthUrl(url);

      const authTemplate: EventTemplate = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['challenge', challenge],
          ['relay', authUrl],
        ],
        content: '',
      };

      const authEvent = finalizeEvent(authTemplate, secretKey);
      console.log(`[PaymentProcessor] Sending AUTH response to ${url}`);
      ws.send(JSON.stringify(['AUTH', authEvent]));
    };

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log(`[PaymentProcessor] Connected to ${url}`);
      relayConnections.set(url, ws);

      // Wait a bit to see if AUTH challenge comes, otherwise subscribe
      setTimeout(() => {
        if (!authenticated && !subscribed) {
          subscribe();
        }
      }, 500);

      resolve(ws);
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (!Array.isArray(message) || message.length < 2) return;

        const [type, ...args] = message;

        switch (type) {
          case 'AUTH':
            // NIP-42 AUTH challenge
            if (typeof args[0] === 'string') {
              handleAuth(args[0]);
            }
            break;

          case 'EVENT':
            if (args[1] && args[1].kind === NOSTR_KINDS.PAYMENT_REQUEST) {
              await processPaymentRequest(args[1] as NostrEvent, secretKey, privateKey);
            }
            break;

          case 'OK':
            const [eventId, accepted, msg] = args;
            // Check if this is an AUTH OK (not our main event)
            if (!authenticated && accepted && !subscribed) {
              console.log(`[PaymentProcessor] AUTH accepted by ${url}`);
              authenticated = true;
              subscribe();
            } else {
              console.log(`[PaymentProcessor] ${url}: Event ${eventId?.slice(0, 8)}... ${accepted ? 'accepted' : 'rejected'}${msg ? `: ${msg}` : ''}`);
            }
            break;

          case 'EOSE':
            console.log(`[PaymentProcessor] ${url}: End of stored events`);
            break;

          case 'NOTICE':
            console.log(`[PaymentProcessor] ${url} notice: ${args[0]}`);
            break;
        }
      } catch (error) {
        console.error(`[PaymentProcessor] Error parsing message:`, error);
      }
    });

    ws.on('error', (error) => {
      console.error(`[PaymentProcessor] WebSocket error for ${url}:`, error.message);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      console.log(`[PaymentProcessor] Connection closed: ${url}`);
      relayConnections.delete(url);

      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        console.log(`[PaymentProcessor] Reconnecting to ${url}...`);
        connectToRelay(url, secretKey, privateKey).catch((err) => {
          console.error(`[PaymentProcessor] Reconnection failed:`, err.message);
        });
      }, 5000);
    });
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Payment Processor - Starting');
  console.log('='.repeat(60));

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
  console.log(`[PaymentProcessor] npub: ${npub}`);
  if (settings.token) {
    console.log(`[PaymentProcessor] Chain: ${settings.token.chain}`);
    console.log(`[PaymentProcessor] Token: ${settings.token.symbol} (${settings.token.address})`);
  }
  console.log('[PaymentProcessor] ------------------------------------');

  // Load processed events
  loadProcessedEvents();

  // Get relay URLs from settings
  const relayUrls = settings.nostrRelays || [];
  if (relayUrls.length === 0) {
    console.error('[PaymentProcessor] ERROR: No relay URLs configured in settings.json');
    process.exit(1);
  }

  console.log(`[PaymentProcessor] Connecting to ${relayUrls.length} relay(s)...`);
  console.log(`[PaymentProcessor] Data directory: ${PROCESSOR_DIR}`);

  // Connect to all relays
  const results = await Promise.allSettled(
    relayUrls.map((url) => connectToRelay(url, secretKey, privateKey))
  );

  const connected = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`[PaymentProcessor] Connected to ${connected} relay(s), ${failed} failed`);

  if (connected === 0) {
    console.error('[PaymentProcessor] ERROR: Failed to connect to any relay');
    process.exit(1);
  }

  console.log('[PaymentProcessor] Listening for payment requests (kind 9734)...');
  console.log('[PaymentProcessor] Press Ctrl+C to stop');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n[PaymentProcessor] Shutting down...');
    saveProcessedEvents();
    for (const ws of relayConnections.values()) {
      ws.close();
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[PaymentProcessor] Received SIGTERM, shutting down...');
    saveProcessedEvents();
    for (const ws of relayConnections.values()) {
      ws.close();
    }
    process.exit(0);
  });
}

// Run the processor
main().catch((error) => {
  console.error('[PaymentProcessor] Fatal error:', error);
  process.exit(1);
});
