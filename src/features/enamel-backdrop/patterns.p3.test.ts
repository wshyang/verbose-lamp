// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { fieldAt } from './patterns';
import { type BackdropPattern } from './types';

describe('fieldAt rejects an unwired pattern', () => {
  it('throws with the pattern in the message', () => {
    expect(() =>
      fieldAt({ x: 0, y: 0 }, { size: 8, bands: 3 }, { kind: 'lace' } as unknown as BackdropPattern),
    ).toThrow(/Unhandled backdrop pattern/);
  });
});
