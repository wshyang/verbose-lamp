import { afterEach, vi } from 'vitest';

/**
 * Environment shims for the DOM suites (ADDENDUM-027 §5).
 *
 * Cleanup is *not* done here: a dynamic import of Testing Library from this
 * setup file resolves to a second module instance, whose `cleanup()` cannot see
 * the containers the test file rendered. `globals: true` in `vitest.config.ts`
 * lets Testing Library register its own auto-cleanup in the test module, which
 * is the reliable path.
 *
 * What remains here are the browser APIs jsdom does not implement and the
 * components under test read (`useReducedMotion`, the quality resolver, the
 * canvas-based effects).
 */
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  }
  if (!('ResizeObserver' in window)) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
}

afterEach(() => {
  vi.clearAllMocks();
});
