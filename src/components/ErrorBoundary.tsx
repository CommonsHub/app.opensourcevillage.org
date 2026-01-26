'use client';

/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 */

import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to error tracking service (Sentry, LogRocket, etc.)
    if (typeof window !== 'undefined' && (window as any).__errorLogger) {
      (window as any).__errorLogger.logError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset error state if resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      const prevKeys = prevProps.resetKeys || [];
      const currentKeys = this.props.resetKeys || [];

      const hasKeyChanged = currentKeys.some(
        (key, index) => key !== prevKeys[index]
      );

      if (hasKeyChanged) {
        this.reset();
      }
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-red-600"
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
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
              Something went wrong
            </h2>

            <p className="text-gray-600 text-center mb-4">
              We encountered an unexpected error. Don't worry, your data is safe.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 bg-gray-50 rounded p-3 text-sm">
                <summary className="cursor-pointer font-semibold text-gray-700 mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="space-y-2">
                  <div>
                    <strong className="text-gray-700">Message:</strong>
                    <p className="text-red-600 font-mono text-xs mt-1">
                      {this.state.error.message}
                    </p>
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <strong className="text-gray-700">Stack:</strong>
                      <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded mt-1 overflow-x-auto">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo && (
                    <div>
                      <strong className="text-gray-700">Component Stack:</strong>
                      <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded mt-1 overflow-x-auto">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.reset}
                className="flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition"
              >
                Go Home
              </button>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                }}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
