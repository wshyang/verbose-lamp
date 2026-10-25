/**
 * Global test setup (ADDENDUM-022 §1.1, ADDENDUM-025).
 *
 * Vitest's default environment is node, so most suites never see a DOM. Suites
 * that need one opt in with a file-level `// @vitest-environment jsdom`. This file
 * therefore has to be safe in both worlds: it only touches the document when one
 * exists. React Testing Library's `cleanup()` is registered in phase 1, once the
 * library is a dependency.
 */
export function hasDom(): boolean {
  return typeof document !== 'undefined';
}

if (hasDom()) {
  // Nothing to install yet. Phase 1 adds RTL cleanup here.
}
