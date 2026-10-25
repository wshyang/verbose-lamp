import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Registers Testing Library cleanup for a DOM suite. Called from the test file
 * (not a setup file) so `cleanup` and `render` share one module instance —
 * a setup-file import resolves to a second copy and cannot see the containers.
 */
export function setupDomTests(): void {
  afterEach(cleanup);
}
