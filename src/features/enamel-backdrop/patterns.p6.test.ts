// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { fieldAt } from './patterns';
import { type BackdropPattern } from './types';

describe('the pattern switch', () => {
  it('refuses an unknown pattern kind instead of guessing a field', () => {
    const frame = { size: 4, bands: 6 };

    expect(() => fieldAt({ x: 0, y: 0 }, frame, { kind: 'laser' } as unknown as BackdropPattern)).toThrow(
      'Unhandled backdrop pattern: {"kind":"laser"}'
    );
  });
});
