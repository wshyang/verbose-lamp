import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeItem } from '../storage/localStore.js';
import { readStickySessionId } from './stickySession.js';

/**
 * ADR-263 — the browser's sticky-session id: drawn once, kept, and the same on
 * every call, because a load balancer can only hash a value that does not move.
 */

const KEY = 'psd.stickySession.v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  removeItem(KEY);
});

describe('ADR-263 — the sticky-session id', () => {
  it('draws one id, keeps it, and hands the same one back', () => {
    const first = readStickySessionId();
    expect(first.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(KEY)).toBe(first);
    expect(readStickySessionId()).toBe(first);
  });

  it('reads back the kept id after a reload, as a returning browser would', async () => {
    window.localStorage.setItem(KEY, 'a-kept-sticky-id');
    vi.resetModules();
    const reloaded = await import('./stickySession.js');
    expect(reloaded.readStickySessionId()).toBe('a-kept-sticky-id');
  });

  it('is not the session token and does not change when a session does', async () => {
    const { writeSessionToken, clearSessionToken } = await import('./tokenStore.js');
    const before = readStickySessionId();
    writeSessionToken('tok-1');
    expect(readStickySessionId()).toBe(before);
    expect(readStickySessionId()).not.toBe('tok-1');
    clearSessionToken();
    expect(readStickySessionId()).toBe(before);
  });
});
