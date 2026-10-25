// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { FREEZE_PARAM, parseFreezeAt } from './freeze';

describe('parseFreezeAt', () => {
  it('reads a bounded time in seconds', () => {
    expect(parseFreezeAt('?freezeAt=4.32')).toBe(4.32);
    expect(parseFreezeAt('freezeAt=1')).toBe(1);
    expect(parseFreezeAt('?hud=0&freezeAt=6.7')).toBe(6.7);
  });

  it('accepts the sequence start', () => {
    expect(parseFreezeAt(`?${FREEZE_PARAM}=0`)).toBe(0);
  });

  it('rejects a missing or empty value', () => {
    expect(parseFreezeAt('')).toBeNull();
    expect(parseFreezeAt('?')).toBeNull();
    expect(parseFreezeAt('?freezeAt=')).toBeNull();
    expect(parseFreezeAt('?freezeAt=%20')).toBeNull();
    expect(parseFreezeAt('?other=2')).toBeNull();
  });

  it('rejects non-numeric, negative and past-the-end values', () => {
    expect(parseFreezeAt('?freezeAt=abc')).toBeNull();
    expect(parseFreezeAt('?freezeAt=NaN')).toBeNull();
    expect(parseFreezeAt('?freezeAt=-1')).toBeNull();
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION}`)).toBeNull();
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION + 5}`)).toBeNull();
  });

  it('keeps sub-second precision', () => {
    expect(parseFreezeAt('?freezeAt=0.25')).toBe(0.25);
  });
});
