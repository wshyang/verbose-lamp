import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof document !== 'undefined') {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});
