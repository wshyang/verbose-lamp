import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionToken,
  readSessionCarrier,
  readSessionCredential,
  readSessionToken,
  writeSessionCarrier,
  writeSessionToken,
} from './tokenStore.js';

/**
 * ADR-016 — the token store is the only reason sign-in works where the cookie cannot be kept,
 * so both of its paths matter: normal storage, and storage that refuses to co-operate.
 */

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearSessionToken();
  writeSessionCarrier('header');
  window.localStorage.clear();
});

describe('session token store', () => {
  it('round-trips a token through localStorage', () => {
    writeSessionToken('token-abc');

    expect(readSessionToken()).toBe('token-abc');
    expect(window.localStorage.getItem('psd.sessionToken.v1')).toBe('token-abc');

    clearSessionToken();
    expect(readSessionToken()).toBeNull();
    expect(window.localStorage.getItem('psd.sessionToken.v1')).toBeNull();
  });

  it('reports no token before anyone signs in', () => {
    expect(readSessionToken()).toBeNull();
  });

  it('keeps working in a frame where storage access throws', () => {
    // A sandboxed iframe, or Safari with storage blocked: touching localStorage throws.
    const denied = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    writeSessionToken('token-in-memory');
    expect(readSessionToken()).toBe('token-in-memory');

    clearSessionToken();
    expect(readSessionToken()).toBeNull();
    expect(denied).toHaveBeenCalled();
  });

  it('remembers the carrier that reached the API, and defaults to the header', () => {
    expect(readSessionCarrier()).toBe('header');
    expect(readSessionCredential()).toBeNull();

    writeSessionToken('tok-9');
    expect(readSessionCredential()).toEqual({ token: 'tok-9', carrier: 'header' });

    writeSessionCarrier('query');
    expect(readSessionCredential()).toEqual({ token: 'tok-9', carrier: 'query' });
    expect(window.localStorage.getItem('psd.sessionCarrier.v1')).toBe('query');
  });

  it('survives storage that accepts a read but refuses a write', () => {
    // Safari in private mode: getItem is fine, setItem throws QuotaExceededError.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    writeSessionToken('tok-quota');
    writeSessionCarrier('query');

    expect(readSessionCredential()).toEqual({ token: 'tok-quota', carrier: 'query' });
  });

  it('stays signed out even when storage refuses to delete the token', () => {
    writeSessionToken('tok-stuck');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    clearSessionToken();

    expect(readSessionToken()).toBeNull();
    expect(readSessionCredential()).toBeNull();

    // And a later sign-in still takes effect.
    writeSessionToken('tok-fresh');
    expect(readSessionToken()).toBe('tok-fresh');
  });

  it('treats the store as the truth once it has accepted the token', () => {
    // Another tab signing out, or the browser clearing site data, must be seen here too —
    // the in-memory copy exists for storage that refuses, not as a second source of truth.
    writeSessionToken('token-xyz');
    window.localStorage.clear();

    expect(readSessionToken()).toBeNull();
  });
});
