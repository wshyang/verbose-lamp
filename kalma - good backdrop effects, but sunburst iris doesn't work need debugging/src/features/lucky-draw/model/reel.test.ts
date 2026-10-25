import { describe, expect, it } from 'vitest';
import { isPlateHidden, plateEntryIndex, plateSlot, visibleRows, wrapHalf } from './reel';

describe('virtual reel', () => {
  it('visible window shows contiguous entries with wrap-around', () => {
    for (const n of [2, 7, 30, 300, 2000]) {
      for (const p of [0, 3.2, 15.9, 123.4, -8.5]) {
        const rows = visibleRows(p, n);
        for (let i = 1; i < rows.length; i += 1) {
          expect((rows[i - 1] + 1) % n).toBe(rows[i]);
        }
      }
    }
  });

  it('relabels only happen on hidden plates while P advances', () => {
    for (let p = 0; p < 40; p += 0.1) {
      for (let plate = 0; plate < 16; plate += 1) {
        const before = plateSlot(plate, p);
        const after = plateSlot(plate, p + 0.05);
        if (before !== after) {
          expect(isPlateHidden(plate, p + 0.025)).toBe(true);
        }
      }
    }
  });

  it('entry indices stay in range for N from 2 to 2000', () => {
    for (const n of [2, 3, 16, 30, 300, 2000]) {
      for (let plate = 0; plate < 16; plate += 1) {
        const idx = plateEntryIndex(plate, 1234.56, n);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(n);
      }
    }
  });

  it('wrapHalf stays in [−8, 8)', () => {
    for (let x = -40; x < 40; x += 0.37) {
      const w = wrapHalf(x);
      expect(w).toBeGreaterThanOrEqual(-8);
      expect(w).toBeLessThan(8);
    }
  });
});