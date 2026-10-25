// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { parseFreezeAt } from './freeze';

describe('parseFreezeAt', () => {
  it('accepts in-range freeze times with or without the leading question mark', () => {
    expect(parseFreezeAt('?freezeAt=4.32')).toBe(4.32);
    expect(parseFreezeAt('freezeAt=0')).toBe(0);
    expect(parseFreezeAt('?other=1&freezeAt=37.999')).toBe(37.999);
  });

  it('rejects absent, empty and unparsable values', () => {
    expect(parseFreezeAt('')).toBeNull();
    expect(parseFreezeAt('?other=1')).toBeNull();
    expect(parseFreezeAt('?freezeAt=')).toBeNull();
    expect(parseFreezeAt('?freezeAt=act-two')).toBeNull();
    expect(parseFreezeAt('?freezeAt=Infinity')).toBeNull();
  });

  it('rejects times outside the 38 s sequence', () => {
    expect(parseFreezeAt('?freezeAt=-0.5')).toBeNull();
    expect(parseFreezeAt('?freezeAt=38')).toBeNull();
    expect(parseFreezeAt('?freezeAt=90')).toBeNull();
  });
});
