import { describe, expect, it } from 'vitest';
import { DIGEST_DECIMALS, quantize, quantizeDeep, stableDigest } from './digest';

describe('quantize', () => {
  it('rounds to the configured number of decimals', () => {
    expect(quantize(0.1234567891)).toBe(0.123457);
    expect(quantize(-1.9999999)).toBe(-2);
    expect(quantize(DIGEST_DECIMALS === 6 ? 1.0000004 : 0)).toBe(1);
  });

  it('absorbs the last-bit noise that differs between hosts', () => {
    const hostA = 0.3;
    const hostB = 0.30000000000000004;
    expect(hostB).not.toBe(hostA);
    expect(quantize(hostB)).toBe(quantize(hostA));
  });

  it('normalises negative zero so serialisation is stable', () => {
    expect(Object.is(quantize(-0), 0)).toBe(true);
    expect(Object.is(quantize(-1e-12), -0)).toBe(false);
  });

  it('passes non-finite numbers through untouched', () => {
    expect(Number.isNaN(quantize(Number.NaN))).toBe(true);
    expect(quantize(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('quantizeDeep', () => {
  it('walks arrays and objects without mutating the input', () => {
    const input = { a: [0.1234567, { b: -0.0000001 }], c: 'text', d: null };
    const snapshot = JSON.stringify(input);
    const output = quantizeDeep(input) as typeof input;
    expect(output.a[0]).toBe(0.123457);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(output.c).toBe('text');
    expect(output.d).toBeNull();
  });

  it('leaves primitives other than numbers alone', () => {
    expect(quantizeDeep('x')).toBe('x');
    expect(quantizeDeep(true)).toBe(true);
    expect(quantizeDeep(undefined)).toBeUndefined();
  });
});

describe('stableDigest', () => {
  it('fingerprints equal values identically whatever the float noise', () => {
    const a = stableDigest({ sparks: [{ speed: 0.34 }, { speed: 0.12 }] });
    const b = stableDigest({ sparks: [{ speed: 0.3400000000000001 }, { speed: 0.12000000000000001 }] });
    expect(b).toEqual(a);
  });

  it('changes when the value really changes, and reports the serialised size', () => {
    const base = stableDigest({ speed: 0.34 });
    const moved = stableDigest({ speed: 0.35 });
    expect(moved.hash).not.toBe(base.hash);
    expect(base.length).toBe('{"speed":0.34}'.length);
  });
});
