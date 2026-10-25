// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { randomIndex } from './random';

describe('randomIndex', () => {
  const fillWith = (value: number) => (buf: Uint32Array) => {
    buf[0] = value;
    return buf;
  };

  it('reduces the drawn word into [0, n)', () => {
    expect(randomIndex(4, fillWith(7))).toBe(3);
    expect(randomIndex(10, fillWith(0))).toBe(0);
    expect(randomIndex(6, fillWith(4294967295))).toBe(4294967295 % 6);
  });

  it('draws exactly one 32-bit word', () => {
    const lengths: number[] = [];
    randomIndex(3, (buf) => {
      lengths.push(buf.length);
      return buf;
    });
    expect(lengths).toEqual([1]);
  });
});
