/**
 * API Response and Error Handling Utilities
 *
 * Provides consistent response formatting, error handling, and logging
 * for Next.js API routes. Reduces code duplication across API endpoints.
 */

import { NextResponse } from 'next/server';

/**
 * Standard API error response structure
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
  timestamp?: number;
}

/**
 * Standard API success response structure
 */
export interface ApiSuccess<T = unknown> {
  data: T;
  message?: string;
  timestamp?: number;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * API error codes for consistent error handling
 */
export const API_ERROR_CODES = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',

  // Business logic errors
  INSUFFICIENT_TOKENS: 'INSUFFICIENT_TOKENS',
  OFFER_NOT_AVAILABLE: 'OFFER_NOT_AVAILABLE',
  RSVP_LIMIT_REACHED: 'RSVP_LIMIT_REACHED',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
} as const;

/**
 * Create a successful JSON response
 *
 * @param data - Response data
 * @param message - Optional success message
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with formatted success data
 *
 * @example
 * return successResponse({ id: '123', name: 'Alice' }, 'Profile created successfully', 201);
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    {
      data,
      message,
      timestamp: Date.now(),
    },
    { status }
  );
}

/**
 * Create an error JSON response
 *
 * @param error - Error message
 * @param status - HTTP status code (default: 500)
 * @param code - Optional error code for client handling
 * @param details - Optional additional error details
 * @returns NextResponse with formatted error
 *
 * @example
 * return errorResponse('User not found', 404, API_ERROR_CODES.NOT_FOUND);
 */
export function errorResponse(
  error: string,
  status: number = 500,
  code?: string,
  details?: unknown
): NextResponse<ApiError> {
  // Log errors on server side
  if (status >= 500) {
    console.error(`[API Error ${status}]`, { error, code, details });
  }

  return NextResponse.json(
    {
      error,
      code,
      details,
      timestamp: Date.now(),
    },
    { status }
  );
}

/**
 * Create a validation error response (400)
 *
 * @param message - Validation error message
 * @param details - Optional field-specific error details
 * @returns NextResponse with validation error
 *
 * @example
 * return validationError('Invalid username format', {
 *   field: 'username',
 *   rule: 'Must be 3-20 characters'
 * });
 */
export function validationError(
  message: string,
  details?: unknown
): NextResponse<ApiError> {
  return errorResponse(
    message,
    400,
    API_ERROR_CODES.VALIDATION_ERROR,
    details
  );
}

/**
 * Create a not found error response (404)
 *
 * @param resource - Name of resource that wasn't found
 * @returns NextResponse with not found error
 *
 * @example
 * return notFoundError('Offer');
 * // Returns: "Offer not found"
 */
export function notFoundError(resource: string): NextResponse<ApiError> {
  return errorResponse(
    `${resource} not found`,
    404,
    API_ERROR_CODES.NOT_FOUND
  );
}

/**
 * Create an unauthorized error response (401)
 *
 * @param message - Optional custom message
 * @returns NextResponse with unauthorized error
 */
export function unauthorizedError(
  message: string = 'Unauthorized'
): NextResponse<ApiError> {
  return errorResponse(message, 401, API_ERROR_CODES.UNAUTHORIZED);
}

/**
 * Create a forbidden error response (403)
 *
 * @param message - Optional custom message
 * @returns NextResponse with forbidden error
 */
export function forbiddenError(
  message: string = 'Forbidden'
): NextResponse<ApiError> {
  return errorResponse(message, 403, API_ERROR_CODES.FORBIDDEN);
}

/**
 * Create a conflict error response (409)
 *
 * @param message - Conflict message
 * @returns NextResponse with conflict error
 *
 * @example
 * return conflictError('Username already exists');
 */
export function conflictError(message: string): NextResponse<ApiError> {
  return errorResponse(message, 409, API_ERROR_CODES.CONFLICT);
}

/**
 * Create an internal server error response (500)
 *
 * @param message - Optional custom error message
 * @param details - Optional error details for logging
 * @returns NextResponse with internal error
 */
export function internalError(
  message: string = 'Internal server error',
  details?: unknown
): NextResponse<ApiError> {
  return errorResponse(message, 500, API_ERROR_CODES.INTERNAL_ERROR, details);
}

/**
 * Create a paginated response
 *
 * @param data - Array of items for current page
 * @param total - Total number of items across all pages
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns NextResponse with paginated data
 *
 * @example
 * const offers = await getAllOffers();
 * const page = 1, pageSize = 10;
 * const paginatedOffers = offers.slice((page - 1) * pageSize, page * pageSize);
 * return paginatedResponse(paginatedOffers, offers.length, page, pageSize);
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json({
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

/**
 * Wrap an async API handler with error catching
 * Automatically converts thrown errors to appropriate error responses
 *
 * @param handler - Async function that returns NextResponse
 * @returns Wrapped handler with automatic error handling
 *
 * @example
 * export const GET = withErrorHandling(async (request: NextRequest) => {
 *   const data = await fetchSomeData(); // If this throws, auto-handled
 *   return successResponse(data);
 * });
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('[API Error Handler]', error);

      if (error instanceof Error) {
        return internalError(error.message, {
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
      }

      return internalError('An unexpected error occurred');
    }
  };
}

/**
 * Extract and validate required query parameters from URL
 *
 * @param url - Request URL
 * @param params - Array of required parameter names
 * @returns Object with parameter values or null if any missing
 *
 * @example
 * const params = validateQueryParams(request.url, ['offerId', 'userId']);
 * if (!params) {
 *   return validationError('Missing required parameters');
 * }
 * const { offerId, userId } = params;
 */
export function validateQueryParams(
  url: string,
  params: string[]
): Record<string, string> | null {
  const searchParams = new URL(url).searchParams;
  const result: Record<string, string> = {};

  for (const param of params) {
    const value = searchParams.get(param);
    if (!value) {
      return null;
    }
    result[param] = value;
  }

  return result;
}

/**
 * Parse and validate JSON body from request
 * Returns null if body is invalid JSON
 *
 * @param request - Next.js request object
 * @returns Parsed JSON object or null if invalid
 *
 * @example
 * const body = await parseJsonBody<{ username: string }>(request);
 * if (!body) {
 *   return validationError('Invalid JSON body');
 * }
 */
export async function parseJsonBody<T = unknown>(
  request: Request
): Promise<T | null> {
  try {
    const body = await request.json();
    return body as T;
  } catch (error) {
    console.error('[JSON Parse Error]', error);
    return null;
  }
}

/**
 * Check if request method is allowed
 * Returns error response if method not in allowed list
 *
 * @param method - Actual request method
 * @param allowed - Array of allowed methods
 * @returns Error response if not allowed, null if allowed
 *
 * @example
 * const methodError = checkMethod(request.method, ['GET', 'POST']);
 * if (methodError) return methodError;
 */
export function checkMethod(
  method: string,
  allowed: string[]
): NextResponse<ApiError> | null {
  if (!allowed.includes(method)) {
    return errorResponse(
      `Method ${method} not allowed`,
      405,
      'METHOD_NOT_ALLOWED'
    );
  }
  return null;
}

/**
 * Log API request for debugging and analytics
 *
 * @param method - HTTP method
 * @param path - Request path
 * @param params - Optional query/body params to log
 */
export function logApiRequest(
  method: string,
  path: string,
  params?: unknown
): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[API ${method}] ${path}`, params ? params : '');
  }
}

/**
 * Create a response for successful resource creation (201)
 *
 * @param data - Created resource data
 * @param message - Optional success message
 * @returns NextResponse with 201 status
 *
 * @example
 * const newOffer = await createOffer(data);
 * return createdResponse(newOffer, 'Offer created successfully');
 */
export function createdResponse<T>(
  data: T,
  message?: string
): NextResponse<ApiSuccess<T>> {
  return successResponse(data, message, 201);
}

/**
 * Create a no content response (204)
 * Used for successful operations that don't return data
 *
 * @returns NextResponse with 204 status
 *
 * @example
 * await deleteRSVP(rsvpId);
 * return noContentResponse();
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
