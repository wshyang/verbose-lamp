import { describe, expect, it } from 'vitest';
import { buildStudioPortraitFixture } from './fixtures';
import { DEFAULT_TINT_STRENGTH, tintImageGold } from './tint';

const portrait = buildStudioPortraitFixture(16);
const sapphireDress = { width: 1, height: 1, data: Uint8ClampedArray.from([30, 60, 200, 255]) };

describe('tintImageGold', () => {
  it('is the identity at strength 0 and always keeps alpha', () => {
    const untouched = tintImageGold(portrait, { rampId: 'bright', strength: 0 });
    expect(Array.from(untouched.data)).toEqual(Array.from(portrait.data));
    const gold = tintImageGold(portrait, { rampId: 'deep' });
    for (let at = 3; at < gold.data.length; at += 4) expect(gold.data[at]).toBe(portrait.data[at]);
  });

  it('is pure warm gold at strength 1', () => {
    const gold = tintImageGold(portrait, { rampId: 'champagne', strength: 1 });
    for (let at = 0; at < gold.data.length; at += 4) {
      expect(gold.data[at]).toBeGreaterThanOrEqual(gold.data[at + 1]);
      expect(gold.data[at + 1]).toBeGreaterThanOrEqual(gold.data[at + 2]);
    }
  });

  it('keeps a trace of the original colour at the default strength', () => {
    expect(DEFAULT_TINT_STRENGTH).toBe(0.85);
    const washed = tintImageGold(sapphireDress, { rampId: 'bright' });
    const pure = tintImageGold(sapphireDress, { rampId: 'bright', strength: 1 });
    expect(washed.data[2]).toBeGreaterThan(pure.data[2]);
  });

  it('never mutates its input', () => {
    const before = Array.from(portrait.data);
    tintImageGold(portrait, { rampId: 'bright', strength: 1 });
    expect(Array.from(portrait.data)).toEqual(before);
  });
});
