/**
 * File-based storage utilities for Open Source Village
 *
 * Directory structure:
 * data/
 *   npubs/:npub/
 *     profile.json      - User profile data
 *     metadata.json     - Badge/account metadata
 *     avatar.{ext}      - User avatar
 *     notifications.jsonl - User notifications
 *     nostr_events.jsonl  - Nostr events log
 *   badges/:serialNumber -> ../npubs/:npub (symlink after claim)
 *   usernames/:username -> ../npubs/:npub (symlink)
 *   logs/               - Server logs
 */

import fs from 'fs/promises';
import path from 'path';
import { UserProfile, StorageProfile } from '@/types';

export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Check if a file exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read file content as string
 */
export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write content to file
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Append content to file
 */
export async function appendFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.appendFile(filePath, content, 'utf-8');
}

/**
 * Ensure directory exists, create if not
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Read JSON file, return null if not found
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write JSON file atomically
 */
async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const content = JSON.stringify(data, null, 2);
  // Atomic write: write to temp file then rename
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}

/**
 * Append line to JSONL file
 */
export async function appendJsonLine(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const line = JSON.stringify(data) + '\n';
  await fs.appendFile(filePath, line, 'utf-8');
}

/**
 * Read all lines from JSONL file
 */
export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// ============================================================================
// Profile Management (npub-based)
// ============================================================================

/**
 * Get the npub directory path
 */
export function getNpubDir(npub: string): string {
  return path.join(getDataDir(), 'npubs', npub);
}

/**
 * Get profile by npub
 */
export async function getProfileByNpub(npub: string): Promise<StorageProfile | null> {
  const profilePath = path.join(getNpubDir(npub), 'profile.json');
  return readJsonFile<StorageProfile>(profilePath);
}

/**
 * Get profile by serial number (via symlink)
 */
export async function getProfileBySerialNumber(serialNumber: string): Promise<StorageProfile | null> {
  const badgePath = path.join(getDataDir(), 'badges', serialNumber);
  try {
    // Check if it's a symlink and resolve it
    const stats = await fs.lstat(badgePath);
    if (stats.isSymbolicLink()) {
      const targetPath = await fs.readlink(badgePath);
      const npubDir = path.resolve(path.dirname(badgePath), targetPath);
      const profilePath = path.join(npubDir, 'profile.json');
      return readJsonFile<StorageProfile>(profilePath);
    }
    // Legacy: direct directory (for unclaimed badges)
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Get profile by username (via symlink)
 */
export async function getProfileByUsername(username: string): Promise<StorageProfile | null> {
  const symlinkPath = path.join(getDataDir(), 'usernames', username.toLowerCase());
  try {
    const targetPath = await fs.readlink(symlinkPath);
    const npubDir = path.resolve(path.dirname(symlinkPath), targetPath);
    const profilePath = path.join(npubDir, 'profile.json');
    return readJsonFile<StorageProfile>(profilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Create a new profile
 *
 * Creates the npub directory and symlinks for badge and username
 */
export async function createProfile(
  serialNumber: string,
  username: string,
  npub: string,
  options?: {
    name?: string;
    invitedBy?: string;
  }
): Promise<StorageProfile> {
  // Check if username already exists
  const existing = await getProfileByUsername(username);
  if (existing) {
    throw new Error('Username already taken');
  }

  const profile: StorageProfile = {
    npub,
    username,
    serialNumber,
    profile: {
      npub,
      username,
      name: options?.name,
      invitedBy: options?.invitedBy,
      invitees: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    offers: [],
    rsvps: [],
    balance: {
      confirmed: 0,
      pending: 50, // Initial mint
      total: 50,
    },
  };

  // Create npub directory
  const npubDir = getNpubDir(npub);
  await ensureDir(npubDir);

  // Write profile
  const profilePath = path.join(npubDir, 'profile.json');
  await writeJsonFile(profilePath, profile);

  // Write metadata
  const metadata = {
    serialNumber,
    npub,
    username,
    setupAt: new Date().toISOString(),
    claimed: true,
    claimedAt: new Date().toISOString(),
  };
  const metadataPath = path.join(npubDir, 'metadata.json');
  await writeJsonFile(metadataPath, metadata);

  // Create username symlink -> npub directory
  const usernamesDir = path.join(getDataDir(), 'usernames');
  await ensureDir(usernamesDir);
  const usernameLinkPath = path.join(usernamesDir, username.toLowerCase());
  const relativeNpubPath = path.relative(usernamesDir, npubDir);
  await fs.symlink(relativeNpubPath, usernameLinkPath);

  // Create badge symlink -> npub directory
  const badgesDir = path.join(getDataDir(), 'badges');
  await ensureDir(badgesDir);
  const badgeLinkPath = path.join(badgesDir, serialNumber);
  const relativeBadgePath = path.relative(badgesDir, npubDir);

  // Remove existing badge directory if it exists (from setup)
  try {
    const stats = await fs.lstat(badgeLinkPath);
    if (stats.isDirectory()) {
      await fs.rm(badgeLinkPath, { recursive: true });
    } else if (stats.isSymbolicLink()) {
      await fs.unlink(badgeLinkPath);
    }
  } catch {
    // Doesn't exist, that's fine
  }
  await fs.symlink(relativeBadgePath, badgeLinkPath);

  return profile;
}

/**
 * Update an existing profile
 */
export async function updateProfile(
  npub: string,
  updates: Partial<UserProfile>
): Promise<StorageProfile> {
  const profile = await getProfileByNpub(npub);
  if (!profile) {
    throw new Error('Profile not found');
  }

  profile.profile = {
    ...profile.profile,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const profilePath = path.join(getNpubDir(npub), 'profile.json');
  await writeJsonFile(profilePath, profile);

  return profile;
}

// ============================================================================
// Badge Management (using whitelist.txt)
// ============================================================================

/**
 * Get path to the badge whitelist file
 */
function getWhitelistPath(): string {
  return path.join(getDataDir(), 'badges', 'whitelist.txt');
}

/**
 * Read all serial numbers from the whitelist
 */
async function readWhitelist(): Promise<Set<string>> {
  const whitelistPath = getWhitelistPath();
  try {
    const content = await fs.readFile(whitelistPath, 'utf-8');
    const serials = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    return new Set(serials);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set();
    }
    throw error;
  }
}

/**
 * Check if a badge serial number has been set up (is in the whitelist)
 */
export async function isBadgeSetup(serialNumber: string): Promise<boolean> {
  const whitelist = await readWhitelist();
  return whitelist.has(serialNumber);
}

/**
 * Check if a badge has been claimed
 */
export async function isBadgeClaimed(serialNumber: string): Promise<boolean> {
  const badgePath = path.join(getDataDir(), 'badges', serialNumber);
  try {
    const stats = await fs.lstat(badgePath);
    // If it's a symlink, it's been claimed
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Set up (activate) a badge
 * Adds the serial number to the whitelist file
 */
export async function setupBadge(serialNumber: string): Promise<{ alreadyExists: boolean }> {
  const whitelist = await readWhitelist();

  if (whitelist.has(serialNumber)) {
    return { alreadyExists: true };
  }

  // Ensure badges directory exists
  const badgesDir = path.join(getDataDir(), 'badges');
  await ensureDir(badgesDir);

  // Append serial number to whitelist
  const whitelistPath = getWhitelistPath();
  await fs.appendFile(whitelistPath, serialNumber + '\n', 'utf-8');

  return { alreadyExists: false };
}

// ============================================================================
// Blockchain Queue
// ============================================================================

interface QueuedOperation {
  type: 'transfer' | 'mint';
  from?: string;
  to: string;
  amount: number;
  createdAt?: string;
  status?: 'queued' | 'processing' | 'confirmed' | 'failed';
}

/**
 * Add an operation to the blockchain queue for a user
 * This is a placeholder - in production, this would emit a NOSTR payment request event
 */
export async function addToBlockchainQueue(
  npubOrSerial: string,
  operation: Omit<QueuedOperation, 'createdAt' | 'status'>
): Promise<void> {
  // Determine the npub directory
  let npubDir: string;
  if (npubOrSerial.startsWith('npub1')) {
    npubDir = getNpubDir(npubOrSerial);
  } else {
    // It's a serial number - try to resolve via symlink
    const badgePath = path.join(getDataDir(), 'badges', npubOrSerial);
    try {
      const stats = await fs.lstat(badgePath);
      if (stats.isSymbolicLink()) {
        const targetPath = await fs.readlink(badgePath);
        npubDir = path.resolve(path.dirname(badgePath), targetPath);
      } else {
        // Unclaimed badge, queue in badge directory
        npubDir = badgePath;
      }
    } catch {
      npubDir = badgePath;
    }
  }

  const queuePath = path.join(npubDir, 'queue.jsonl');
  const queuedOp: QueuedOperation = {
    ...operation,
    createdAt: new Date().toISOString(),
    status: 'queued',
  };
  await appendJsonLine(queuePath, queuedOp);

  console.log('[Storage] Queued blockchain operation:', {
    type: operation.type,
    from: operation.from,
    to: operation.to,
    amount: operation.amount,
  });
}

/**
 * Get queued blockchain operations for a user
 */
export async function getBlockchainQueue(npubOrSerial: string): Promise<QueuedOperation[]> {
  let npubDir: string;
  if (npubOrSerial.startsWith('npub1')) {
    npubDir = getNpubDir(npubOrSerial);
  } else {
    const badgePath = path.join(getDataDir(), 'badges', npubOrSerial);
    try {
      const stats = await fs.lstat(badgePath);
      if (stats.isSymbolicLink()) {
        const targetPath = await fs.readlink(badgePath);
        npubDir = path.resolve(path.dirname(badgePath), targetPath);
      } else {
        npubDir = badgePath;
      }
    } catch {
      npubDir = badgePath;
    }
  }

  const queuePath = path.join(npubDir, 'queue.jsonl');
  return readJsonLines<QueuedOperation>(queuePath);
}

// ============================================================================
// NOSTR Event Log
// ============================================================================

/**
 * Log a Nostr event for a user
 */
export async function logNostrEventForNpub(npub: string, event: unknown): Promise<void> {
  const logPath = path.join(getNpubDir(npub), 'nostr_events.jsonl');
  await appendJsonLine(logPath, event);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize data directories
 */
export async function initializeStorage(): Promise<void> {
  await ensureDir(path.join(getDataDir(), 'badges'));
  await ensureDir(path.join(getDataDir(), 'usernames'));
  await ensureDir(path.join(getDataDir(), 'npubs'));
  await ensureDir(path.join(getDataDir(), 'logs'));
}
