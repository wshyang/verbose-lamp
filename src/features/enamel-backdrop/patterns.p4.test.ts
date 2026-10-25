// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { fieldAt } from './patterns';
import { type BackdropPattern } from './types';

describe('fieldAt with an unknown pattern', () => {
  it('throws a named error instead of returning a silent value', () => {
    const unknown = { kind: 'guilloche' } as unknown as BackdropPattern;
    expect(() => fieldAt({ x: 1, y: 1 }, { size: 8, bands: 4 }, unknown)).toThrow(/Unhandled backdrop pattern/);
  });
});
