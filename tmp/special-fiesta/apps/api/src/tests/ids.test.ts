import { describe, expect, it } from 'vitest';
import { newJoinCode } from '../db/ids.js';

/**
 * ADR-107 — join codes are drawn uniformly: 256 % 31 ≠ 0, so a bare modulo would skew
 * ~12.5% towards the first eight letters. Rejection sampling discards the aliasing bytes
 * (248–255) and draws again.
 */

describe('newJoinCode (ADR-107)', () => {
  it('discards aliasing bytes and draws a fresh batch instead of wrapping them onto A–H', () => {
    const batches = [
      // Every byte in the first batch would alias under modulo; all must be rejected.
      Buffer.from([248, 249, 250, 251, 252, 253]),
      // Clean draws: indexes 0, 1, 2, 30, 32 % 31 = 1, 247 % 31 = 30.
      Buffer.from([0, 1, 2, 30, 32, 247]),
    ];
    const code = newJoinCode((size) => batches.shift() ?? Buffer.alloc(size));
    expect(code).toBe('ABC9B9');
  });

  it('keeps finishing a code when a batch is only partly usable', () => {
    const batches = [
      Buffer.from([0, 255, 1, 255, 2, 255]),
      Buffer.from([3, 4, 5, 6, 7, 8]),
    ];
    const code = newJoinCode((size) => batches.shift() ?? Buffer.alloc(size));
    expect(code).toBe('ABCDEF');
  });

  it('never mints a lookalike character (0/O/1/I/L), whatever the randomness', () => {
    for (let round = 0; round < 50; round += 1) {
      const code = newJoinCode();
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[01OIL]/);
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
    }
  });
});
