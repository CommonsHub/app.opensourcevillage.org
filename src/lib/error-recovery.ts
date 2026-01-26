/**
 * Error Recovery Utilities
 * Provides retry logic, error handling, and recovery strategies
 */

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Delay between retries in milliseconds
   * @default 1000
   */
  delay?: number;

  /**
   * Exponential backoff multiplier
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Maximum delay between retries in milliseconds
   * @default 10000
   */
  maxDelay?: number;

  /**
   * Function to determine if error is retryable
   * @default () => true
   */
  isRetryable?: (error: Error) => boolean;

  /**
   * Callback on each retry attempt
   */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 *
 * @example
 * ```typescript
 * const data = await retryWithBackoff(
 *   async () => {
 *     const response = await fetch('/api/offers');
 *     if (!response.ok) throw new Error('Failed to fetch');
 *     return response.json();
 *   },
 *   {
 *     maxAttempts: 3,
 *     delay: 1000,
 *     backoffMultiplier: 2,
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoffMultiplier = 2,
    maxDelay = 10000,
    isRetryable = () => true,
    onRetry,
  } = options;

  let lastError: Error | null = null;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        throw lastError;
      }

      // Don't retry if this was the last attempt
      if (attempt >= maxAttempts) {
        break;
      }

      // Call retry callback
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Wait before retrying
      await sleep(currentDelay);

      // Increase delay exponentially
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: Error): boolean {
  return (
    error.message.includes('fetch') ||
    error.message.includes('network') ||
    error.message.includes('Failed to fetch') ||
    error.name === 'NetworkError' ||
    error.name === 'TypeError'
  );
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: Error): boolean {
  return (
    error.message.includes('timeout') ||
    error.message.includes('timed out') ||
    error.name === 'TimeoutError'
  );
}

/**
 * Check if an HTTP status code is retryable
 */
export function isRetryableStatusCode(status: number): boolean {
  // Retry on server errors (5xx) and rate limiting (429)
  return status >= 500 || status === 429 || status === 408;
}

/**
 * Fetch with retry logic
 *
 * @example
 * ```typescript
 * const data = await fetchWithRetry('/api/offers', {
 *   method: 'GET',
 * }, {
 *   maxAttempts: 3,
 * });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, init);

      // Don't retry successful responses or client errors (4xx except 429, 408)
      if (response.ok || (response.status >= 400 && response.status < 500 && !isRetryableStatusCode(response.status))) {
        return response;
      }

      // Throw error for retryable responses
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    },
    {
      ...retryOptions,
      isRetryable: (error) => {
        // Retry on network errors and timeout errors
        return isNetworkError(error) || isTimeoutError(error);
      },
    }
  );
}

/**
 * Execute a function with timeout
 *
 * @example
 * ```typescript
 * const data = await withTimeout(
 *   async () => fetch('/api/offers'),
 *   5000 // 5 second timeout
 * );
 * ```
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    ),
  ]);
}

/**
 * Safe JSON parse with fallback
 *
 * @example
 * ```typescript
 * const data = safeJsonParse(jsonString, { default: 'value' });
 * ```
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('[ErrorRecovery] JSON parse error:', error);
    return fallback;
  }
}

/**
 * Safe async operation with fallback
 *
 * @example
 * ```typescript
 * const data = await safeAsync(
 *   async () => fetchData(),
 *   [] // fallback value
 * );
 * ```
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('[ErrorRecovery] Async operation failed:', error);
    return fallback;
  }
}

/**
 * Safe sync operation with fallback
 *
 * @example
 * ```typescript
 * const data = safeSync(
 *   () => riskyOperation(),
 *   'default value'
 * );
 * ```
 */
export function safeSync<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    console.error('[ErrorRecovery] Sync operation failed:', error);
    return fallback;
  }
}

/**
 * Batch operations with error isolation
 * Failed operations don't affect successful ones
 *
 * @example
 * ```typescript
 * const results = await batchWithErrorIsolation([
 *   async () => fetch('/api/offers/1'),
 *   async () => fetch('/api/offers/2'),
 *   async () => fetch('/api/offers/3'),
 * ]);
 * ```
 */
export async function batchWithErrorIsolation<T>(
  operations: Array<() => Promise<T>>
): Promise<Array<{ success: boolean; data?: T; error?: Error }>> {
  return Promise.all(
    operations.map(async (operation) => {
      try {
        const data = await operation();
        return { success: true, data };
      } catch (error) {
        return { success: false, error: error as Error };
      }
    })
  );
}

/**
 * Circuit breaker pattern
 * Stops calling a failing function after threshold is reached
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private options: {
      failureThreshold: number;
      resetTimeout: number;
      onStateChange?: (state: 'CLOSED' | 'OPEN' | 'HALF_OPEN') => void;
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - (this.lastFailureTime || 0);

      if (timeSinceFailure >= this.options.resetTimeout) {
        // Try half-open state
        this.setState('HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();

      // Success - reset circuit
      if (this.state === 'HALF_OPEN') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.setState('OPEN');
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.setState('CLOSED');
  }

  private setState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    this.state = state;
    if (this.options.onStateChange) {
      this.options.onStateChange(state);
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }
}

/**
 * Debounce errors to prevent flooding logs
 */
export class ErrorDebouncer {
  private errorTimestamps: Map<string, number[]> = new Map();

  constructor(
    private options: {
      windowMs: number;
      maxErrors: number;
    }
  ) {}

  shouldLog(errorKey: string): boolean {
    const now = Date.now();
    const timestamps = this.errorTimestamps.get(errorKey) || [];

    // Remove timestamps outside the window
    const recentTimestamps = timestamps.filter(
      (ts) => now - ts < this.options.windowMs
    );

    // Check if we've exceeded the limit
    if (recentTimestamps.length >= this.options.maxErrors) {
      // Update timestamps (don't add new one)
      this.errorTimestamps.set(errorKey, recentTimestamps);
      return false;
    }

    // Add new timestamp
    recentTimestamps.push(now);
    this.errorTimestamps.set(errorKey, recentTimestamps);
    return true;
  }

  clear(): void {
    this.errorTimestamps.clear();
  }
}

/**
 * Error logger with rate limiting
 */
export class ErrorLogger {
  private debouncer: ErrorDebouncer;

  constructor(options?: { windowMs?: number; maxErrors?: number }) {
    this.debouncer = new ErrorDebouncer({
      windowMs: options?.windowMs || 60000, // 1 minute
      maxErrors: options?.maxErrors || 10,
    });
  }

  log(error: Error, context?: Record<string, any>): void {
    const errorKey = `${error.name}:${error.message}`;

    if (!this.debouncer.shouldLog(errorKey)) {
      return; // Skip logging (too many similar errors)
    }

    console.error('[ErrorLogger]', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      context,
      timestamp: Date.now(),
    });

    // Send to external error tracking service
    if (typeof window !== 'undefined' && (window as any).__errorTracker) {
      (window as any).__errorTracker.captureException(error, context);
    }
  }

  clear(): void {
    this.debouncer.clear();
  }
}

/**
 * Global error logger instance
 */
export const globalErrorLogger = new ErrorLogger();

/**
 * Format error message for user display
 * Strips technical details and provides friendly message
 */
export function formatErrorForUser(error: Error): string {
  // Network errors
  if (isNetworkError(error)) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  // Timeout errors
  if (isTimeoutError(error)) {
    return 'The request took too long. Please try again.';
  }

  // API errors
  if (error.message.includes('HTTP 404')) {
    return 'The requested resource was not found.';
  }

  if (error.message.includes('HTTP 403')) {
    return 'You don\'t have permission to access this resource.';
  }

  if (error.message.includes('HTTP 401')) {
    return 'Please log in to continue.';
  }

  if (error.message.includes('HTTP 500') || error.message.includes('HTTP 502') || error.message.includes('HTTP 503')) {
    return 'The server is experiencing issues. Please try again later.';
  }

  if (error.message.includes('HTTP 429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Validation errors
  if (error.message.includes('validation') || error.message.includes('invalid')) {
    return error.message; // Keep validation messages as-is
  }

  // Generic fallback
  return 'Something went wrong. Please try again.';
}

/**
 * Error recovery presets for common scenarios
 */
export const ErrorRecoveryPresets = {
  /**
   * API calls with retry
   */
  API_CALL: {
    maxAttempts: 3,
    delay: 1000,
    backoffMultiplier: 2,
    maxDelay: 5000,
    isRetryable: (error: Error) => isNetworkError(error) || isTimeoutError(error),
  },

  /**
   * Critical operations with aggressive retry
   */
  CRITICAL: {
    maxAttempts: 5,
    delay: 500,
    backoffMultiplier: 1.5,
    maxDelay: 3000,
    isRetryable: () => true,
  },

  /**
   * Background operations with lenient retry
   */
  BACKGROUND: {
    maxAttempts: 10,
    delay: 5000,
    backoffMultiplier: 1.2,
    maxDelay: 30000,
    isRetryable: () => true,
  },

  /**
   * User-initiated actions with minimal retry
   */
  USER_ACTION: {
    maxAttempts: 2,
    delay: 500,
    backoffMultiplier: 2,
    maxDelay: 1000,
    isRetryable: (error: Error) => isNetworkError(error),
  },
} as const;
