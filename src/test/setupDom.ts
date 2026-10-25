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
export function hasDom(): boolean {
  return typeof document !== 'undefined';
}

if (hasDom()) {
  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');
  afterEach(() => cleanup());
}
