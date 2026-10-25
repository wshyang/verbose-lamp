/**
 * Global test setup (ADDENDUM-022 §1.1, ADDENDUM-025).
 *
 * Vitest's default environment is node, so most suites never see a DOM. Suites
 * that need one opt in with a file-level `// @vitest-environment jsdom`. This file
 * therefore has to be safe in both worlds: it only touches the document when one
 * exists.
 *
 * React Testing Library mounts into `document.body`; `cleanup()` unmounts between
 * tests. Assertions stay plain `expect` — jest-dom is deliberately not a
 * dependency (ADDENDUM-022 §1.1).
 */
import { installCanvas2d } from './canvasStub';

export function hasDom(): boolean {
  return typeof document !== 'undefined';
}

/** jsdom has no media queries. Components read two of them; stub both as "off". */
function installMatchMedia(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'function') return;
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** jsdom has no ResizeObserver; the spectacle stage observes its host. */
function installResizeObserver(): void {
  if (typeof globalThis.ResizeObserver === 'function') return;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (hasDom()) {
  // React Three Fiber's test renderer drives React's `act`; without this flag React
  // warns that the environment cannot support it (ADDENDUM-029 §2).
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installMatchMedia();
  installResizeObserver();
  // Painters (spectacle layers, effects, canvas hooks) need a 2D context.
  installCanvas2d();
  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');
  afterEach(() => cleanup());
}
