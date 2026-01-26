/**
 * Queue Management API
 *
 * GET /api/queue/[npub] - Get user's queued operations
 * POST /api/queue/[npub] - Add operation to queue
 * PATCH /api/queue/[npub] - Update operation status (retry failed)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadDeduplicatedQueue,
  queueOperation,
  retryFailedOperation,
  getQueueStats,
  getUserBalance
} from '@/lib/blockchain-queue';
import {
  createQueuedOperation,
  validateOperation,
  QueuedOperation
} from '@/lib/token-balance';

/**
 * GET /api/queue/[npub] - Get user's queued operations
 *
 * Query params:
 * - status: Filter by status (pending, processing, confirmed, failed)
 * - limit: Max number of operations to return (default: 50)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { npub: string } }
) {
  try {
    const npub = params.npub;

    // Validate npub
    if (!npub || !npub.startsWith('npub1')) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const statusFilter = searchParams.get('status') as QueuedOperation['status'] | null;
    const limit = parseInt(searchParams.get('limit') || '50');

    // Load operations
    let operations = await loadDeduplicatedQueue(npub);

    // Filter by status if requested
    if (statusFilter) {
      const validStatuses: QueuedOperation['status'][] = ['pending', 'processing', 'confirmed', 'failed'];
      if (!validStatuses.includes(statusFilter)) {
        return NextResponse.json(
          { success: false, error: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      operations = operations.filter(op => op.status === statusFilter);
    }

    // Apply limit
    operations = operations.slice(0, limit);

    // Get stats
    const stats = await getQueueStats(npub);

    return NextResponse.json({
      success: true,
      operations,
      stats,
      meta: {
        count: operations.length,
        filter: statusFilter || 'all',
        limit
      }
    });
  } catch (error) {
    console.error('Error getting queue:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/queue/[npub] - Add operation to queue
 *
 * Body:
 * {
 *   "type": "mint" | "transfer" | "refund",
 *   "from": "npub1..." (optional for mint),
 *   "to": "npub1...",
 *   "amount": 1,
 *   "context": "initial_mint" | "offer_creation" | "rsvp" | "offer_claim" | "tip" | "refund",
 *   "metadata": { ... } (optional)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { npub: string } }
) {
  try {
    const npub = params.npub;

    // Validate npub
    if (!npub || !npub.startsWith('npub1')) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Parse body
    const body = await request.json();

    // Create operation
    const operation = createQueuedOperation({
      type: body.type,
      from: body.from,
      to: body.to,
      amount: body.amount,
      context: body.context,
      metadata: body.metadata
    });

    // Get user balance for validation
    const balance = await getUserBalance(npub);

    // Validate operation
    const validation = validateOperation(operation, balance);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Queue operation
    const queued = await queueOperation(npub, operation);

    // Get updated balance
    const updatedBalance = await getUserBalance(npub);

    return NextResponse.json({
      success: true,
      operation: queued,
      balance: updatedBalance
    }, { status: 201 });
  } catch (error) {
    console.error('Error queuing operation:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to queue operation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/queue/[npub] - Update operation (retry failed)
 *
 * Body:
 * {
 *   "operationId": "op_123_abc",
 *   "action": "retry"
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { npub: string } }
) {
  try {
    const npub = params.npub;

    // Validate npub
    if (!npub || !npub.startsWith('npub1')) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Parse body
    const body = await request.json();
    const { operationId, action } = body;

    if (!operationId) {
      return NextResponse.json(
        { success: false, error: 'operationId is required' },
        { status: 400 }
      );
    }

    if (action !== 'retry') {
      return NextResponse.json(
        { success: false, error: 'Only "retry" action is supported' },
        { status: 400 }
      );
    }

    // Retry failed operation
    const updated = await retryFailedOperation(npub, operationId);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Operation not found or cannot be retried' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      operation: updated
    });
  } catch (error) {
    console.error('Error updating operation:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update operation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
