// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { parseFreezeAt } from './freeze';

describe('parseFreezeAt', () => {
  it('reads a time inside the sequence from the query string', () => {
    expect(parseFreezeAt('?freezeAt=6.7')).toBe(6.7);
    expect(parseFreezeAt('?hud=off&freezeAt=33.8')).toBe(33.8);
    expect(parseFreezeAt('?freezeAt=0')).toBe(0);
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION - 0.001}`)).toBeCloseTo(37.999, 6);
  });

  it('ignores a missing, blank or out-of-range freeze time', () => {
    expect(parseFreezeAt('')).toBeNull();
    expect(parseFreezeAt('?hud=off')).toBeNull();
    expect(parseFreezeAt('?freezeAt=')).toBeNull();
    expect(parseFreezeAt('?freezeAt=%20')).toBeNull();
    expect(parseFreezeAt('?freezeAt=soon')).toBeNull();
    expect(parseFreezeAt('?freezeAt=Infinity')).toBeNull();
    expect(parseFreezeAt('?freezeAt=-1')).toBeNull();
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION}`)).toBeNull();
    expect(parseFreezeAt('?freezeAt=99')).toBeNull();
  });
});
