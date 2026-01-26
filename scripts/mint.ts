#!/usr/bin/env bun
/**
 * Mint Tokens Script
 *
 * Mints tokens to a user by username or npub.
 *
 * Usage:
 *   bun run mint <username|npub> [amount]
 *   bun run mint alice 100
 *   bun run mint npub1abc... 50
 */

import * as fs from 'fs';
import * as path from 'path';
import { nip19 } from 'nostr-tools';

// Load environment variables
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
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    return true;
  }
  return false;
}

if (!loadEnvFile('.env.local')) {
  loadEnvFile('.env');
}

import { createPaymentRequestEvent, decodeNsec } from '../src/lib/nostr-events';
import { publishNostrEvent } from '../src/lib/nostr-publisher';
import { getWalletAddressForNpub } from '../src/lib/token-factory';
import settings from '../settings.json';

const CHAIN_NAME_TO_ID: Record<string, number> = {
  localhost: 31337,
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
};

const CHAIN_EXPLORERS: Record<number, string> = {
  31337: 'https://voltaire.tevm.sh',
  100: 'https://gnosisscan.io/address',
  10200: 'https://gnosis-chiado.blockscout.com/address',
  8453: 'https://basescan.org/address',
  84532: 'https://sepolia.basescan.org/address',
};

const NPUBS_DIR = path.join(process.cwd(), 'data', 'npubs');
const DEFAULT_AMOUNT = (settings as any).tokenEconomics?.initialBalance || 100;

async function resolveToNpub(recipient: string): Promise<{ npub: string; username?: string } | null> {
  if (recipient.startsWith('npub1')) {
    try {
      nip19.decode(recipient);
      return { npub: recipient };
    } catch {
      return null;
    }
  }

  // Look up username
  try {
    const entries = fs.readdirSync(NPUBS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('npub')) continue;
      const profilePath = path.join(NPUBS_DIR, entry.name, 'profile.json');
      try {
        const content = fs.readFileSync(profilePath, 'utf-8');
        const profile = JSON.parse(content);
        if (profile.username?.toLowerCase() === recipient.toLowerCase()) {
          return { npub: entry.name, username: profile.username };
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return null;
}

async function main() {
  const recipient = process.argv[2];
  const amount = parseFloat(process.argv[3] || String(DEFAULT_AMOUNT));

  if (!recipient || recipient === '--help' || recipient === '-h') {
    console.log(`
Mint Tokens Script

Usage:
  bun run mint <username|npub> [amount]

Arguments:
  username|npub  - Recipient's username or NOSTR public key
  amount         - Amount of tokens to mint (default: ${DEFAULT_AMOUNT})

Examples:
  bun run mint alice              # Mint ${DEFAULT_AMOUNT} tokens to alice
  bun run mint alice 100          # Mint 100 tokens to alice
  bun run mint npub1abc... 50     # Mint 50 tokens to npub
`);
    process.exit(0);
  }

  if (isNaN(amount) || amount <= 0) {
    console.error('Amount must be a positive number');
    process.exit(1);
  }

  // Resolve recipient
  console.log(`Resolving recipient: ${recipient}...`);
  const resolved = await resolveToNpub(recipient);
  if (!resolved) {
    console.error(`Could not find user: ${recipient}`);
    process.exit(1);
  }
  console.log(`Found: ${resolved.username || resolved.npub}`);

  // Check environment
  const nostrNsec = process.env.NOSTR_NSEC;
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const chainName = process.env.CHAIN || 'gnosis_chiado';
  const chainId = CHAIN_NAME_TO_ID[chainName];

  if (!nostrNsec) {
    console.error('NOSTR_NSEC environment variable is not set');
    process.exit(1);
  }

  if (!tokenAddress) {
    console.error('TOKEN_ADDRESS environment variable is not set');
    process.exit(1);
  }

  if (!chainId) {
    console.error(`Unknown chain: ${chainName}`);
    process.exit(1);
  }

  const tokenSymbol = process.env.TOKEN_SYMBOL || 'OSV';

  // Decode secret key
  let secretKey: Uint8Array;
  try {
    secretKey = decodeNsec(nostrNsec);
  } catch {
    console.error('Failed to decode NOSTR_NSEC');
    process.exit(1);
  }

  // Get wallet address
  console.log('Getting wallet address...');
  let walletAddress: string;
  try {
    walletAddress = await getWalletAddressForNpub(resolved.npub);
  } catch (error) {
    console.error('Failed to get wallet address:', error);
    process.exit(1);
  }

  // Create and publish event
  console.log('');
  console.log('='.repeat(50));
  console.log(`Minting ${amount} ${tokenSymbol}`);
  console.log('='.repeat(50));
  console.log(`Recipient: ${resolved.username || resolved.npub}`);
  console.log(`Wallet:    ${walletAddress}`);
  console.log(`Chain:     ${chainName}`);
  console.log('='.repeat(50));
  console.log('');

  const event = createPaymentRequestEvent(secretKey, {
    recipientNpub: resolved.npub,
    recipientAddress: walletAddress,
    senderNpub: 'system',
    amount,
    tokenAddress,
    chainId,
    tokenSymbol,
    context: 'badge_claim',
    description: `CLI mint of ${amount} ${tokenSymbol} tokens`,
    method: 'mint',
  });

  console.log('Publishing to relays...');
  const result = await publishNostrEvent(event, { secretKey });

  if (result.success) {
    const explorerUrl = CHAIN_EXPLORERS[chainId];
    console.log('');
    console.log('Mint request published successfully!');
    console.log(`  Event ID: ${event.id}`);
    console.log(`  Published to: ${result.published.join(', ')}`);
    if (explorerUrl) {
      console.log(`  Explorer: ${explorerUrl}/${walletAddress}`);
    }
    console.log('');
    console.log('The payment processor will process this request shortly.');
  } else {
    const errorDetail = result.failed.length > 0
      ? result.failed.map(f => `${f.url}: ${f.error}`).join('\n  ')
      : 'No relay accepted the event';
    console.error(`Failed to publish:\n  ${errorDetail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
