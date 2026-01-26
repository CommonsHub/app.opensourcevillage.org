/**
 * Tests for Token Balance Tracking
 */

import {
  calculatePendingBalance,
  calculateTotalBalance,
  formatBalance,
  hasSufficientBalance,
  createQueuedOperation,
  validateOperation,
  getUserOperations,
  getPendingOperations,
  getFailedOperations,
  formatOperationDescription,
  getOperationStatusColor,
  getOperationDirectionColor,
  TOKEN_ECONOMICS,
  QueuedOperation,
  TokenBalance
} from '../token-balance';

describe('Token Balance Utilities', () => {
  describe('TOKEN_ECONOMICS', () => {
    it('should have correct initial balance', () => {
      expect(TOKEN_ECONOMICS.INITIAL_BALANCE).toBe(50);
    });

    it('should have correct costs', () => {
      expect(TOKEN_ECONOMICS.OFFER_CREATION_COST).toBe(1);
      expect(TOKEN_ECONOMICS.RSVP_COST).toBe(1);
      expect(TOKEN_ECONOMICS.CLAIM_COST).toBe(1);
    });

    it('should have token symbol', () => {
      expect(TOKEN_ECONOMICS.TOKEN_SYMBOL).toBe('CHT');
    });
  });

  describe('calculatePendingBalance', () => {
    const npub = 'npub1alice';

    it('should return 0 for empty operations', () => {
      const pending = calculatePendingBalance(npub, []);
      expect(pending).toBe(0);
    });

    it('should calculate positive pending for incoming transfers', () => {
      const operations: QueuedOperation[] = [
        {
          id: 'op1',
          type: 'mint',
          to: npub,
          amount: 50,
          context: 'initial_mint',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];

      const pending = calculatePendingBalance(npub, operations);
      expect(pending).toBe(50);
    });

    it('should calculate negative pending for outgoing transfers', () => {
      const operations: QueuedOperation[] = [
        {
          id: 'op1',
          type: 'transfer',
          from: npub,
          to: 'npub1bob',
          amount: 5,
          context: 'tip',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];

      const pending = calculatePendingBalance(npub, operations);
      expect(pending).toBe(-5);
    });

    it('should ignore confirmed operations', () => {
      const operations: QueuedOperation[] = [
        {
          id: 'op1',
          type: 'mint',
          to: npub,
          amount: 50,
          context: 'initial_mint',
          status: 'confirmed',
          createdAt: new Date().toISOString()
        }
      ];

      const pending = calculatePendingBalance(npub, operations);
      expect(pending).toBe(0);
    });

    it('should ignore failed operations', () => {
      const operations: QueuedOperation[] = [
        {
          id: 'op1',
          type: 'transfer',
          from: npub,
          to: 'npub1bob',
          amount: 5,
          context: 'tip',
          status: 'failed',
          createdAt: new Date().toISOString()
        }
      ];

      const pending = calculatePendingBalance(npub, operations);
      expect(pending).toBe(0);
    });

    it('should calculate net pending with mixed operations', () => {
      const operations: QueuedOperation[] = [
        {
          id: 'op1',
          type: 'mint',
          to: npub,
          amount: 50,
          context: 'initial_mint',
          status: 'pending',
          createdAt: new Date().toISOString()
        },
        {
          id: 'op2',
          type: 'transfer',
          from: npub,
          to: 'npub1bob',
          amount: 5,
          context: 'tip',
          status: 'pending',
          createdAt: new Date().toISOString()
        },
        {
          id: 'op3',
          type: 'transfer',
          from: 'npub1charlie',
          to: npub,
          amount: 3,
          context: 'tip',
          status: 'processing',
          createdAt: new Date().toISOString()
        }
      ];

      const pending = calculatePendingBalance(npub, operations);
      expect(pending).toBe(48); // 50 - 5 + 3
    });
  });

  describe('calculateTotalBalance', () => {
    it('should calculate total balance', () => {
      const balance = calculateTotalBalance(47, 3);

      expect(balance.confirmed).toBe(47);
      expect(balance.pending).toBe(3);
      expect(balance.total).toBe(50);
      expect(balance.lastUpdated).toBeDefined();
    });

    it('should handle negative pending', () => {
      const balance = calculateTotalBalance(50, -5);

      expect(balance.total).toBe(45);
    });
  });

  describe('formatBalance', () => {
    it('should format balance without pending', () => {
      const balance: TokenBalance = {
        confirmed: 50,
        pending: 0,
        total: 50,
        lastUpdated: new Date().toISOString()
      };

      expect(formatBalance(balance)).toBe('50 CHT');
    });

    it('should format balance with positive pending', () => {
      const balance: TokenBalance = {
        confirmed: 47,
        pending: 3,
        total: 50,
        lastUpdated: new Date().toISOString()
      };

      expect(formatBalance(balance)).toBe('47 CHT (3 pending)');
    });

    it('should format balance with negative pending', () => {
      const balance: TokenBalance = {
        confirmed: 50,
        pending: -2,
        total: 48,
        lastUpdated: new Date().toISOString()
      };

      expect(formatBalance(balance)).toBe('50 CHT (-2 pending)');
    });

    it('should format without symbol when requested', () => {
      const balance: TokenBalance = {
        confirmed: 50,
        pending: 0,
        total: 50,
        lastUpdated: new Date().toISOString()
      };

      expect(formatBalance(balance, false)).toBe('50');
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true when balance is sufficient', () => {
      const balance: TokenBalance = {
        confirmed: 50,
        pending: 0,
        total: 50,
        lastUpdated: new Date().toISOString()
      };

      expect(hasSufficientBalance(balance, 10)).toBe(true);
      expect(hasSufficientBalance(balance, 50)).toBe(true);
    });

    it('should return false when balance is insufficient', () => {
      const balance: TokenBalance = {
        confirmed: 50,
        pending: 0,
        total: 50,
        lastUpdated: new Date().toISOString()
      };

      expect(hasSufficientBalance(balance, 51)).toBe(false);
    });

    it('should use total balance (includes pending)', () => {
      const balance: TokenBalance = {
        confirmed: 45,
        pending: 5,
        total: 50,
        lastUpdated: new Date().toISOString()
      };

      expect(hasSufficientBalance(balance, 50)).toBe(true);
    });
  });

  describe('createQueuedOperation', () => {
    it('should create mint operation', () => {
      const op = createQueuedOperation({
        type: 'mint',
        to: 'npub1alice',
        amount: 50,
        context: 'initial_mint'
      });

      expect(op.type).toBe('mint');
      expect(op.to).toBe('npub1alice');
      expect(op.amount).toBe(50);
      expect(op.context).toBe('initial_mint');
      expect(op.status).toBe('pending');
      expect(op.from).toBeUndefined();
      expect(op.id).toMatch(/^op_\d+_/);
    });

    it('should create transfer operation', () => {
      const op = createQueuedOperation({
        type: 'transfer',
        from: 'npub1alice',
        to: 'npub1bob',
        amount: 5,
        context: 'tip',
        metadata: { description: 'Thanks!' }
      });

      expect(op.type).toBe('transfer');
      expect(op.from).toBe('npub1alice');
      expect(op.to).toBe('npub1bob');
      expect(op.amount).toBe(5);
      expect(op.context).toBe('tip');
      expect(op.metadata?.description).toBe('Thanks!');
    });
  });

  describe('validateOperation', () => {
    const balance: TokenBalance = {
      confirmed: 50,
      pending: 0,
      total: 50,
      lastUpdated: new Date().toISOString()
    };

    it('should validate valid mint operation', () => {
      const op = createQueuedOperation({
        type: 'mint',
        to: 'npub1alice',
        amount: 50,
        context: 'initial_mint'
      });

      const result = validateOperation(op);
      expect(result.valid).toBe(true);
    });

    it('should reject zero amount', () => {
      const op = createQueuedOperation({
        type: 'mint',
        to: 'npub1alice',
        amount: 0,
        context: 'initial_mint'
      });

      const result = validateOperation(op);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('should reject invalid npub format', () => {
      const op = createQueuedOperation({
        type: 'mint',
        to: 'invalid',
        amount: 50,
        context: 'initial_mint'
      });

      const result = validateOperation(op);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('npub');
    });

    it('should reject mint with sender', () => {
      const op: QueuedOperation = {
        id: 'op1',
        type: 'mint',
        from: 'npub1alice',
        to: 'npub1bob',
        amount: 50,
        context: 'initial_mint',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      const result = validateOperation(op);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('should not have a sender');
    });

    it('should reject transfer without sender', () => {
      const op = createQueuedOperation({
        type: 'transfer',
        to: 'npub1bob',
        amount: 5,
        context: 'tip'
      });

      const result = validateOperation(op);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a sender');
    });

    it('should reject transfer with insufficient balance', () => {
      const op = createQueuedOperation({
        type: 'transfer',
        from: 'npub1alice',
        to: 'npub1bob',
        amount: 100,
        context: 'tip'
      });

      const result = validateOperation(op, balance);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });
  });

  describe('getUserOperations', () => {
    const npub = 'npub1alice';
    const operations: QueuedOperation[] = [
      {
        id: 'op1',
        type: 'mint',
        to: npub,
        amount: 50,
        context: 'initial_mint',
        status: 'confirmed',
        createdAt: '2026-01-20T10:00:00Z'
      },
      {
        id: 'op2',
        type: 'transfer',
        from: npub,
        to: 'npub1bob',
        amount: 5,
        context: 'tip',
        status: 'pending',
        createdAt: '2026-01-20T11:00:00Z'
      },
      {
        id: 'op3',
        type: 'transfer',
        from: 'npub1charlie',
        to: npub,
        amount: 3,
        context: 'tip',
        status: 'failed',
        createdAt: '2026-01-20T12:00:00Z'
      },
      {
        id: 'op4',
        type: 'transfer',
        from: 'npub1dave',
        to: 'npub1eve',
        amount: 2,
        context: 'tip',
        status: 'confirmed',
        createdAt: '2026-01-20T13:00:00Z'
      }
    ];

    it('should get all user operations', () => {
      const userOps = getUserOperations(npub, operations);

      expect(userOps).toHaveLength(3);
      expect(userOps.map(op => op.id)).toEqual(['op3', 'op2', 'op1']); // Sorted newest first
    });

    it('should filter by status', () => {
      const pending = getUserOperations(npub, operations, 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('op2');
    });

    it('should filter by multiple statuses', () => {
      const filtered = getUserOperations(npub, operations, ['pending', 'failed']);
      expect(filtered).toHaveLength(2);
    });
  });

  describe('getPendingOperations', () => {
    it('should get only pending and processing operations', () => {
      const operations: QueuedOperation[] = [
        {
          id: 'op1',
          type: 'mint',
          to: 'npub1alice',
          amount: 50,
          context: 'initial_mint',
          status: 'pending',
          createdAt: new Date().toISOString()
        },
        {
          id: 'op2',
          type: 'transfer',
          from: 'npub1alice',
          to: 'npub1bob',
          amount: 5,
          context: 'tip',
          status: 'processing',
          createdAt: new Date().toISOString()
        },
        {
          id: 'op3',
          type: 'transfer',
          from: 'npub1charlie',
          to: 'npub1alice',
          amount: 3,
          context: 'tip',
          status: 'confirmed',
          createdAt: new Date().toISOString()
        }
      ];

      const pending = getPendingOperations('npub1alice', operations);
      expect(pending).toHaveLength(2);
    });
  });

  describe('formatOperationDescription', () => {
    it('should format initial mint', () => {
      const op: QueuedOperation = {
        id: 'op1',
        type: 'mint',
        to: 'npub1alice',
        amount: 50,
        context: 'initial_mint',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      const desc = formatOperationDescription(op, 'npub1alice');
      expect(desc).toContain('Initial token mint');
      expect(desc).toContain('50');
    });

    it('should format outgoing RSVP', () => {
      const op: QueuedOperation = {
        id: 'op1',
        type: 'transfer',
        from: 'npub1alice',
        to: 'npub1bob',
        amount: 1,
        context: 'rsvp',
        status: 'pending',
        createdAt: new Date().toISOString(),
        metadata: { offerId: 'offer123' }
      };

      const desc = formatOperationDescription(op, 'npub1alice');
      expect(desc).toContain('RSVP');
    });

    it('should format incoming tip', () => {
      const op: QueuedOperation = {
        id: 'op1',
        type: 'transfer',
        from: 'npub1bob',
        to: 'npub1alice',
        amount: 5,
        context: 'tip',
        status: 'pending',
        createdAt: new Date().toISOString(),
        metadata: { description: 'Great workshop!' }
      };

      const desc = formatOperationDescription(op, 'npub1alice');
      expect(desc).toBe('Great workshop!');
    });
  });

  describe('getOperationStatusColor', () => {
    it('should return correct colors', () => {
      expect(getOperationStatusColor('pending')).toContain('yellow');
      expect(getOperationStatusColor('processing')).toContain('blue');
      expect(getOperationStatusColor('confirmed')).toContain('green');
      expect(getOperationStatusColor('failed')).toContain('red');
    });
  });

  describe('getOperationDirectionColor', () => {
    it('should return green for incoming', () => {
      const op: QueuedOperation = {
        id: 'op1',
        type: 'transfer',
        from: 'npub1bob',
        to: 'npub1alice',
        amount: 5,
        context: 'tip',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      const color = getOperationDirectionColor(op, 'npub1alice');
      expect(color).toContain('green');
    });

    it('should return red for outgoing', () => {
      const op: QueuedOperation = {
        id: 'op1',
        type: 'transfer',
        from: 'npub1alice',
        to: 'npub1bob',
        amount: 5,
        context: 'tip',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      const color = getOperationDirectionColor(op, 'npub1alice');
      expect(color).toContain('red');
    });
  });
});
