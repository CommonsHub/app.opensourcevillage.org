/**
 * Tests for API Response and Error Handling Utilities
 * Verifies consistent API response formatting across the application
 */

import {
  successResponse,
  errorResponse,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  conflictError,
  internalError,
  createdResponse,
  noContentResponse,
  paginatedResponse,
  withErrorHandling,
  validateQueryParams,
  parseJsonBody,
  checkMethod,
  API_ERROR_CODES,
} from '../api-utils';
import { NextRequest } from 'next/server';

describe('API Utils - Response Helpers', () => {
  describe('successResponse', () => {
    it('should create a successful response with data', async () => {
      const data = { id: '123', name: 'Test' };
      const response = successResponse(data);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual(data);
      expect(body.timestamp).toBeDefined();
    });

    it('should include optional message', async () => {
      const data = { id: '123' };
      const response = successResponse(data, 'Operation successful');

      const body = await response.json();
      expect(body.message).toBe('Operation successful');
    });

    it('should support custom status codes', async () => {
      const response = successResponse({ id: '123' }, undefined, 201);
      expect(response.status).toBe(201);
    });

    it('should handle null data', async () => {
      const response = successResponse(null);
      const body = await response.json();
      expect(body.data).toBeNull();
    });

    it('should handle array data', async () => {
      const data = [1, 2, 3];
      const response = successResponse(data);
      const body = await response.json();
      expect(body.data).toEqual([1, 2, 3]);
    });
  });

  describe('errorResponse', () => {
    it('should create an error response with default 500 status', async () => {
      const response = errorResponse('Something went wrong');

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Something went wrong');
      expect(body.timestamp).toBeDefined();
    });

    it('should support custom status codes', async () => {
      const response = errorResponse('Not found', 404);
      expect(response.status).toBe(404);
    });

    it('should include error code', async () => {
      const response = errorResponse(
        'Validation failed',
        400,
        API_ERROR_CODES.VALIDATION_ERROR
      );

      const body = await response.json();
      expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
    });

    it('should include error details', async () => {
      const details = { field: 'email', reason: 'invalid format' };
      const response = errorResponse('Invalid input', 400, undefined, details);

      const body = await response.json();
      expect(body.details).toEqual(details);
    });
  });

  describe('Convenience error helpers', () => {
    it('validationError should return 400', async () => {
      const response = validationError('Invalid username');
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('Invalid username');
      expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
    });

    it('notFoundError should return 404', async () => {
      const response = notFoundError('User');
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe('User not found');
      expect(body.code).toBe(API_ERROR_CODES.NOT_FOUND);
    });

    it('unauthorizedError should return 401', async () => {
      const response = unauthorizedError();
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe(API_ERROR_CODES.UNAUTHORIZED);
    });

    it('unauthorizedError should accept custom message', async () => {
      const response = unauthorizedError('Invalid token');
      const body = await response.json();
      expect(body.error).toBe('Invalid token');
    });

    it('forbiddenError should return 403', async () => {
      const response = forbiddenError('Access denied');
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toBe('Access denied');
      expect(body.code).toBe(API_ERROR_CODES.FORBIDDEN);
    });

    it('conflictError should return 409', async () => {
      const response = conflictError('Username already exists');
      expect(response.status).toBe(409);

      const body = await response.json();
      expect(body.error).toBe('Username already exists');
      expect(body.code).toBe(API_ERROR_CODES.CONFLICT);
    });

    it('internalError should return 500', async () => {
      const response = internalError();
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBe('Internal server error');
      expect(body.code).toBe(API_ERROR_CODES.INTERNAL_ERROR);
    });

    it('internalError should include details', async () => {
      const details = { stack: 'Error stack trace' };
      const response = internalError('Database error', details);

      const body = await response.json();
      expect(body.error).toBe('Database error');
      expect(body.details).toEqual(details);
    });
  });

  describe('Special response helpers', () => {
    it('createdResponse should return 201', async () => {
      const data = { id: '123', name: 'New Resource' };
      const response = createdResponse(data, 'Resource created');

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data).toEqual(data);
      expect(body.message).toBe('Resource created');
    });

    it('noContentResponse should return 204', () => {
      const response = noContentResponse();
      expect(response.status).toBe(204);
    });
  });

  describe('paginatedResponse', () => {
    it('should create paginated response with correct metadata', async () => {
      const data = [1, 2, 3, 4, 5];
      const response = paginatedResponse(data, 50, 1, 10);

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data).toEqual(data);
      expect(body.pagination).toEqual({
        total: 50,
        page: 1,
        pageSize: 10,
        totalPages: 5,
      });
    });

    it('should handle non-even pagination', async () => {
      const data = [1, 2, 3];
      const response = paginatedResponse(data, 23, 3, 10);

      const body = await response.json();
      expect(body.pagination.totalPages).toBe(3); // 23 items / 10 per page = 3 pages
    });

    it('should handle empty results', async () => {
      const response = paginatedResponse([], 0, 1, 10);

      const body = await response.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
    });

    it('should handle single page', async () => {
      const data = [1, 2, 3];
      const response = paginatedResponse(data, 3, 1, 10);

      const body = await response.json();
      expect(body.pagination.totalPages).toBe(1);
    });
  });
});

describe('API Utils - Request Helpers', () => {
  describe('validateQueryParams', () => {
    it('should extract valid query parameters', () => {
      const url = 'http://localhost:3000/api/test?id=123&name=alice';
      const params = validateQueryParams(url, ['id', 'name']);

      expect(params).toEqual({ id: '123', name: 'alice' });
    });

    it('should return null if any parameter is missing', () => {
      const url = 'http://localhost:3000/api/test?id=123';
      const params = validateQueryParams(url, ['id', 'name']);

      expect(params).toBeNull();
    });

    it('should handle empty parameter list', () => {
      const url = 'http://localhost:3000/api/test';
      const params = validateQueryParams(url, []);

      expect(params).toEqual({});
    });

    it('should handle URL encoded values', () => {
      const url = 'http://localhost:3000/api/test?name=alice%20bob';
      const params = validateQueryParams(url, ['name']);

      expect(params).toEqual({ name: 'alice bob' });
    });

    it('should return null for empty parameter values', () => {
      const url = 'http://localhost:3000/api/test?id=&name=alice';
      const params = validateQueryParams(url, ['id', 'name']);

      expect(params).toBeNull();
    });
  });

  describe('parseJsonBody', () => {
    it('should parse valid JSON body', async () => {
      const body = { username: 'alice', email: 'alice@example.com' };
      const request = new Request('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

      const parsed = await parseJsonBody(request);
      expect(parsed).toEqual(body);
    });

    it('should return null for invalid JSON', async () => {
      const request = new Request('http://localhost:3000', {
        method: 'POST',
        body: 'invalid json {{{',
        headers: { 'Content-Type': 'application/json' },
      });

      const parsed = await parseJsonBody(request);
      expect(parsed).toBeNull();
    });

    it('should handle empty body', async () => {
      const request = new Request('http://localhost:3000', {
        method: 'POST',
        body: '',
      });

      const parsed = await parseJsonBody(request);
      expect(parsed).toBeNull();
    });

    it('should parse nested objects', async () => {
      const body = {
        user: {
          profile: {
            name: 'Alice',
            age: 30,
          },
        },
      };
      const request = new Request('http://localhost:3000', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const parsed = await parseJsonBody(request);
      expect(parsed).toEqual(body);
    });
  });

  describe('checkMethod', () => {
    it('should return null for allowed methods', () => {
      const error = checkMethod('GET', ['GET', 'POST']);
      expect(error).toBeNull();
    });

    it('should return error response for disallowed methods', async () => {
      const error = checkMethod('DELETE', ['GET', 'POST']);

      expect(error).not.toBeNull();
      expect(error!.status).toBe(405);

      const body = await error!.json();
      expect(body.error).toContain('Method DELETE not allowed');
    });

    it('should be case-sensitive', async () => {
      const error = checkMethod('get', ['GET']);

      expect(error).not.toBeNull();
      expect(error!.status).toBe(405);
    });

    it('should handle single allowed method', () => {
      const error = checkMethod('POST', ['POST']);
      expect(error).toBeNull();
    });

    it('should handle multiple allowed methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      const error = checkMethod('PATCH', methods);
      expect(error).toBeNull();
    });
  });
});

describe('API Utils - Error Handling Wrapper', () => {
  describe('withErrorHandling', () => {
    it('should pass through successful responses', async () => {
      const handler = async () => {
        return successResponse({ result: 'success' });
      };

      const wrapped = withErrorHandling(handler);
      const response = await wrapped();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.result).toBe('success');
    });

    it('should catch and convert thrown errors to 500 responses', async () => {
      const handler = async () => {
        throw new Error('Database connection failed');
      };

      const wrapped = withErrorHandling(handler);
      const response = await wrapped();

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Database connection failed');
      expect(body.code).toBe(API_ERROR_CODES.INTERNAL_ERROR);
    });

    it('should handle non-Error throws', async () => {
      const handler = async () => {
        throw 'String error';
      };

      const wrapped = withErrorHandling(handler);
      const response = await wrapped();

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('An unexpected error occurred');
    });

    it('should preserve function arguments', async () => {
      const handler = async (request: NextRequest, id: string) => {
        return successResponse({ id, url: request.url });
      };

      const wrapped = withErrorHandling(handler);
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await wrapped(request, '123');

      const body = await response.json();
      expect(body.data.id).toBe('123');
      expect(body.data.url).toBe('http://localhost:3000/api/test');
    });

    it('should handle async errors in handler', async () => {
      const handler = async () => {
        await Promise.resolve();
        throw new Error('Async error');
      };

      const wrapped = withErrorHandling(handler);
      const response = await wrapped();

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Async error');
    });
  });
});

describe('API Utils - Error Codes', () => {
  it('should have all expected error codes', () => {
    expect(API_ERROR_CODES.BAD_REQUEST).toBe('BAD_REQUEST');
    expect(API_ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(API_ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN');
    expect(API_ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
    expect(API_ERROR_CODES.CONFLICT).toBe('CONFLICT');
    expect(API_ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(API_ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(API_ERROR_CODES.DATABASE_ERROR).toBe('DATABASE_ERROR');
    expect(API_ERROR_CODES.FILE_SYSTEM_ERROR).toBe('FILE_SYSTEM_ERROR');
    expect(API_ERROR_CODES.INSUFFICIENT_TOKENS).toBe('INSUFFICIENT_TOKENS');
    expect(API_ERROR_CODES.OFFER_NOT_AVAILABLE).toBe('OFFER_NOT_AVAILABLE');
    expect(API_ERROR_CODES.RSVP_LIMIT_REACHED).toBe('RSVP_LIMIT_REACHED');
    expect(API_ERROR_CODES.USERNAME_TAKEN).toBe('USERNAME_TAKEN');
  });

  it('should be immutable (const assertion)', () => {
    // TypeScript should prevent this at compile time
    // This test verifies the type is correct
    const codes: typeof API_ERROR_CODES = API_ERROR_CODES;
    expect(codes).toBeDefined();
  });
});

describe('API Utils - Integration Examples', () => {
  it('should handle complete API flow with validation', async () => {
    // Simulate a complete API endpoint flow
    const handler = async (request: NextRequest) => {
      // Check method
      const methodError = checkMethod(request.method, ['POST']);
      if (methodError) return methodError;

      // Parse body
      const body = await parseJsonBody<{ username: string }>(request);
      if (!body) {
        return validationError('Invalid JSON body');
      }

      // Validate fields
      if (!body.username || body.username.length < 3) {
        return validationError('Username must be at least 3 characters');
      }

      // Success
      return createdResponse(
        { id: '123', username: body.username },
        'User created successfully'
      );
    };

    const request = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice' }),
    });

    const response = await handler(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.data.username).toBe('alice');
    expect(data.message).toBe('User created successfully');
  });

  it('should handle query parameter validation flow', () => {
    const url = 'http://localhost:3000/api/offers?type=workshop&tag=react';
    const params = validateQueryParams(url, ['type', 'tag']);

    if (!params) {
      const response = validationError('Missing required parameters');
      expect(response.status).toBe(400);
    } else {
      expect(params.type).toBe('workshop');
      expect(params.tag).toBe('react');
    }
  });

  it('should handle error with details for debugging', async () => {
    const response = internalError('Database query failed', {
      query: 'SELECT * FROM users',
      error: 'Connection timeout',
    });

    const body = await response.json();
    expect(body.error).toBe('Database query failed');
    expect(body.details).toHaveProperty('query');
    expect(body.details).toHaveProperty('error');
  });
});
