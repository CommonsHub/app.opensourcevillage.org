/**
 * Token Factory Integration Tests
 *
 * Tests for @opencollective/token-factory integration.
 * Uses the real token-factory package (no mocks).
 *
 * For full integration tests with a local chain:
 * 1. Start a local chain: npx hardhat node (or anvil)
 * 2. Set CHAIN=localhost and PRIVATE_KEY in .env
 * 3. Run: npm test tests/lib.tokenfactory.test.ts
 *
 * @jest-environment node
 */

import {
  Token,
  TokenFactory,
  MINTER_ROLE,
  isLocalhostRunning,
  areSafeContractsDeployed,
  ensureSafeContracts,
  SAFE_CANONICAL_ADDRESSES,
} from '@opencollective/token-factory';
import type { SupportedChain } from '@opencollective/token-factory';

// Test configuration
const TEST_CHAIN: SupportedChain = 'localhost';
const TEST_TOKEN_NAME = 'Test Community Token';
const TEST_TOKEN_SYMBOL = 'TCT';
const TEST_NPUB = 'npub1test1234567890abcdefghijklmnopqrstuvwxyz';
const MINT_AMOUNT = 50;

// Hardhat's first test account private key
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
// Second test account as backup (Safe requires 2 different owners, or we use single owner mode)
const TEST_BACKUP_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`;

// Helper to format token balance (6 decimals for BurnableToken)
function formatTokenBalance(balance: bigint): string {
  return (Number(balance) / 1e6).toFixed(2);
}

// Use the helper from token-factory
async function isLocalChainAvailable(): Promise<boolean> {
  return isLocalhostRunning();
}

describe('Token Factory Package Import', () => {
  it('should successfully import Token class', () => {
    expect(Token).toBeDefined();
    expect(typeof Token).toBe('function');
  });

  it('should successfully import TokenFactory class', () => {
    expect(TokenFactory).toBeDefined();
    expect(typeof TokenFactory).toBe('function'); // Class is a function
  });

  it('should successfully import MINTER_ROLE constant', () => {
    expect(MINTER_ROLE).toBeDefined();
    expect(MINTER_ROLE).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('should successfully import localhost helpers', () => {
    expect(isLocalhostRunning).toBeDefined();
    expect(typeof isLocalhostRunning).toBe('function');
    expect(areSafeContractsDeployed).toBeDefined();
    expect(typeof areSafeContractsDeployed).toBe('function');
    expect(ensureSafeContracts).toBeDefined();
    expect(typeof ensureSafeContracts).toBe('function');
  });

  it('should export Safe canonical addresses', () => {
    expect(SAFE_CANONICAL_ADDRESSES).toBeDefined();
    expect(SAFE_CANONICAL_ADDRESSES.SAFE_SINGLETON_ADDRESS).toBe('0x41675C099F32341bf84BFc5382aF534df5C7461a');
    expect(SAFE_CANONICAL_ADDRESSES.SAFE_PROXY_FACTORY_ADDRESS).toBe('0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67');
  });
});

describe('Token Class Instantiation', () => {
  it('should create a Token instance with correct options', () => {
    const token = new Token({
      name: TEST_TOKEN_NAME,
      symbol: TEST_TOKEN_SYMBOL,
      chain: TEST_CHAIN,
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    expect(token).toBeDefined();
    expect(token).toBeInstanceOf(Token);
  });

  it('should create Token with all supported chains', () => {
    const supportedChains: SupportedChain[] = ['localhost', 'gnosis', 'gnosis_chiado', 'base', 'base_sepolia'];

    supportedChains.forEach((chain) => {
      expect(() => {
        new Token({
          name: 'Test',
          symbol: 'TEST',
          chain,
          deployerPrivateKey: TEST_PRIVATE_KEY,
        });
      }).not.toThrow();
    });
  });
});

describe('User Address Generation', () => {
  // These tests set mock env variables for Safe address generation
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      PRIVATE_KEY: TEST_PRIVATE_KEY,
      // BACKUP_PRIVATE_KEY is optional, but we set it for completeness in tests
      BACKUP_PRIVATE_KEY: TEST_BACKUP_PRIVATE_KEY,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should generate deterministic wallet address for npub', () => {
    const token = new Token({
      name: TEST_TOKEN_NAME,
      symbol: TEST_TOKEN_SYMBOL,
      chain: TEST_CHAIN,
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    const walletAddress = token.getUserAddress('nostr', TEST_NPUB);

    expect(walletAddress).toBeDefined();
    expect(walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should return same address for same npub (deterministic)', () => {
    const token = new Token({
      name: TEST_TOKEN_NAME,
      symbol: TEST_TOKEN_SYMBOL,
      chain: TEST_CHAIN,
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    const address1 = token.getUserAddress('nostr', TEST_NPUB);
    const address2 = token.getUserAddress('nostr', TEST_NPUB);

    expect(address1).toBe(address2);
  });

  it('should generate different addresses for different npubs', () => {
    const token = new Token({
      name: TEST_TOKEN_NAME,
      symbol: TEST_TOKEN_SYMBOL,
      chain: TEST_CHAIN,
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    const npub1 = 'npub1aaaabbbbccccddddeeeeffffgggghhhhiiiijjjjkkkkllll';
    const npub2 = 'npub1zzzzyyyxxxwwwvvvuuutttsssrrrrqqqqppppoooonnnn';

    const address1 = token.getUserAddress('nostr', npub1);
    const address2 = token.getUserAddress('nostr', npub2);

    expect(address1).not.toBe(address2);
  });

  it('should generate valid addresses for different providers', () => {
    const token = new Token({
      name: 'Test',
      symbol: 'TEST',
      chain: 'localhost',
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    // Test different identifier formats
    const nostrAddress = token.getUserAddress('nostr', 'npub1test');
    const discordAddress = token.getUserAddress('discord', '123456789');
    const emailAddress = token.getUserAddress('email', 'test@example.com');

    expect(nostrAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(discordAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(emailAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // All should be different
    expect(nostrAddress).not.toBe(discordAddress);
    expect(discordAddress).not.toBe(emailAddress);
  });

  it('should generate deterministic addresses across Token instances', () => {
    const token1 = new Token({
      name: 'Test',
      symbol: 'TEST',
      chain: 'localhost',
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    const token2 = new Token({
      name: 'Test',
      symbol: 'TEST',
      chain: 'localhost',
      deployerPrivateKey: TEST_PRIVATE_KEY,
    });

    const address1 = token1.getUserAddress('nostr', 'npub1same');
    const address2 = token2.getUserAddress('nostr', 'npub1same');

    // Both should generate the same address for the same input
    expect(address1).toBe(address2);
  });
});

describe('Local Blockchain Integration Tests', () => {
  let chainAvailable = false;
  const originalEnv = process.env;

  beforeAll(async () => {
    chainAvailable = await isLocalChainAvailable();
    if (!chainAvailable) {
      console.log('Local chain not running - skipping blockchain tests. Start with: npx hardhat node');
    } else {
      console.log('Local chain available - running blockchain tests');
    }
    // Set env variables for Safe address generation (BACKUP_PRIVATE_KEY is optional)
    process.env = {
      ...originalEnv,
      PRIVATE_KEY: TEST_PRIVATE_KEY,
      BACKUP_PRIVATE_KEY: TEST_BACKUP_PRIVATE_KEY, // Optional, included for test completeness
      CHAIN: 'localhost',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should detect local chain availability', async () => {
    const available = await isLocalChainAvailable();
    expect(typeof available).toBe('boolean');
  });

  // Conditional tests that require a running local chain
  describe('Token Deployment (requires local chain)', () => {
    it('should deploy a token and return address', async () => {
      if (!chainAvailable) {
        console.log('Skipping: Local chain not available');
        return;
      }

      const token = new Token({
        name: TEST_TOKEN_NAME,
        symbol: TEST_TOKEN_SYMBOL,
        chain: TEST_CHAIN,
        deployerPrivateKey: TEST_PRIVATE_KEY,
      });

      const tokenAddress = await token.deployToken();

      expect(tokenAddress).toBeDefined();
      expect(tokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }, 60000); // 60s timeout for blockchain operations
  });

  describe('Token Minting (requires local chain and deployed token)', () => {
    it('should mint tokens to npub wallet', async () => {
      if (!chainAvailable) {
        console.log('Skipping: Local chain not available');
        return;
      }

      const token = new Token({
        name: TEST_TOKEN_NAME,
        symbol: TEST_TOKEN_SYMBOL,
        chain: TEST_CHAIN,
        deployerPrivateKey: TEST_PRIVATE_KEY,
      });

      // Deploy token first
      await token.deployToken();

      // Mint tokens
      const txHash = await token.mintTo(MINT_AMOUNT, `nostr:${TEST_NPUB}`);

      expect(txHash).toBeDefined();
      if (txHash) {
        expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      }
    }, 120000); // 120s timeout for deploy + mint

    it('should get balance for npub', async () => {
      if (!chainAvailable) {
        console.log('Skipping: Local chain not available');
        return;
      }

      const token = new Token({
        name: TEST_TOKEN_NAME,
        symbol: TEST_TOKEN_SYMBOL,
        chain: TEST_CHAIN,
        deployerPrivateKey: TEST_PRIVATE_KEY,
      });

      // Deploy and mint first
      await token.deployToken();
      await token.mintTo(MINT_AMOUNT, `nostr:${TEST_NPUB}`);

      // Get balance
      const balance = await token.getBalance(`nostr:${TEST_NPUB}`);
      const formattedBalance = formatTokenBalance(balance);

      expect(Number(formattedBalance)).toBeGreaterThanOrEqual(MINT_AMOUNT);
    }, 180000); // 180s timeout for deploy + mint + balance check
  });

  describe('Token Transfer (requires local chain with Safe contracts)', () => {
    const RECIPIENT_NPUB = 'npub1recipient1234567890abcdefghijklmnopqrst';
    const TRANSFER_AMOUNT = 10;

    it('should transfer tokens from one npub to another', async () => {
      if (!chainAvailable) {
        console.log('Skipping: Local chain not available');
        return;
      }

      // Check if Safe contracts are deployed, if not try to deploy them
      const safeDeployed = await areSafeContractsDeployed();
      if (!safeDeployed) {
        console.log('Safe contracts not deployed. Attempting to deploy...');
        try {
          const addresses = await ensureSafeContracts();
          console.log('Safe contracts deployed at:', addresses);
        } catch (err) {
          console.log('Could not deploy Safe contracts:', err);
          console.log('Skipping transfer test. To run this test:');
          console.log('  1. In token-factory: npm run localhost:setup');
          console.log('  2. Or use a testnet (gnosis_chiado, base_sepolia)');
          return;
        }
      }

      const token = new Token({
        name: TEST_TOKEN_NAME,
        symbol: TEST_TOKEN_SYMBOL,
        chain: TEST_CHAIN,
        deployerPrivateKey: TEST_PRIVATE_KEY,
      });

      // Deploy token first
      await token.deployToken();

      // Mint tokens to sender
      await token.mintTo(MINT_AMOUNT, `nostr:${TEST_NPUB}`);

      // Get initial balances
      const senderBalanceBefore = await token.getBalance(`nostr:${TEST_NPUB}`);
      const recipientBalanceBefore = await token.getBalance(`nostr:${RECIPIENT_NPUB}`);

      console.log(`Sender balance before: ${formatTokenBalance(senderBalanceBefore)}`);
      console.log(`Recipient balance before: ${formatTokenBalance(recipientBalanceBefore)}`);

      // Get the actual Safe addresses
      const senderAddress = token.getUserAddress('nostr', TEST_NPUB);
      const recipientAddress = token.getUserAddress('nostr', RECIPIENT_NPUB);
      console.log(`Sender Safe address: ${senderAddress}`);
      console.log(`Recipient Safe address: ${recipientAddress}`);

      // Transfer tokens from sender to recipient
      const txHash = await token.transfer(
        `nostr:${TEST_NPUB}`,
        `nostr:${RECIPIENT_NPUB}`,
        TRANSFER_AMOUNT,
      );

      console.log(`Transfer txHash: ${txHash}`);

      expect(txHash).toBeDefined();
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Verify balances after transfer
      const senderBalanceAfter = await token.getBalance(`nostr:${TEST_NPUB}`);
      const recipientBalanceAfter = await token.getBalance(`nostr:${RECIPIENT_NPUB}`);

      console.log(`Sender balance after: ${formatTokenBalance(senderBalanceAfter)}`);
      console.log(`Recipient balance after: ${formatTokenBalance(recipientBalanceAfter)}`);

      // Sender should have less tokens
      expect(senderBalanceAfter).toBeLessThan(senderBalanceBefore);

      // Recipient should have received the tokens
      const expectedRecipientBalance = recipientBalanceBefore + BigInt(TRANSFER_AMOUNT * 1e6);
      expect(recipientBalanceAfter).toBe(expectedRecipientBalance);
    }, 300000); // 5 min timeout for deploy + mint + transfer + balance checks
  });
});
