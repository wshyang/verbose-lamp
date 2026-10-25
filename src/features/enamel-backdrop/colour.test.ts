import { describe, expect, it } from 'vitest';
import { mixRgb, parseHexColour, scaleRgb } from './colour';

describe('parseHexColour', () => {
  it('reads six-digit hex with or without the hash and any case', () => {
    expect(parseHexColour('#ff8800')).toEqual([255, 136, 0]);
    expect(parseHexColour('FF8800')).toEqual([255, 136, 0]);
    expect(parseHexColour('  #0a0b0c  ')).toEqual([10, 11, 12]);
  });

  it('falls back to black for anything else', () => {
    expect(parseHexColour('#fff')).toEqual([0, 0, 0]);
    expect(parseHexColour('emerald')).toEqual([0, 0, 0]);
    expect(parseHexColour('')).toEqual([0, 0, 0]);
  });
});

describe('mixRgb', () => {
  it('walks from the base to the overlay', () => {
    expect(mixRgb([0, 0, 0], [100, 50, 20], 0)).toEqual([0, 0, 0]);
    expect(mixRgb([0, 0, 0], [100, 50, 20], 1)).toEqual([100, 50, 20]);
    expect(mixRgb([0, 0, 0], [100, 50, 20], 0.5)).toEqual([50, 25, 10]);
  });

  it('clamps the share to 0..1', () => {
    expect(mixRgb([10, 10, 10], [20, 20, 20], -3)).toEqual([10, 10, 10]);
    expect(mixRgb([10, 10, 10], [20, 20, 20], 9)).toEqual([20, 20, 20]);
  });
});

describe('scaleRgb', () => {
  it('scales every channel', () => {
    expect(scaleRgb([10, 20, 30], 2)).toEqual([20, 40, 60]);
    expect(scaleRgb([10, 20, 30], 0)).toEqual([0, 0, 0]);
  });
});
