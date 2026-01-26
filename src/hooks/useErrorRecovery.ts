/**
 * React hook for error recovery
 * Provides error state management and recovery functions
 */

import { useState, useCallback } from 'react';
import {
  retryWithBackoff,
  RetryOptions,
  formatErrorForUser,
  globalErrorLogger,
} from '@/lib/error-recovery';

interface UseErrorRecoveryOptions {
  /**
   * Automatically log errors
   * @default true
   */
  autoLog?: boolean;

  /**
   * Callback when error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Default retry options
   */
  retryOptions?: RetryOptions;
}

interface UseErrorRecoveryResult {
  /**
   * Current error (null if no error)
   */
  error: Error | null;

  /**
   * User-friendly error message
   */
  errorMessage: string | null;

  /**
   * Whether an error exists
   */
  hasError: boolean;

  /**
   * Set an error
   */
  setError: (error: Error | null) => void;

  /**
   * Clear the error
   */
  clearError: () => void;

  /**
   * Execute a function with error handling
   */
  withErrorHandling: <T>(
    fn: () => Promise<T>,
    options?: { onSuccess?: (data: T) => void }
  ) => Promise<T | null>;

  /**
   * Execute a function with retry logic
   */
  withRetry: <T>(
    fn: () => Promise<T>,
    options?: RetryOptions & { onSuccess?: (data: T) => void }
  ) => Promise<T | null>;
}

export function useErrorRecovery(
  options: UseErrorRecoveryOptions = {}
): UseErrorRecoveryResult {
  const {
    autoLog = true,
    onError,
    retryOptions: defaultRetryOptions,
  } = options;

  const [error, setErrorState] = useState<Error | null>(null);

  const setError = useCallback(
    (newError: Error | null) => {
      setErrorState(newError);

      if (newError) {
        // Log error
        if (autoLog) {
          globalErrorLogger.log(newError);
        }

        // Call error callback
        if (onError) {
          onError(newError);
        }
      }
    },
    [autoLog, onError]
  );

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const withErrorHandling = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      options?: { onSuccess?: (data: T) => void }
    ): Promise<T | null> => {
      clearError();

      try {
        const result = await fn();
        if (options?.onSuccess) {
          options.onSuccess(result);
        }
        return result;
      } catch (err) {
        setError(err as Error);
        return null;
      }
    },
    [setError, clearError]
  );

  const withRetry = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      options?: RetryOptions & { onSuccess?: (data: T) => void }
    ): Promise<T | null> => {
      clearError();

      try {
        const result = await retryWithBackoff(fn, {
          ...defaultRetryOptions,
          ...options,
        });

        if (options?.onSuccess) {
          options.onSuccess(result);
        }

        return result;
      } catch (err) {
        setError(err as Error);
        return null;
      }
    },
    [setError, clearError, defaultRetryOptions]
  );

  return {
    error,
    errorMessage: error ? formatErrorForUser(error) : null,
    hasError: error !== null,
    setError,
    clearError,
    withErrorHandling,
    withRetry,
  };
}
