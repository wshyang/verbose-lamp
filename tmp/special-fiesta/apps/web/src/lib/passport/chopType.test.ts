import { describe, expect, it } from 'vitest';
import { MAX_LABEL, arcOf, estimateLength, fitLabel, heroOf, lineOf } from './chopType.js';
import { seededRandom } from './chopRandom.js';
import { roundedRectPath } from './chopGeo.js';

/**
 * ADR-242 — the type a die carries.
 *
 * The word and the station's name are set here, by hand and on purpose: a chop shouts its one word
 * and whispers where it was stamped, and both are stretched to the die rather than to the letters.
 */

describe('ADR-242 — setting a die’s type', () => {
  it('shouts the station: upper case, single spaces, trimmed', () => {
    expect(fitLabel('  sandcastle   relay ')).toBe('SANDCASTLE RELAY');
  });

  it('ends a name it cannot fit with an ellipsis, inside the cap', () => {
    const label = fitLabel('Tug of War Tournament Final Round');
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBe(MAX_LABEL);
  });

  it('leaves a name exactly at the cap alone', () => {
    const exact = 'B'.repeat(MAX_LABEL);
    expect(fitLabel(exact)).toBe(exact);
  });

  it('centres a line on the die, which is where a die says where it goes', () => {
    const line = lineOf(seededRandom(1), {
      content: 'COMPLETED',
      centre: 0,
      y: 10,
      size: 20,
      length: 120,
    });
    expect(line.x).toBe(-60);
    expect(line.length).toBe(120);
    expect(line.content).toBe('COMPLETED');
  });

  it('gives every character its own baseline and its own turn', () => {
    const line = lineOf(seededRandom(2), { content: 'BEACH DASH', centre: 0, y: -20, size: 10, length: 100 });
    expect(line.y).toHaveLength(10);
    expect(line.rotate).toHaveLength(10);
    expect(new Set(line.y).size).toBeGreaterThan(1);
    for (const value of line.y) expect(Math.abs(value + 20)).toBeLessThanOrEqual(0.45);
  });

  it('estimates a width when the die sets none, and scales it with the size', () => {
    const line = lineOf(seededRandom(3), { content: 'NO 1234', centre: 0, y: 20, size: 10 });
    expect(line.length).toBe(estimateLength('NO 1234', 10));
    expect(estimateLength('ABCD', 10)).toBeGreaterThan(estimateLength('AB', 10));
    expect(estimateLength('ABCD', 20)).toBeGreaterThan(estimateLength('ABCD', 10));
  });

  it('sets the word heavier and more uneven than the small print', () => {
    const spec = { content: 'COMPLETED', centre: 0, y: 0, size: 26, length: 140 };
    const hero = heroOf(seededRandom(4), spec);
    const quiet = lineOf(seededRandom(4), spec);
    expect(hero.weight).toBe(800);
    expect(quiet.weight).toBe(700);
    expect(Math.max(...hero.y.map(Math.abs))).toBeGreaterThan(Math.max(...quiet.y.map(Math.abs)));
    expect(Math.max(...hero.rotate.map(Math.abs))).toBeGreaterThan(Math.max(...quiet.rotate.map(Math.abs)));
  });

  it('lets a die set its own weight over the default', () => {
    const bold = lineOf(seededRandom(5), { content: 'NO 1', centre: 0, y: 0, size: 8, weight: 900 });
    expect(bold.weight).toBe(900);
  });

  it('hands a curved line the path it is to run along', () => {
    const path = roundedRectPath({ width: 40, height: 20 });
    expect(arcOf({ content: 'BEACH DASH', path, size: 9 })).toEqual({
      content: 'BEACH DASH',
      path,
      size: 9,
      weight: 700,
    });
  });
});
