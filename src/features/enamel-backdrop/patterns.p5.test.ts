// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { fieldAt } from './patterns';
import { type BackdropPattern } from './types';

describe('fieldAt exhaustiveness', () => {
  it('throws on a pattern kind that was never wired in', () => {
    const bogus = { kind: 'plaid' } as unknown as BackdropPattern;
    expect(() => fieldAt({ x: 0, y: 0 }, { size: 4, bands: 2 }, bogus)).toThrow('Unhandled backdrop pattern');
  });
});
