import { describe, expect, it } from 'vitest';
import { formatSeconds } from './formatTime';

describe('formatSeconds', () => {
  it('formats minute and second values with two digits', () => {
    expect(formatSeconds(68.9)).toBe('01:08');
  });

  it('clamps negative values to zero', () => {
    expect(formatSeconds(-4)).toBe('00:00');
  });
});