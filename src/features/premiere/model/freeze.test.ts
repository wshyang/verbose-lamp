import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { FREEZE_PARAM, parseFreezeAt } from './freeze';

// Union of the five parallel implementations' suites (ADDENDUM-028), de-duplicated by
// assertion: each distinct input/expectation pair appears once.
describe('parseFreezeAt', () => {
  it('names the query parameter freezeAt', () => {
    expect(FREEZE_PARAM).toBe('freezeAt');
  });

  describe('a plain visit is not a freeze', () => {
    it.each(['', '?', '?other=1', '?hud=off', '?freeze=4'])('returns null for %j', (search) => {
      expect(parseFreezeAt(search)).toBeNull();
    });
  });

  describe('reads seconds inside the sequence', () => {
    it.each([
      ['?freezeAt=0', 0],
      ['?freezeAt=1', 1],
      ['?freezeAt=4', 4],
      ['?freezeAt=0.25', 0.25],
      ['?freezeAt=4.32', 4.32],
      ['?freezeAt=6.7', 6.7],
      ['?freezeAt=01', 1],
      ['?freezeAt=.5', 0.5],
      ['?freezeAt=5.', 5],
      ['?freezeAt=%2B3', 3],
      ['?freezeAt=1e1', 10],
    ])('%s -> %d', (search, expected) => {
      expect(parseFreezeAt(search)).toBe(expected);
    });

    it('reads the last instant before the end', () => {
      expect(parseFreezeAt(`?freezeAt=${TOTAL_SEQUENCE_DURATION - 0.001}`)).toBeCloseTo(
        TOTAL_SEQUENCE_DURATION - 0.001,
        10,
      );
    });

    it('reads negative zero as plain zero so downstream equality and hashing are stable', () => {
      expect(Object.is(parseFreezeAt('?freezeAt=-0'), 0)).toBe(true);
    });

    it('tolerates surrounding spaces', () => {
      expect(parseFreezeAt('?freezeAt=%204.5%20')).toBe(4.5);
    });
  });

  describe('query string shape', () => {
    it('works without the leading question mark', () => {
      expect(parseFreezeAt('freezeAt=11.28')).toBe(11.28);
    });

    it('finds the parameter among others, before or after it', () => {
      expect(parseFreezeAt('?a=b&freezeAt=33.8&c=d')).toBe(33.8);
      expect(parseFreezeAt('?hud=off&freezeAt=33.8')).toBe(33.8);
      expect(parseFreezeAt('freezeAt=11.28&hud=0')).toBe(11.28);
    });
  });

  describe('rejects values outside the sequence', () => {
    it.each([
      ['the end itself', `?freezeAt=${TOTAL_SEQUENCE_DURATION}`],
      ['just past the end', `?freezeAt=${TOTAL_SEQUENCE_DURATION + 5}`],
      ['a large value', '?freezeAt=99'],
      ['a very large value', '?freezeAt=999'],
      ['a negative whole second', '?freezeAt=-1'],
      ['a negative fraction', '?freezeAt=-0.5'],
      ['an exponent that overflows to Infinity', '?freezeAt=1e999'],
    ])('%s', (_label, search) => {
      expect(parseFreezeAt(search)).toBeNull();
    });
  });

  describe('rejects anything that is not a plain decimal number', () => {
    it.each([
      ['an empty value', '?freezeAt='],
      ['a blank value', '?freezeAt=%20'],
      ['a word', '?freezeAt=abc'],
      ['a sentence-like word', '?freezeAt=soon'],
      ['a hyphenated word', '?freezeAt=act-two'],
      ['Infinity', '?freezeAt=Infinity'],
      ['NaN', '?freezeAt=NaN'],
      ['trailing letters after digits', '?freezeAt=1x'],
      ['trailing letters after a fraction', '?freezeAt=4.32abc'],
      ['a hex literal (Number() would read 16)', '?freezeAt=0x10'],
      ['a binary literal (Number() would read 3)', '?freezeAt=0b11'],
      ['two decimal points', '?freezeAt=1.2.3'],
    ])('%s', (_label, search) => {
      expect(parseFreezeAt(search)).toBeNull();
    });
  });
});
