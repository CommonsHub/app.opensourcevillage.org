/**
 * Integration test: Payment Processor token operations
 *
 * Requires:
 * - Local blockchain running at http://127.0.0.1:8545
 * - PRIVATE_KEY env var (deployer private key with funds)
 * - TOKEN_ADDRESS env var or token deployed in settings.json
 *
 * What it tests:
 * - Token minting to an npub
 * - Token balance retrieval
 * - Token transfer between npubs
 *
 * @jest-environment node
 */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Token } from '@opencollective/token-factory';

const RPC_URL = 'http://127.0.0.1:8545';
const CHAIN_ID = 31337;

// Test npubs (these are valid npub format but don't need real keys for token operations)
const TEST_NPUB_1 = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsutf20';
const TEST_NPUB_2 = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqs9twa8e';

/**
 * Check if local blockchain is reachable
 */
async function isBlockchainReachable(): Promise<boolean> {
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
    });
    const data = await response.json();
    return data.result !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get token address from environment
 */
function getTokenAddress(): string | null {
  return process.env.TOKEN_ADDRESS || null;
}

// Check prerequisites
const HAS_PRIVATE_KEY = !!process.env.PRIVATE_KEY;

// We need to check blockchain and token in beforeAll, so use a flag
let BLOCKCHAIN_REACHABLE = false;
let TOKEN_ADDRESS: string | null = null;
let SHOULD_RUN_TESTS = false;

// Use describe.skip if prerequisites aren't met - we'll check in beforeAll
const testSuite = describe;

testSuite('Payment Processor Token Operations', () => {
  jest.setTimeout(60_000); // Token operations can take time

  let token: Token;
  let deployerAddress: string;

  beforeAll(async () => {
    // Check blockchain connectivity
    BLOCKCHAIN_REACHABLE = await isBlockchainReachable();
    TOKEN_ADDRESS = getTokenAddress();

    SHOULD_RUN_TESTS = HAS_PRIVATE_KEY && BLOCKCHAIN_REACHABLE && !!TOKEN_ADDRESS;

    if (!SHOULD_RUN_TESTS) {
      const reasons: string[] = [];
      if (!HAS_PRIVATE_KEY) reasons.push('PRIVATE_KEY env var is not set');
      if (!BLOCKCHAIN_REACHABLE) reasons.push(`blockchain not reachable at ${RPC_URL}`);
      if (!TOKEN_ADDRESS) reasons.push('TOKEN_ADDRESS not configured');
      console.warn(`[paymentprocessor.test] Skipping tests: ${reasons.join('; ')}`);
      return;
    }

    // Initialize token instance
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;

    token = new Token({
      name: 'Test Token',
      symbol: 'TEST',
      chain: 'localhost',
      deployerPrivateKey: privateKey,
      tokenAddress: TOKEN_ADDRESS as `0x${string}`,
    });

    // Get deployer address for logging
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);
    deployerAddress = wallet.address;

    console.log('[Test] Token address:', TOKEN_ADDRESS);
    console.log('[Test] Deployer address:', deployerAddress);
  });

  describe('Mint Operations', () => {
    it('can mint tokens to an npub', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      const amount = 100; // 100 tokens
      console.log(`[Test] Minting ${amount} tokens to ${TEST_NPUB_1.slice(0, 20)}...`);

      const txHash = await token.mintTo(amount, `nostr:${TEST_NPUB_1}`);

      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      console.log('[Test] Mint transaction hash:', txHash);
    });

    it('can mint tokens to a second npub', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      const amount = 50;
      console.log(`[Test] Minting ${amount} tokens to ${TEST_NPUB_2.slice(0, 20)}...`);

      const txHash = await token.mintTo(amount, `nostr:${TEST_NPUB_2}`);

      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      console.log('[Test] Mint transaction hash:', txHash);
    });
  });

  describe('Balance Operations', () => {
    it('can get balance for an npub', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      console.log(`[Test] Getting balance for ${TEST_NPUB_1.slice(0, 20)}...`);

      const balance = await token.getBalance(`nostr:${TEST_NPUB_1}`);

      expect(balance).toBeDefined();
      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThan(BigInt(0));

      // Convert to human-readable (assuming 6 decimals)
      const balanceInTokens = Number(balance) / 1e6;
      console.log('[Test] Balance:', balanceInTokens, 'tokens');
    });

    it('can get balance for second npub', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      const balance = await token.getBalance(`nostr:${TEST_NPUB_2}`);

      expect(balance).toBeDefined();
      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThan(BigInt(0));

      const balanceInTokens = Number(balance) / 1e6;
      console.log('[Test] Balance for npub2:', balanceInTokens, 'tokens');
    });

    it('returns zero balance for npub with no tokens', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      // Use a random npub that hasn't received tokens
      const emptyNpub = 'npub1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyq7znk2';

      const balance = await token.getBalance(`nostr:${emptyNpub}`);

      expect(balance).toBeDefined();
      expect(balance).toBe(BigInt(0));
      console.log('[Test] Empty npub balance:', balance.toString());
    });
  });

  describe('Transfer Operations', () => {
    it('can transfer tokens between npubs', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      // Get initial balances
      const initialBalance1 = await token.getBalance(`nostr:${TEST_NPUB_1}`);
      const initialBalance2 = await token.getBalance(`nostr:${TEST_NPUB_2}`);

      console.log('[Test] Initial balances:');
      console.log('  npub1:', Number(initialBalance1) / 1e6, 'tokens');
      console.log('  npub2:', Number(initialBalance2) / 1e6, 'tokens');

      // Transfer 10 tokens from npub1 to npub2
      const transferAmount = 10;
      console.log(`[Test] Transferring ${transferAmount} tokens from npub1 to npub2...`);

      const txHash = await token.transfer(
        `nostr:${TEST_NPUB_1}`,
        `nostr:${TEST_NPUB_2}`,
        transferAmount
      );

      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      console.log('[Test] Transfer transaction hash:', txHash);

      // Verify balances changed correctly
      const finalBalance1 = await token.getBalance(`nostr:${TEST_NPUB_1}`);
      const finalBalance2 = await token.getBalance(`nostr:${TEST_NPUB_2}`);

      console.log('[Test] Final balances:');
      console.log('  npub1:', Number(finalBalance1) / 1e6, 'tokens');
      console.log('  npub2:', Number(finalBalance2) / 1e6, 'tokens');

      // Check balances (accounting for 6 decimals)
      const expectedDecrease = BigInt(transferAmount * 1e6);
      expect(finalBalance1).toBe(initialBalance1 - expectedDecrease);
      expect(finalBalance2).toBe(initialBalance2 + expectedDecrease);
    });

    it('fails to transfer more tokens than available', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      // Try to transfer a huge amount that exceeds balance
      const hugeAmount = 999999999;

      console.log(`[Test] Attempting to transfer ${hugeAmount} tokens (should fail)...`);

      await expect(
        token.transfer(`nostr:${TEST_NPUB_1}`, `nostr:${TEST_NPUB_2}`, hugeAmount)
      ).rejects.toThrow();

      console.log('[Test] Transfer correctly rejected due to insufficient balance');
    });
  });

  describe('User Address Resolution', () => {
    it('can get wallet address for an npub', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      const address = token.getUserAddress('nostr', TEST_NPUB_1);

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      console.log('[Test] Wallet address for npub1:', address);
    });

    it('returns consistent address for same npub', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      const address1 = token.getUserAddress('nostr', TEST_NPUB_1);
      const address2 = token.getUserAddress('nostr', TEST_NPUB_1);

      expect(address1).toBe(address2);
      console.log('[Test] Address is deterministic and consistent');
    });

    it('returns different addresses for different npubs', async () => {
      if (!SHOULD_RUN_TESTS) {
        console.log('[Test] Skipping - prerequisites not met');
        return;
      }

      const address1 = token.getUserAddress('nostr', TEST_NPUB_1);
      const address2 = token.getUserAddress('nostr', TEST_NPUB_2);

      expect(address1).not.toBe(address2);
      console.log('[Test] Different npubs get different addresses');
    });
  });
});
