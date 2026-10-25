/**
 * Test setup shared by every suite (registered through `setupFiles`).
 *
 * Node suites must not pay for browser shims, so everything here is guarded by a
 * `document` check: in the node environment this file does nothing. DOM suites
 * opt in with `// @vitest-environment jsdom` and then get React Testing Library
 * cleanup, a canvas 2D stub and the two observers jsdom does not implement
 * (ADDENDUM-025).
 */
import { afterEach } from 'vitest';

const hasDom = typeof document !== 'undefined';

if (hasDom) {
  await import('vitest-canvas-mock');

  class NoopObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  }

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.ResizeObserver ??= NoopObserver;
  globals.IntersectionObserver ??= NoopObserver;
  globals.scrollTo ??= () => {};

  // jsdom ships no pointer capture; drag hooks call it, so give it a no-op home.
  const elementProto = window.Element.prototype as unknown as Record<string, unknown>;
  elementProto.setPointerCapture ??= () => {};
  elementProto.releasePointerCapture ??= () => {};
  elementProto.hasPointerCapture ??= () => false;

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
}

afterEach(async () => {
  if (!hasDom) return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
