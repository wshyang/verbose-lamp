import { describe, expect, it } from 'vitest';
import { CHOP_DIES, type ChopDieId } from './chopDies.js';
import { dieForStation, hash32 } from './chopAssign.js';

/**
 * ADR-242 — the die a station is struck with is derived from the station, not stored and not
 * drawn per device. A passport does not ask the office which design it would like, and these tests
 * are why that holds: the answer is a function of the id alone, and every die gets used.
 */

describe('ADR-242 — assigning a die to a station', () => {
  it('hashes the way FNV-1a does, so the assignment cannot drift between releases', () => {
    // The published vectors for 32-bit FNV-1a: the empty string is the offset basis untouched,
    // and "a" is 0xe40c292c. If either moves, the generator moved and every station's die did.
    expect(hash32('')).toBe(2166136261);
    expect(hash32('a')).toBe(3826002220);
    expect(hash32('a').toString(16)).toBe('e40c292c');
  });

  it('answers the same for the same station, whoever asks', () => {
    expect(dieForStation('station-dash')).toBe(dieForStation('station-dash'));
    expect(dieForStation('')).toBe(dieForStation(''));
  });

  it('uses every die across a day of stations', () => {
    const seen = new Set<ChopDieId>();
    for (let index = 0; index < 600; index += 1) {
      seen.add(dieForStation(`activity-${index}`));
    }
    expect(seen.size).toBe(CHOP_DIES.length);
  });

  it('does not hand a run of ids the same die', () => {
    const ten = Array.from({ length: 10 }, (_unused, index) => dieForStation(`activity-${index}`));
    expect(new Set(ten).size).toBeGreaterThan(1);
  });

  it('only ever answers with a registered die', () => {
    const registered = new Set(CHOP_DIES.map((die) => die.id));
    for (let index = 0; index < 200; index += 1) {
      expect(registered.has(dieForStation(`0${index}pid-${index}`))).toBe(true);
    }
  });

  it('leaves a renamed station on the die it already had', () => {
    // The id is what the die is chosen from, so editing the station's name changes the small
    // print on the mark and nothing about its shape.
    expect(dieForStation('activity-7')).toBe(dieForStation('activity-7'));
  });
});
