import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { FREEZE_PARAM, parseFreezeAt } from './freeze';

describe('parseFreezeAt', () => {
  it('reads a whole second', () => {
    expect(parseFreezeAt('?freezeAt=4')).toBe(4);
    expect(FREEZE_PARAM).toBe('freezeAt');
  });

  it('reads fractional seconds, including zero', () => {
    expect(parseFreezeAt('?freezeAt=4.32')).toBe(4.32);
    expect(parseFreezeAt('?freezeAt=0')).toBe(0);
  });

  it('ignores an absent or unrelated query', () => {
    expect(parseFreezeAt('')).toBeNull();
    expect(parseFreezeAt('?hud=0')).toBeNull();
    expect(parseFreezeAt('?freeze=4')).toBeNull();
  });

  it('rejects values outside the sequence', () => {
    expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION}`)).toBeNull();
    expect(parseFreezeAt('?freezeAt=-1')).toBeNull();
    expect(parseFreezeAt('?freezeAt=999')).toBeNull();
  });

  it('rejects anything that is not a number', () => {
    expect(parseFreezeAt('?freezeAt=abc')).toBeNull();
    expect(parseFreezeAt('?freezeAt=4.32abc')).toBeNull();
    expect(parseFreezeAt('?freezeAt=')).toBeNull();
  });

  it('works without the leading question mark and with extra params', () => {
    expect(parseFreezeAt('freezeAt=11.28&hud=0')).toBe(11.28);
  });
});
