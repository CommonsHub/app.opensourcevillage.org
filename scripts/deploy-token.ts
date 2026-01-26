#!/usr/bin/env bun
/**
 * Deploy Token Script
 *
 * Deploys a new ERC-20 token contract and saves the address to settings.json.
 *
 * Usage:
 *   npm run deploy-token
 *   # or with custom name/symbol:
 *   npm run deploy-token "My Token" "MTK"
 *
 * Required environment variables:
 *   - PRIVATE_KEY: Deployer private key (0x... format)
 *   - CHAIN: Chain name (gnosis, gnosis_chiado, base, base_sepolia, localhost)
 *
 * The token address will be saved to settings.json
 */

// Load environment variables from .env.local or .env
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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

// Try .env.local first, then .env
if (!loadEnvFile('.env.local')) {
  loadEnvFile('.env');
}

import { deployToken, getChain, getWalletInfo } from '../src/lib/token-factory';

function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function waitForFunding(): Promise<boolean> {
  while (true) {
    const walletInfo = await getWalletInfo();

    console.log('');
    console.log('Wallet Information:');
    console.log(`  Address: ${walletInfo.address}`);
    console.log(`  Balance: ${walletInfo.balanceFormatted} ${walletInfo.nativeCurrency}`);
    console.log(`  Chain:   ${walletInfo.chainName} (${walletInfo.chain})`);
    console.log(`  Explorer: ${walletInfo.explorerUrl}`);
    console.log('');

    if (walletInfo.hasEnoughBalance) {
      console.log('Wallet has sufficient balance for deployment.');
      return true;
    }

    console.log(`Insufficient balance. Minimum required: 0.001 ${walletInfo.nativeCurrency}`);
    console.log('');
    console.log(`Please send ${walletInfo.nativeCurrency} to: ${walletInfo.address}`);
    console.log('');

    const choice = await ask('Options: (c)heck again, (s)kip token deployment', 'c');

    if (choice.toLowerCase() === 's' || choice.toLowerCase() === 'skip') {
      console.log('Skipping token deployment.');
      return false;
    }

    console.log('Checking balance again...');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Deploy Token');
  console.log('='.repeat(60));
  console.log('');

  // Check required environment variables
  const privateKey = process.env.PRIVATE_KEY;
  const chain = getChain();

  if (!privateKey) {
    console.error('ERROR: PRIVATE_KEY environment variable is required');
    console.error('Please set it in .env.local');
    process.exit(1);
  }

  console.log(`Chain: ${chain}`);

  // Check wallet balance before proceeding
  const canDeploy = await waitForFunding();
  if (!canDeploy) {
    process.exit(0);
  }

  // Get token name and symbol from args or prompt
  let tokenName = process.argv[2];
  let tokenSymbol = process.argv[3];

  if (!tokenName) {
    tokenName = await ask('Token name', 'Open Source Village Token');
  }

  if (!tokenSymbol) {
    tokenSymbol = await ask('Token symbol', 'OSV');
  }

  console.log('');
  console.log(`Deploying token: ${tokenName} (${tokenSymbol})`);
  console.log('');

  try {
    const result = await deployToken(tokenName, tokenSymbol);

    console.log('');
    console.log('='.repeat(60));
    console.log('Token Deployed Successfully!');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Address: ${result.address}`);
    console.log(`Name:    ${result.name}`);
    console.log(`Symbol:  ${result.symbol}`);
    console.log(`Chain:   ${result.chain}`);
    console.log('');
    console.log('The token address has been saved to settings.json');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Restart the payment processor to enable payments:');
    console.log('     sudo systemctl restart osv-payment-processor');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('Failed to deploy token:', error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
