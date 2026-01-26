/**
 * Tests for rate limiting utilities
 */

import {
  checkRateLimit,
  clearRateLimit,
  clearAllRateLimits,
  getRateLimitStatus,
  getClientIdentifier,
  withRateLimit,
  RateLimitPresets,
} from '../rate-limit';

// Helper to wait for specified milliseconds
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear all rate limits before each test
    clearAllRateLimits();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const result1 = checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBeGreaterThanOrEqual(2);

      const result2 = checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBeGreaterThanOrEqual(1);

      const result3 = checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should block requests exceeding limit', () => {
      // Make 3 requests (maxRequests = 3)
      checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });
      checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });
      checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });

      // 4th request should be blocked
      const result = checkRateLimit('test-client', { maxRequests: 3, windowMs: 60000 });
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.remaining).toBe(0);
    });

    it('should track different clients independently', () => {
      const result1 = checkRateLimit('client-1', { maxRequests: 2, windowMs: 60000 });
      expect(result1.allowed).toBe(true);

      const result2 = checkRateLimit('client-2', { maxRequests: 2, windowMs: 60000 });
      expect(result2.allowed).toBe(true);

      // Both clients should have independent limits
      checkRateLimit('client-1', { maxRequests: 2, windowMs: 60000 });
      checkRateLimit('client-2', { maxRequests: 2, windowMs: 60000 });

      // Both should be blocked after using their tokens
      const result3 = checkRateLimit('client-1', { maxRequests: 2, windowMs: 60000 });
      expect(result3.allowed).toBe(false);

      const result4 = checkRateLimit('client-2', { maxRequests: 2, windowMs: 60000 });
      expect(result4.allowed).toBe(false);
    });

    it('should skip rate limiting when skip function returns true', () => {
      const config = {
        maxRequests: 1,
        windowMs: 60000,
        skip: (id: string) => id === 'admin',
      };

      // Admin should never be rate limited
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit('admin', config);
        expect(result.allowed).toBe(true);
      }

      // Regular user should be rate limited
      checkRateLimit('regular-user', config);
      const result = checkRateLimit('regular-user', config);
      expect(result.allowed).toBe(false);
    });

    it('should use default config when not provided', () => {
      // Default is 10 requests per minute
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit('test-client');
        expect(result.allowed).toBe(true);
      }

      const result = checkRateLimit('test-client');
      expect(result.allowed).toBe(false);
    });

    it('should refill tokens over time', async () => {
      // Use a very short window for testing (100ms with 2 max requests)
      const config = { maxRequests: 2, windowMs: 100 };

      // Consume all tokens
      checkRateLimit('test-client', config);
      checkRateLimit('test-client', config);

      // Should be blocked
      let result = checkRateLimit('test-client', config);
      expect(result.allowed).toBe(false);

      // Wait for tokens to refill (100ms = full refill)
      await wait(120);

      // Should be allowed again after refill
      result = checkRateLimit('test-client', config);
      expect(result.allowed).toBe(true);
    });

    it('should provide accurate retryAfter time', () => {
      const config = { maxRequests: 1, windowMs: 60000 };

      // Consume token
      checkRateLimit('test-client', config);

      // Check retry time
      const result = checkRateLimit('test-client', config);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60000);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit for specific client', () => {
      // Block client
      checkRateLimit('test-client', { maxRequests: 1, windowMs: 60000 });
      let result = checkRateLimit('test-client', { maxRequests: 1, windowMs: 60000 });
      expect(result.allowed).toBe(false);

      // Clear and retry
      clearRateLimit('test-client');
      result = checkRateLimit('test-client', { maxRequests: 1, windowMs: 60000 });
      expect(result.allowed).toBe(true);
    });

    it('should not affect other clients', () => {
      // Block both clients
      checkRateLimit('client-1', { maxRequests: 1, windowMs: 60000 });
      checkRateLimit('client-2', { maxRequests: 1, windowMs: 60000 });

      // Clear only client-1
      clearRateLimit('client-1');

      // client-1 should be allowed, client-2 still blocked
      const result1 = checkRateLimit('client-1', { maxRequests: 1, windowMs: 60000 });
      expect(result1.allowed).toBe(true);

      const result2 = checkRateLimit('client-2', { maxRequests: 1, windowMs: 60000 });
      expect(result2.allowed).toBe(false);
    });
  });

  describe('clearAllRateLimits', () => {
    it('should clear all rate limit data', () => {
      // Block multiple clients
      checkRateLimit('client-1', { maxRequests: 1, windowMs: 60000 });
      checkRateLimit('client-2', { maxRequests: 1, windowMs: 60000 });
      checkRateLimit('client-3', { maxRequests: 1, windowMs: 60000 });

      // All should be blocked
      expect(checkRateLimit('client-1', { maxRequests: 1, windowMs: 60000 }).allowed).toBe(false);
      expect(checkRateLimit('client-2', { maxRequests: 1, windowMs: 60000 }).allowed).toBe(false);
      expect(checkRateLimit('client-3', { maxRequests: 1, windowMs: 60000 }).allowed).toBe(false);

      // Clear all
      clearAllRateLimits();

      // All should be allowed again
      expect(checkRateLimit('client-1', { maxRequests: 1, windowMs: 60000 }).allowed).toBe(true);
      expect(checkRateLimit('client-2', { maxRequests: 1, windowMs: 60000 }).allowed).toBe(true);
      expect(checkRateLimit('client-3', { maxRequests: 1, windowMs: 60000 }).allowed).toBe(true);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for new client', () => {
      const status = getRateLimitStatus('new-client', { maxRequests: 10, windowMs: 60000 });

      expect(status.tokens).toBe(10);
      expect(status.maxTokens).toBe(10);
      expect(status.resetIn).toBe(0);
    });

    it('should return accurate status for existing client', () => {
      const config = { maxRequests: 5, windowMs: 60000 };

      // Consume 3 tokens
      checkRateLimit('test-client', config);
      checkRateLimit('test-client', config);
      checkRateLimit('test-client', config);

      const status = getRateLimitStatus('test-client', config);

      expect(status.tokens).toBeGreaterThanOrEqual(1);
      expect(status.tokens).toBeLessThanOrEqual(2);
      expect(status.maxTokens).toBe(5);
    });

    it('should show reset time when tokens exhausted', () => {
      const config = { maxRequests: 1, windowMs: 60000 };

      // Consume all tokens
      checkRateLimit('test-client', config);
      checkRateLimit('test-client', config);

      const status = getRateLimitStatus('test-client', config);

      expect(status.tokens).toBe(0);
      expect(status.resetIn).toBeGreaterThan(0);
    });
  });

  describe('getClientIdentifier', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost:3000', {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = new Request('http://localhost:3000', {
        headers: { 'x-real-ip': '192.168.1.100' },
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('192.168.1.100');
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const request = new Request('http://localhost:3000', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-real-ip': '192.168.1.100',
        },
      });

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('192.168.1.1');
    });

    it('should return fallback when no IP headers present', () => {
      const request = new Request('http://localhost:3000');

      const identifier = getClientIdentifier(request);
      expect(identifier).toBe('unknown');
    });
  });

  describe('withRateLimit middleware', () => {
    it('should allow requests within limit', async () => {
      const handler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const rateLimitedHandler = withRateLimit(handler, {
        maxRequests: 2,
        windowMs: 60000,
      });

      const request = new Request('http://localhost:3000', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });

      // First request should succeed
      const response1 = await rateLimitedHandler(request);
      expect(response1.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second request should succeed
      const response2 = await rateLimitedHandler(request);
      expect(response2.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should block requests exceeding limit', async () => {
      const handler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const rateLimitedHandler = withRateLimit(handler, {
        maxRequests: 1,
        windowMs: 60000,
        message: 'Custom rate limit message',
      });

      const request = new Request('http://localhost:3000', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });

      // First request should succeed
      await rateLimitedHandler(request);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second request should be blocked
      const response = await rateLimitedHandler(request);
      expect(response.status).toBe(429);

      const data = await response.json();
      expect(data.error).toBe('Custom rate limit message');

      // Handler should not be called again
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should include rate limit headers in response', async () => {
      const handler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const rateLimitedHandler = withRateLimit(handler, {
        maxRequests: 10,
        windowMs: 60000,
      });

      const request = new Request('http://localhost:3000', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });

      const response = await rateLimitedHandler(request);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });

    it('should include Retry-After header when blocked', async () => {
      const handler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const rateLimitedHandler = withRateLimit(handler, {
        maxRequests: 1,
        windowMs: 60000,
      });

      const request = new Request('http://localhost:3000', {
        headers: { 'x-real-ip': '192.168.1.1' },
      });

      // Consume token
      await rateLimitedHandler(request);

      // Get blocked response
      const response = await rateLimitedHandler(request);
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeDefined();
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    });
  });

  describe('RateLimitPresets', () => {
    it('should have STRICT preset', () => {
      expect(RateLimitPresets.STRICT).toBeDefined();
      expect(RateLimitPresets.STRICT.maxRequests).toBe(5);
      expect(RateLimitPresets.STRICT.windowMs).toBe(60000);
    });

    it('should have MODERATE preset', () => {
      expect(RateLimitPresets.MODERATE).toBeDefined();
      expect(RateLimitPresets.MODERATE.maxRequests).toBe(30);
    });

    it('should have RELAXED preset', () => {
      expect(RateLimitPresets.RELAXED).toBeDefined();
      expect(RateLimitPresets.RELAXED.maxRequests).toBe(100);
    });

    it('should have VERY_STRICT preset', () => {
      expect(RateLimitPresets.VERY_STRICT).toBeDefined();
      expect(RateLimitPresets.VERY_STRICT.maxRequests).toBe(2);
    });

    it('STRICT preset should work correctly', () => {
      const config = RateLimitPresets.STRICT;

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit('test-strict', config);
        expect(result.allowed).toBe(true);
      }

      // 6th request should be blocked
      const result = checkRateLimit('test-strict', config);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Token Bucket behavior', () => {
    it('should gradually refill tokens', async () => {
      // Use short window for testing: 2 tokens per 200ms = 1 token per 100ms
      const config = { maxRequests: 2, windowMs: 200 };

      // Consume all tokens
      checkRateLimit('test-client', config);
      checkRateLimit('test-client', config);

      // Should be blocked
      expect(checkRateLimit('test-client', config).allowed).toBe(false);

      // Wait for 1 token to refill (100ms)
      await wait(120);

      // Should have 1 token now
      expect(checkRateLimit('test-client', config).allowed).toBe(true);

      // Should be blocked again
      expect(checkRateLimit('test-client', config).allowed).toBe(false);

      // Wait for another token
      await wait(120);

      // Should have 1 token again
      expect(checkRateLimit('test-client', config).allowed).toBe(true);
    });

    it('should not exceed max tokens', async () => {
      const config = { maxRequests: 3, windowMs: 100 };

      // Wait long enough to fully refill
      await wait(150);

      // Should still only have max tokens (3)
      expect(checkRateLimit('test-client', config).allowed).toBe(true);
      expect(checkRateLimit('test-client', config).allowed).toBe(true);
      expect(checkRateLimit('test-client', config).allowed).toBe(true);
      expect(checkRateLimit('test-client', config).allowed).toBe(false);
    });
  });
});
