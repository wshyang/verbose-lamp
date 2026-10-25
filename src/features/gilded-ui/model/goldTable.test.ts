import { describe, expect, it } from 'vitest';
import { goldTableValues } from './goldTable';

describe('goldTableValues', () => {
  it('matches the classic ramp snapshot', () => {
    expect(goldTableValues('classic')).toEqual({
      r: '0.1412 0.4314 0.7255 0.9569 1.0000',
      g: '0.0824 0.3020 0.5412 0.7882 0.9529',
      b: '0.0118 0.1098 0.2275 0.3647 0.7686',
    });
  });

  it('produces five monotone-ish stops per channel for every ramp', () => {
    for (const id of ['classic', 'champagne', 'brass', 'ember'] as const) {
      const t = goldTableValues(id);
      for (const channel of [t.r, t.g, t.b]) {
        const values = channel.split(' ').map(Number);
        expect(values.length).toBe(5);
        expect(values[4]).toBeGreaterThan(values[0]);
      }
    }
  });
});