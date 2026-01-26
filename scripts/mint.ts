#!/usr/bin/env npx tsx
/**
 * Mint Tokens Helper Script
 *
 * Sends a NOSTR kind 9734 (payment request) event to mint tokens to a given npub.
 * The payment processor will pick up this event and execute the mint operation.
 *
 * Usage:
 *   npm run mint <npub> [amount]
 *   # or directly:
 *   npx tsx scripts/mint.ts <npub> [amount]
 *
 * Examples:
 *   npm run mint npub1abc123...           # Mint default amount (50 tokens)
 *   npm run mint npub1abc123... 100       # Mint 100 tokens
 *
 * Required environment variables:
 *   - NOSTR_NSEC: NOSTR secret key for signing the payment request (nsec1... format)
 *   - TOKEN_ADDRESS: Token contract address (0x... format)
 *   - CHAIN: Chain name (gnosis, base, localhost, etc.) - defaults to 'gnosis'
 *
 * Optional environment variables:
 *   - TOKEN_SYMBOL: Token symbol (default: 'CHT')
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

import {
  createPaymentRequestEvent,
  decodeNsec,
  getPublicKeyFromNsec,
} from '../src/lib/nostr-events';
import { publishNostrEvent } from '../src/lib/nostr-publisher';
import { nip19 } from 'nostr-tools';

// Load settings
import settings from '../settings.json';

// ============================================================================
// Configuration
// ============================================================================

const CHAIN_NAME_TO_ID: Record<string, number> = {
  localhost: 31337,
  local: 31337, // Alias for localhost
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
};

const DEFAULT_AMOUNT = settings.tokenEconomics?.initialBalance || 50;
const DEFAULT_CHAIN = 'gnosis';

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Mint Tokens Helper Script

Usage:
  npm run mint <npub> [amount]

Arguments:
  npub    - Recipient's NOSTR public key (npub1...)
  amount  - Amount of tokens to mint (default: ${DEFAULT_AMOUNT})

Examples:
  npm run mint npub1abc123...           # Mint ${DEFAULT_AMOUNT} tokens
  npm run mint npub1abc123... 100       # Mint 100 tokens

Required environment variables:
  NOSTR_NSEC     - Your NOSTR secret key (nsec1...)
  TOKEN_ADDRESS  - Token contract address (0x...)

Optional environment variables:
  CHAIN          - Chain name (default: ${DEFAULT_CHAIN})
  TOKEN_SYMBOL   - Token symbol (default: CHT)
`);
    process.exit(0);
  }

  const recipientNpub = args[0];
  const amount = args[1] ? parseFloat(args[1]) : DEFAULT_AMOUNT;

  // Validate npub
  if (!recipientNpub.startsWith('npub1')) {
    console.error('[Mint] ERROR: Invalid npub format. Must start with "npub1"');
    process.exit(1);
  }

  // Validate npub by trying to decode it
  try {
    nip19.decode(recipientNpub);
  } catch {
    console.error('[Mint] ERROR: Invalid npub - failed to decode');
    process.exit(1);
  }

  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    console.error('[Mint] ERROR: Amount must be a positive number');
    process.exit(1);
  }

  // Check required environment variables
  const nostrNsec = process.env.NOSTR_NSEC;
  const tokenAddress = process.env.TOKEN_ADDRESS;

  if (!nostrNsec) {
    console.error('[Mint] ERROR: NOSTR_NSEC environment variable is required');
    process.exit(1);
  }

  if (!tokenAddress) {
    console.error('[Mint] ERROR: TOKEN_ADDRESS environment variable is required');
    process.exit(1);
  }

  // Get chain configuration
  const chainName = process.env.CHAIN || DEFAULT_CHAIN;
  const chainId = CHAIN_NAME_TO_ID[chainName];

  if (!chainId) {
    console.error(`[Mint] ERROR: Unknown chain "${chainName}". Valid chains: ${Object.keys(CHAIN_NAME_TO_ID).join(', ')}`);
    process.exit(1);
  }

  const tokenSymbol = process.env.TOKEN_SYMBOL || 'CHT';

  // Decode NOSTR secret key
  let secretKey: Uint8Array;
  let senderNpub: string;

  try {
    secretKey = decodeNsec(nostrNsec);
    senderNpub = getPublicKeyFromNsec(nostrNsec);
  } catch (error) {
    console.error('[Mint] ERROR: Failed to decode NOSTR_NSEC:', error);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Mint Tokens');
  console.log('='.repeat(60));
  console.log(`Recipient:  ${recipientNpub.slice(0, 20)}...${recipientNpub.slice(-8)}`);
  console.log(`Amount:     ${amount} ${tokenSymbol}`);
  console.log(`Chain:      ${chainName} (${chainId})`);
  console.log(`Token:      ${tokenAddress.slice(0, 10)}...${tokenAddress.slice(-8)}`);
  console.log('='.repeat(60));

  // Create payment request event
  const recipientAddress = '0x0000000000000000000000000000000000000000'; // Payment processor will resolve

  const event = createPaymentRequestEvent(secretKey, {
    recipientNpub,
    recipientAddress,
    senderNpub: 'system', // 'system' indicates this is a mint, not a transfer
    amount,
    tokenAddress,
    chainId,
    tokenSymbol,
    context: 'badge_claim', // Using badge_claim context for manual mints
    description: `Manual mint of ${amount} ${tokenSymbol} tokens`,
    method: 'mint',
  });

  console.log(`[Mint] Created payment request event: ${event.id.slice(0, 8)}...`);

  // Publish to relays using the shared publisher with NIP-42 auth
  console.log(`[Mint] Publishing to relays...`);
  const result = await publishNostrEvent(event, { secretKey });

  if (result.success) {
    console.log('[Mint] SUCCESS! Payment request published to:');
    for (const url of result.published) {
      console.log(`  - ${url}`);
    }
    console.log('');
    console.log('The payment processor will pick up this event and execute the mint.');
    console.log(`Event ID: ${event.id}`);
  } else {
    console.error('[Mint] FAILED: Could not publish to any relay');
    for (const failure of result.failed) {
      console.error(`  - ${failure.url}: ${failure.error}`);
    }
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('[Mint] Fatal error:', error);
  process.exit(1);
});
