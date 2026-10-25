/**
 * Test setup shared by every suite (registered through `setupFiles`).
 *
 * Node suites must not pay for browser shims, so everything here is guarded by a
 * `document` check: in the node environment this file does nothing. DOM suites opt in
 * with `// @vitest-environment jsdom` and then get React Testing Library cleanup, a
 * canvas 2D stub (`vitest-canvas-mock`) and the browser APIs jsdom does not implement
 * but the components under test read (observers, pointer capture, `matchMedia`).
 */
import { afterEach } from 'vitest';

const hasDom = typeof document !== 'undefined';

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
}

async function installDomShims(): Promise<void> {
  await import('vitest-canvas-mock');

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.ResizeObserver ??= NoopObserver;
  globals.IntersectionObserver ??= NoopObserver;
  globals.scrollTo ??= () => {};

  // jsdom ships no pointer capture; drag hooks call it, so give it a no-op home.
  const elementProto = window.Element.prototype as unknown as Record<string, unknown>;
  elementProto.setPointerCapture ??= () => {};
  elementProto.releasePointerCapture ??= () => {};
  elementProto.hasPointerCapture ??= () => false;

  if (typeof window.matchMedia !== 'function') window.matchMedia = matchMediaStub;
}

if (hasDom) await installDomShims();

afterEach(async () => {
  if (!hasDom) return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
