// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDecoLatticePaths } from './useDecoLatticePaths';

describe('useDecoLatticePaths', () => {
  it('falls back to the medallion defaults and split aspect fit', () => {
    const { result } = renderHook(() => useDecoLatticePaths(undefined));
    expect(result.current.groups).toHaveLength(4);
    expect(result.current.aspectMode).toBe('xMidYMid meet');
    expect(result.current.uid).toMatch(/^[a-zA-Z0-9]+$/);

    const defaults = renderHook(() => useDecoLatticePaths({}));
    expect(defaults.result.current.viewBox).toBe(result.current.viewBox);
  });

  it('stretches a frame to the full viewport', () => {
    const { result } = renderHook(() =>
      useDecoLatticePaths({ mode: 'frame', hw: 1.6, hh: 1, seed: 1925, density: 0.5, level: 2 }),
    );
    expect(result.current.aspectMode).toBe('none');
    const width = Number(result.current.viewBox.split(' ')[2]);
    expect(width).toBeGreaterThan(3.2);
    const total = result.current.groups.reduce((sum, group) => sum + group.paths.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('layers the paths back to front with a brass angle per layer', () => {
    const { result } = renderHook(() => useDecoLatticePaths({ seed: 7, density: 1, level: 4 }));
    expect(result.current.groups.map((group) => group.layer)).toEqual([3, 2, 1, 0]);
    for (const group of result.current.groups) {
      expect(group.brassAngle).toBeGreaterThanOrEqual(0);
      expect(group.brassAngle).toBeLessThan(360);
    }
  });
});
