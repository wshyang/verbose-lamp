// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDecoLatticePaths } from './useDecoLatticePaths';

describe('useDecoLatticePaths', () => {
  it('defaults an absent request to the medallion', () => {
    const { result } = renderHook(() => useDecoLatticePaths(undefined));
    expect(result.current.uid).not.toContain(':');
    expect(result.current.groups.map((group) => group.layer)).toEqual([3, 2, 1, 0]);
    expect(result.current.groups.every((group) => group.brassAngle >= 0 && group.brassAngle <= 360)).toBe(true);
    expect(result.current.viewBox).toBe('-1.06 -1.06 2.12 2.12');
    expect(result.current.aspectMode).toBe('xMidYMid meet');
  });

  it('defaults each omitted field in an empty request', () => {
    const { result } = renderHook(() => useDecoLatticePaths({}));
    expect(result.current.aspectMode).toBe('xMidYMid meet');
    expect(result.current.groups.some((group) => group.paths.length > 0)).toBe(true);
  });

  it('honours a full frame request', () => {
    const { result } = renderHook(() => useDecoLatticePaths({
      mode: 'frame', hw: 2, hh: 0.5, seed: 7, density: 0.2, level: 2,
    }));
    expect(result.current.viewBox).toBe('-2.06 -0.56 4.12 1.12');
    expect(result.current.aspectMode).toBe('none');
  });
});
