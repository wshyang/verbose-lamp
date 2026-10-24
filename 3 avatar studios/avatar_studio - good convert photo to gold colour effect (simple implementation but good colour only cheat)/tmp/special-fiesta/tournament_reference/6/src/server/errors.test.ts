import { describe, expect, it } from 'vitest';
import { AppError, badRequest, conflict, notFound, unprocessable } from './errors.js';

describe('typed application errors', () => {
  it('creates safe errors with the requested HTTP status and code', () => {
    expect(badRequest('Bad input')).toMatchObject({ status: 400, code: 'INVALID_INPUT', message: 'Bad input' });
    expect(badRequest('Bad JSON', 'INVALID_JSON')).toMatchObject({ status: 400, code: 'INVALID_JSON' });
    expect(notFound('Missing')).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(conflict('Already done')).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(conflict('State conflict', 'STATE_CONFLICT')).toMatchObject({ status: 409, code: 'STATE_CONFLICT' });
    expect(unprocessable('Invalid field')).toMatchObject({ status: 422, code: 'INVALID_INPUT' });
    expect(unprocessable('Custom', 'CUSTOM')).toMatchObject({ status: 422, code: 'CUSTOM' });
  });

  it('remains an Error for the HTTP error boundary', () => {
    const error = new AppError(418, 'TEAPOT', 'Short and stout');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Short and stout');
  });
});
