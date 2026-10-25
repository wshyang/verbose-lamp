import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { parseFreezeAt } from './freeze';

describe('parseFreezeAt (ADDENDUM-022 §0.2)', () => {
  it('accepts a plain visit as unfrozen', () => {
    expect(parseFreezeAt('')).toBeNull();
    expect(parseFreezeAt('?')).toBeNull();
    expect(parseFreezeAt('?other=1')).toBeNull();
  });

  it('parses seconds inside the sequence', () => {
    expect(parseFreezeAt('?freezeAt=0')).toBe(0);
    expect(parseFreezeAt('?freezeAt=4.32')).toBe(4.32);
    expect(parseFreezeAt('?a=b&freezeAt=33.8&c=d')).toBe(33.8);
    expect(parseFreezeAt('freezeAt=11.28')).toBe(11.28);
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION - 0.001}`))
      .toBeCloseTo(TOTAL_SEQUENCE_DURATION - 0.001, 10);
  });

  it('rejects out-of-range and malformed values', () => {
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION}`)).toBeNull();
    expect(parseFreezeAt('?freezeAt=99')).toBeNull();
    expect(parseFreezeAt('?freezeAt=-1')).toBeNull();
    expect(parseFreezeAt('?freezeAt=')).toBeNull();
    expect(parseFreezeAt('?freezeAt=abc')).toBeNull();
    expect(parseFreezeAt('?freezeAt=Infinity')).toBeNull();
    expect(parseFreezeAt('?freezeAt=NaN')).toBeNull();
    expect(parseFreezeAt('?freezeAt=1x')).toBeNull();
    expect(parseFreezeAt('?freezeAt=0x10')).toBeNull();
    expect(parseFreezeAt('?freezeAt=01')).toBe(1);
  });
});
