#!/usr/bin/env npx ts-node
/**
 * Reset Data Script
 *
 * Deletes all data in the data/ directory (except preserved items).
 * Run with: npm run reset
 */

import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Files and directories to preserve during reset
const PRESERVED_ITEMS = new Set([
  'reserved_usernames.txt',
  'calendars',
]);

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function deleteDirectoryContents(dirPath: string): Promise<{ deleted: string[]; preserved: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const preserved: string[] = [];
  const errors: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip preserved items
      if (PRESERVED_ITEMS.has(entry.name)) {
        preserved.push(entry.name);
        continue;
      }

      try {
        if (entry.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true });
          deleted.push(entry.name);
        } else {
          await fs.unlink(fullPath);
          deleted.push(entry.name);
        }
      } catch (err) {
        errors.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { deleted, preserved, errors };
}

async function main() {
  console.log('\n🗑️  Reset Data Script\n');
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Preserved items: ${Array.from(PRESERVED_ITEMS).join(', ')}\n`);

  // Check if data directory exists
  try {
    await fs.access(DATA_DIR);
  } catch {
    console.log('Data directory does not exist. Nothing to delete.');
    process.exit(0);
  }

  // List contents
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  console.log('Current contents:');
  for (const entry of entries) {
    const icon = entry.isDirectory() ? '📁' : '📄';
    const preserved = PRESERVED_ITEMS.has(entry.name) ? ' (preserved)' : '';
    console.log(`  ${icon} ${entry.name}${preserved}`);
  }
  console.log('');

  // Confirm
  const shouldProceed = await confirm('Are you sure you want to delete all data? (y/N): ');
  if (!shouldProceed) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Delete
  console.log('\nDeleting...');
  const { deleted, preserved, errors } = await deleteDirectoryContents(DATA_DIR);

  // Report results
  console.log('');
  if (deleted.length > 0) {
    console.log(`✓ Deleted ${deleted.length} items:`);
    for (const item of deleted) {
      console.log(`  - ${item}`);
    }
  }

  if (preserved.length > 0) {
    console.log(`\n✓ Preserved ${preserved.length} items:`);
    for (const item of preserved) {
      console.log(`  - ${item}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n✗ Errors:`);
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log('\n✓ Reset complete!\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
