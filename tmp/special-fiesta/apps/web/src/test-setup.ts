import '@testing-library/jest-dom/vitest';
import { assertNoUnstubbedCallsGlobally } from './test-utils/fetchStub.js';
import { afterEach } from 'vitest';

/**
 * ADR-058 — Web Storage, supplied when the test environment forgets to.
 *
 * Measured on vitest 3.2.7 + jsdom 27.4.0 (both exactly as the lockfile pins them): inside a test,
 * `window === globalThis` and BOTH `localStorage` and `sessionStorage` read as `undefined`, even
 * though the same jsdom gives a working `localStorage` when driven directly:
 *
 *     new JSDOM('<p>x</p>', { url: 'http://localhost:3000' }).window.localStorage  // Storage
 *
 * jsdom 27 exposes storage as a per-instance accessor, and vitest's jsdom environment copies window
 * properties onto the global before that accessor resolves, so what lands is a getter returning
 * undefined. It is a dependency interaction, not a repo bug, and it took out 86 tests across 14
 * files — every suite that asserts on the offline scan queue, the sprite cache, the backdrop choice
 * or surface memory.
 *
 * This RESTORES coverage rather than papering over a defect, which is the only reason it is
 * acceptable. Production already tolerates missing storage on purpose: `lib/storage/localStore.ts`
 * reads `window.localStorage` inside an `attempt(...)` and degrades to null (ADR-009/019), so a
 * Safari private window costs a participant nothing. Without a Storage here, though, every test
 * asserting that something WAS persisted fails outright, and any test asserting graceful degradation
 * passes for the wrong reason. Supplying the standard object puts both back on honest footing.
 *
 * Deliberately only installed when absent, so the day vitest or jsdom fixes this, the real
 * implementation wins and this becomes dead weight we can delete.
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value));
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as Record<string, unknown>)[name];
  if (existing !== undefined && existing !== null) return;
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

installStorage('localStorage');
installStorage('sessionStorage');

// Each test owns its browser. A cache surviving into the next test is an accidental second actor.
afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

/*
 * ADR-211 — no test may make a request its route table does not cover.
 *
 * ADR-192 worked out why an unstubbed call becomes an intermittent failure in a test that never
 * made it: the stub's throw becomes a rejected promise, plenty of callers start a request
 * without awaiting it, and the runner blames whichever test is on screen when the rejection
 * lands. It also supplied the fix — and left it as something each suite opted into. Two did.
 *
 * Here it is not optional. This runs last, after the suites' own `afterEach` hooks, which is
 * what we want: by then any request a test fired has been made.
 */
afterEach(() => {
  assertNoUnstubbedCallsGlobally();
});
