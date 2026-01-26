'use client';

/**
 * Error Message Component
 * Displays user-friendly error messages
 */

import { formatErrorForUser } from '@/lib/error-recovery';

interface ErrorMessageProps {
  error: Error | string | null;
  title?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'error' | 'warning' | 'info';
}

export default function ErrorMessage({
  error,
  title,
  onRetry,
  onDismiss,
  variant = 'error',
}: ErrorMessageProps) {
  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : formatErrorForUser(error);

  const variantStyles = {
    error: {
      container: 'bg-red-50 border-red-200',
      icon: 'text-red-600',
      title: 'text-red-900',
      message: 'text-red-700',
      button: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200',
      icon: 'text-yellow-600',
      title: 'text-yellow-900',
      message: 'text-yellow-700',
      button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    },
    info: {
      container: 'bg-blue-50 border-blue-200',
      icon: 'text-blue-600',
      title: 'text-blue-900',
      message: 'text-blue-700',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={`border ${styles.container} rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {variant === 'error' && (
            <svg
              className={`w-6 h-6 ${styles.icon}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {variant === 'warning' && (
            <svg
              className={`w-6 h-6 ${styles.icon}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
          {variant === 'info' && (
            <svg
              className={`w-6 h-6 ${styles.icon}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {title && (
            <h3 className={`font-semibold ${styles.title} mb-1`}>
              {title}
            </h3>
          )}
          <p className={`text-sm ${styles.message}`}>
            {errorMessage}
          </p>

          {(onRetry || onDismiss) && (
            <div className="flex gap-2 mt-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className={`${styles.button} px-3 py-1.5 rounded text-sm font-medium transition`}
                >
                  Try Again
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-gray-600 hover:text-gray-900 px-3 py-1.5 text-sm font-medium transition"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>

        {onDismiss && !onRetry && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
