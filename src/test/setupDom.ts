import { afterEach } from 'vitest';

/**
 * DOM test setup (ADDENDUM-022 §1.1). Loaded for every suite, so it must be
 * safe in the node environment too: outside jsdom it does nothing. Inside
 * jsdom it unmounts whatever a component test rendered, and gives canvas
 * elements the stub 2D context the texture builders need.
 */
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  await import('vitest-canvas-mock');
  afterEach(() => cleanup());
}
