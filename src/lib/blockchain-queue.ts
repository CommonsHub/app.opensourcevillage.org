/**
 * Blockchain Queue Management
 *
 * Manages the queue of blockchain operations that need to be processed.
 * Operations are stored in JSONL files per user and processed by a background worker.
 *
 * @see specs/TECHNICAL_SPEC.md - Token Operations section
 */

import { exists, readFile, appendFile, writeFile } from './storage';
import {
  QueuedOperation,
  TokenBalance,
  calculatePendingBalance,
  calculateTotalBalance,
  validateOperation
} from './token-balance';

/**
 * Get the queue file path for a user
 *
 * @param npub - User's npub
 * @returns Queue file path
 */
export function getQueueFilePath(npub: string): string {
  return `profiles/${npub}/queue.jsonl`;
}

/**
 * Load all queued operations for a user
 *
 * @param npub - User's npub
 * @returns Array of queued operations
 */
export async function loadQueue(npub: string): Promise<QueuedOperation[]> {
  try {
    const queuePath = getQueueFilePath(npub);
    const queueExists = await exists(queuePath);

    if (!queueExists) {
      return [];
    }

    const data = await readFile(queuePath);
    if (!data) {
      return [];
    }

    // Parse JSONL format (one JSON object per line)
    const operations = data
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as QueuedOperation);

    return operations;
  } catch (error) {
    console.error(`Error loading queue for ${npub}:`, error);
    return [];
  }
}

/**
 * Add an operation to the queue
 *
 * Appends to the JSONL file (preserves history)
 *
 * @param npub - User's npub (queue owner)
 * @param operation - Operation to queue
 * @returns Updated operation with any modifications
 */
export async function queueOperation(
  npub: string,
  operation: QueuedOperation
): Promise<QueuedOperation> {
  try {
    const queuePath = getQueueFilePath(npub);

    // Append operation to JSONL file
    const line = JSON.stringify(operation) + '\n';
    await appendFile(queuePath, line);

    console.log(`Queued ${operation.type} operation for ${npub}:`, operation.id);
    return operation;
  } catch (error) {
    console.error(`Error queuing operation for ${npub}:`, error);
    throw new Error('Failed to queue operation');
  }
}

/**
 * Update an operation's status in the queue
 *
 * Note: JSONL format means we append the updated version.
 * When loading, we deduplicate by ID, keeping the latest version.
 *
 * @param npub - User's npub
 * @param operationId - Operation ID to update
 * @param updates - Fields to update
 * @returns Updated operation
 */
export async function updateOperation(
  npub: string,
  operationId: string,
  updates: Partial<QueuedOperation>
): Promise<QueuedOperation | null> {
  try {
    const operations = await loadQueue(npub);
    const operation = operations.find(op => op.id === operationId);

    if (!operation) {
      console.error(`Operation ${operationId} not found in queue for ${npub}`);
      return null;
    }

    // Create updated operation
    const updated: QueuedOperation = {
      ...operation,
      ...updates
    };

    // Append updated version to JSONL
    await queueOperation(npub, updated);

    console.log(`Updated operation ${operationId} for ${npub}`);
    return updated;
  } catch (error) {
    console.error(`Error updating operation ${operationId}:`, error);
    return null;
  }
}

/**
 * Get unique operations from queue (deduplicate by ID, keep latest)
 *
 * Since JSONL is append-only, we may have multiple versions of the same operation.
 * This function returns the latest version of each operation.
 *
 * @param operations - Raw operations from JSONL
 * @returns Deduplicated operations
 */
export function deduplicateOperations(operations: QueuedOperation[]): QueuedOperation[] {
  const operationsMap = new Map<string, QueuedOperation>();

  for (const op of operations) {
    const existing = operationsMap.get(op.id);

    // Keep the latest version (later in array = more recent)
    if (!existing || new Date(op.createdAt) >= new Date(existing.createdAt)) {
      operationsMap.set(op.id, op);
    }
  }

  return Array.from(operationsMap.values());
}

/**
 * Load deduplicated queue for a user
 *
 * @param npub - User's npub
 * @returns Deduplicated operations
 */
export async function loadDeduplicatedQueue(npub: string): Promise<QueuedOperation[]> {
  const operations = await loadQueue(npub);
  return deduplicateOperations(operations);
}

/**
 * Get user's balance from queue and simulated blockchain
 *
 * In production, this would query the actual Gnosis Chain.
 * For now, we calculate confirmed balance from confirmed operations.
 *
 * @param npub - User's npub
 * @returns Token balance
 */
export async function getUserBalance(npub: string): Promise<TokenBalance> {
  try {
    const operations = await loadDeduplicatedQueue(npub);

    // Calculate confirmed balance (sum of all confirmed operations)
    let confirmed = 0;

    for (const op of operations) {
      if (op.status === 'confirmed') {
        if (op.to === npub) {
          confirmed += op.amount;
        }
        if (op.from === npub) {
          confirmed -= op.amount;
        }
      }
    }

    // Calculate pending balance
    const pending = calculatePendingBalance(npub, operations);

    return calculateTotalBalance(confirmed, pending);
  } catch (error) {
    console.error(`Error getting balance for ${npub}:`, error);
    // Return zero balance on error
    return calculateTotalBalance(0, 0);
  }
}

/**
 * Get all operations involving a user (sent or received)
 *
 * This includes operations from other users' queues that involve this user.
 * In a full implementation, we'd need to scan all queues or maintain an index.
 *
 * For now, this only returns operations from the user's own queue.
 *
 * @param npub - User's npub
 * @returns All operations
 */
export async function getAllUserOperations(npub: string): Promise<QueuedOperation[]> {
  const operations = await loadDeduplicatedQueue(npub);
  return operations.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Clean up old confirmed operations from queue
 *
 * Removes operations older than 30 days that are confirmed.
 * Keeps failed and pending operations for manual review.
 *
 * @param npub - User's npub
 * @param daysToKeep - Number of days to keep (default: 30)
 * @returns Number of operations cleaned up
 */
export async function cleanupOldOperations(
  npub: string,
  daysToKeep: number = 30
): Promise<number> {
  try {
    const operations = await loadDeduplicatedQueue(npub);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Keep operations that are:
    // 1. Recent (within daysToKeep)
    // 2. Not confirmed (failed or pending need manual review)
    const toKeep = operations.filter(op => {
      const createdAt = new Date(op.createdAt);
      const isRecent = createdAt >= cutoffDate;
      const needsReview = op.status !== 'confirmed';

      return isRecent || needsReview;
    });

    const removedCount = operations.length - toKeep.length;

    if (removedCount > 0) {
      // Rewrite queue file with only operations to keep
      const queuePath = getQueueFilePath(npub);
      const content = toKeep.map(op => JSON.stringify(op)).join('\n') + '\n';
      await writeFile(queuePath, content);

      console.log(`Cleaned up ${removedCount} old operations for ${npub}`);
    }

    return removedCount;
  } catch (error) {
    console.error(`Error cleaning up operations for ${npub}:`, error);
    return 0;
  }
}

/**
 * Process pending operations (background worker logic)
 *
 * This is the core of the blockchain queue processor.
 * In production, this would:
 * 1. Find all pending operations
 * 2. Call token-factory API to execute transfers
 * 3. Wait for blockchain confirmation
 * 4. Update operation status
 *
 * For now, this is a simulation for testing.
 *
 * @param npub - User's npub (optional, processes all if not provided)
 * @returns Number of operations processed
 */
export async function processPendingOperations(npub?: string): Promise<number> {
  try {
    // In production, this would scan all users' queues
    // For now, we only process the specified user
    if (!npub) {
      console.log('processPendingOperations: npub required for simulation');
      return 0;
    }

    const operations = await loadDeduplicatedQueue(npub);
    const pending = operations.filter(op => op.status === 'pending');

    let processedCount = 0;

    for (const op of pending) {
      // Simulate: randomly succeed or fail
      const success = Math.random() > 0.1; // 90% success rate

      if (success) {
        // Simulate blockchain processing
        await updateOperation(npub, op.id, {
          status: 'processing',
          processedAt: new Date().toISOString()
        });

        // Simulate confirmation (in real implementation, wait for tx)
        const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;
        await updateOperation(npub, op.id, {
          status: 'confirmed',
          txHash
        });

        processedCount++;
        console.log(`Processed operation ${op.id}: ${txHash}`);
      } else {
        // Simulate failure
        await updateOperation(npub, op.id, {
          status: 'failed',
          error: 'Simulated blockchain error',
          processedAt: new Date().toISOString()
        });

        console.log(`Failed operation ${op.id}`);
      }
    }

    return processedCount;
  } catch (error) {
    console.error('Error processing pending operations:', error);
    return 0;
  }
}

/**
 * Retry a failed operation
 *
 * Resets the operation status to pending so it can be processed again.
 *
 * @param npub - User's npub
 * @param operationId - Operation ID to retry
 * @returns Updated operation
 */
export async function retryFailedOperation(
  npub: string,
  operationId: string
): Promise<QueuedOperation | null> {
  try {
    const operations = await loadDeduplicatedQueue(npub);
    const operation = operations.find(op => op.id === operationId);

    if (!operation) {
      console.error(`Operation ${operationId} not found`);
      return null;
    }

    if (operation.status !== 'failed') {
      console.error(`Operation ${operationId} is not failed (status: ${operation.status})`);
      return null;
    }

    // Reset to pending
    const updated = await updateOperation(npub, operationId, {
      status: 'pending',
      error: undefined,
      processedAt: undefined,
      txHash: undefined
    });

    console.log(`Retrying operation ${operationId}`);
    return updated;
  } catch (error) {
    console.error(`Error retrying operation ${operationId}:`, error);
    return null;
  }
}

/**
 * Get queue statistics for monitoring
 *
 * @param npub - User's npub
 * @returns Queue statistics
 */
export async function getQueueStats(npub: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  confirmed: number;
  failed: number;
  oldestPending?: string;  // ISO timestamp
  newestConfirmed?: string; // ISO timestamp
}> {
  const operations = await loadDeduplicatedQueue(npub);

  const stats = {
    total: operations.length,
    pending: 0,
    processing: 0,
    confirmed: 0,
    failed: 0,
    oldestPending: undefined as string | undefined,
    newestConfirmed: undefined as string | undefined
  };

  const pendingOps: QueuedOperation[] = [];
  const confirmedOps: QueuedOperation[] = [];

  for (const op of operations) {
    switch (op.status) {
      case 'pending':
        stats.pending++;
        pendingOps.push(op);
        break;
      case 'processing':
        stats.processing++;
        break;
      case 'confirmed':
        stats.confirmed++;
        confirmedOps.push(op);
        break;
      case 'failed':
        stats.failed++;
        break;
    }
  }

  // Find oldest pending
  if (pendingOps.length > 0) {
    pendingOps.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    stats.oldestPending = pendingOps[0].createdAt;
  }

  // Find newest confirmed
  if (confirmedOps.length > 0) {
    confirmedOps.sort((a, b) =>
      new Date(b.processedAt || b.createdAt).getTime() -
      new Date(a.processedAt || a.createdAt).getTime()
    );
    stats.newestConfirmed = confirmedOps[0].processedAt || confirmedOps[0].createdAt;
  }

  return stats;
}
