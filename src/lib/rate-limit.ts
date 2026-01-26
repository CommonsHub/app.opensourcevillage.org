/**
 * Rate limiting utilities for API endpoints
 * Implements token bucket algorithm for request throttling
 */

interface RateLimitStore {
  [key: string]: {
    tokens: number;
    lastRefill: number;
  };
}

// In-memory storage for rate limit data
// In production, use Redis or similar distributed cache
const rateLimitStore: RateLimitStore = {};

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed per window
   * @default 10
   */
  maxRequests?: number;

  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Message to return when rate limit is exceeded
   * @default "Too many requests, please try again later"
   */
  message?: string;

  /**
   * Skip rate limiting based on a condition
   * Useful for allowing localhost or admin users
   */
  skip?: (identifier: string) => boolean;
}

/**
 * Token bucket implementation for rate limiting
 * Tokens refill gradually over time rather than resetting abruptly
 */
class TokenBucket {
  private maxTokens: number;
  private refillRate: number; // tokens per millisecond
  private _tokens: number;
  private _lastRefill: number;

  constructor(maxTokens: number, windowMs: number, initialTokens?: number, initialLastRefill?: number) {
    this.maxTokens = maxTokens;
    this.refillRate = maxTokens / windowMs;
    this._tokens = initialTokens ?? maxTokens;
    this._lastRefill = initialLastRefill ?? Date.now();
  }

  /**
   * Get current state for storage
   */
  getState(): { tokens: number; lastRefill: number } {
    return { tokens: this._tokens, lastRefill: this._lastRefill };
  }

  /**
   * Try to consume a token
   * @returns true if token was consumed, false if bucket is empty
   */
  consume(): boolean {
    this.refill();

    if (this._tokens >= 1) {
      this._tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this._tokens = Math.min(this.maxTokens, this._tokens + tokensToAdd);
    this._lastRefill = now;
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this._tokens;
  }

  /**
   * Get time until next token is available (in ms)
   */
  getRetryAfter(): number {
    if (this._tokens >= 1) return 0;
    return Math.ceil((1 - this._tokens) / this.refillRate);
  }
}

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier for the client (IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Object with allowed status and retry info
 *
 * @example
 * ```typescript
 * const { allowed, retryAfter } = checkRateLimit(clientIp, {
 *   maxRequests: 10,
 *   windowMs: 60000, // 1 minute
 * });
 *
 * if (!allowed) {
 *   return NextResponse.json(
 *     { error: 'Too many requests' },
 *     {
 *       status: 429,
 *       headers: { 'Retry-After': String(Math.ceil(retryAfter / 1000)) }
 *     }
 *   );
 * }
 * ```
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = {}
): { allowed: boolean; retryAfter: number; remaining: number } {
  const {
    maxRequests = 10,
    windowMs = 60000,
    skip,
  } = config;

  // Skip rate limiting if configured
  if (skip && skip(identifier)) {
    return { allowed: true, retryAfter: 0, remaining: maxRequests };
  }

  // Get or create token bucket for this identifier
  if (!rateLimitStore[identifier]) {
    rateLimitStore[identifier] = {
      tokens: maxRequests,
      lastRefill: Date.now(),
    };
  }

  const bucket = new TokenBucket(
    maxRequests,
    windowMs,
    rateLimitStore[identifier].tokens,
    rateLimitStore[identifier].lastRefill
  );

  const allowed = bucket.consume();

  // Update store
  rateLimitStore[identifier] = bucket.getState();

  return {
    allowed,
    retryAfter: allowed ? 0 : bucket.getRetryAfter(),
    remaining: Math.floor(bucket.getTokens()),
  };
}

/**
 * Get client identifier from request
 * Uses IP address as identifier
 *
 * @param request - Next.js request object
 * @returns Client identifier string
 */
export function getClientIdentifier(request: Request): string {
  // Try to get real IP from headers (for reverse proxies)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a generic identifier
  // In production, this should be more sophisticated
  return 'unknown';
}

/**
 * Create a rate limit middleware for API routes
 *
 * @param config - Rate limit configuration
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * import { withRateLimit } from '@/lib/rate-limit';
 *
 * export const POST = withRateLimit(
 *   async (request: NextRequest) => {
 *     // Your API logic here
 *   },
 *   {
 *     maxRequests: 5,
 *     windowMs: 60000, // 1 minute
 *     message: 'Too many login attempts',
 *   }
 * );
 * ```
 */
export function withRateLimit<T extends (...args: any[]) => any>(
  handler: T,
  config: RateLimitConfig = {}
): T {
  return (async (...args: any[]) => {
    const request = args[0] as Request;
    const identifier = getClientIdentifier(request);

    const { allowed, retryAfter, remaining } = checkRateLimit(identifier, config);

    if (!allowed) {
      const message = config.message || 'Too many requests, please try again later';
      const retryAfterSeconds = Math.ceil(retryAfter / 1000);

      return new Response(
        JSON.stringify({ error: message }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(config.maxRequests || 10),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(Date.now() + retryAfter),
          },
        }
      );
    }

    // Add rate limit headers to successful responses
    const response = await handler(...args);

    // If response is already a Response object, add headers
    if (response instanceof Response) {
      response.headers.set('X-RateLimit-Limit', String(config.maxRequests || 10));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
    }

    return response;
  }) as T;
}

/**
 * Clear rate limit data for a specific identifier
 * Useful for testing or manual reset
 *
 * @param identifier - Client identifier to reset
 */
export function clearRateLimit(identifier: string): void {
  delete rateLimitStore[identifier];
}

/**
 * Clear all rate limit data
 * Useful for testing or system maintenance
 */
export function clearAllRateLimits(): void {
  Object.keys(rateLimitStore).forEach((key) => {
    delete rateLimitStore[key];
  });
}

/**
 * Get current rate limit status for an identifier
 * Useful for monitoring and debugging
 *
 * @param identifier - Client identifier
 * @param config - Rate limit configuration
 * @returns Current status including remaining tokens and reset time
 */
export function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig = {}
): {
  tokens: number;
  maxTokens: number;
  resetIn: number;
} {
  const { maxRequests = 10, windowMs = 60000 } = config;

  if (!rateLimitStore[identifier]) {
    return {
      tokens: maxRequests,
      maxTokens: maxRequests,
      resetIn: 0,
    };
  }

  const bucket = new TokenBucket(
    maxRequests,
    windowMs,
    rateLimitStore[identifier].tokens,
    rateLimitStore[identifier].lastRefill
  );

  return {
    tokens: Math.floor(bucket.getTokens()),
    maxTokens: maxRequests,
    resetIn: bucket.getRetryAfter(),
  };
}

/**
 * Preset rate limit configurations for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict rate limiting for sensitive operations (login, signup)
   * 5 requests per minute
   */
  STRICT: {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    message: 'Too many attempts, please try again later',
  },

  /**
   * Moderate rate limiting for standard API endpoints
   * 30 requests per minute
   */
  MODERATE: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute
    message: 'Too many requests, please slow down',
  },

  /**
   * Relaxed rate limiting for public endpoints
   * 100 requests per minute
   */
  RELAXED: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    message: 'Too many requests, please try again later',
  },

  /**
   * Very strict rate limiting for expensive operations
   * 2 requests per minute
   */
  VERY_STRICT: {
    maxRequests: 2,
    windowMs: 60000, // 1 minute
    message: 'Rate limit exceeded, please wait before trying again',
  },
} as const;
