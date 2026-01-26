#!/usr/bin/env bun
/**
 * Generate cryptographic keys for Open Source Village
 * Outputs JSON with all generated keys and derived addresses
 */

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { privateKeyToAccount } from 'viem/accounts';

// Generate NOSTR keys
const nostrSecretKey = generateSecretKey();
const nostrPubkey = getPublicKey(nostrSecretKey);
const nsec = nip19.nsecEncode(nostrSecretKey);
const npub = nip19.npubEncode(nostrPubkey);

// Generate Ethereum keys
const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
const privateKey = '0x' + Buffer.from(privateKeyBytes).toString('hex');
const account = privateKeyToAccount(privateKey as `0x${string}`);

// Generate backup Ethereum key
const backupPrivateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
const backupPrivateKey = '0x' + Buffer.from(backupPrivateKeyBytes).toString('hex');
const backupAccount = privateKeyToAccount(backupPrivateKey as `0x${string}`);

// Generate webhook secret
const webhookSecretBytes = crypto.getRandomValues(new Uint8Array(32));
const webhookSecret = Buffer.from(webhookSecretBytes).toString('hex');

// Output as JSON
const output = {
  nostr: {
    nsec,
    npub,
  },
  ethereum: {
    privateKey,
    address: account.address,
  },
  backup: {
    privateKey: backupPrivateKey,
    address: backupAccount.address,
  },
  webhookSecret,
};

console.log(JSON.stringify(output, null, 2));
