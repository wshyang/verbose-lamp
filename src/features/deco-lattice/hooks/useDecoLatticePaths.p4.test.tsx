// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { renderHook } from '@testing-library/react';

import { useDecoLatticePaths } from './useDecoLatticePaths';

describe('useDecoLatticePaths', () => {
  it('defaults to a unit medallion with the shared seed', () => {
    const { result } = renderHook(() => useDecoLatticePaths(undefined));
    expect(result.current.viewBox).toBe('-1.06 -1.06 2.12 2.12');
    expect(result.current.aspectMode).toBe('xMidYMid meet');
    expect(result.current.groups).toHaveLength(4);
    expect(result.current.uid).toMatch(/^[a-zA-Z0-9]+$/);
    expect(result.current.groups.every((group) => Array.isArray(group.paths))).toBe(true);
  });

  it('orders the layers back to front and stamps a brass angle on each', () => {
    const { result } = renderHook(() => useDecoLatticePaths({ seed: 1925 }));
    expect(result.current.groups.map((group) => group.layer)).toEqual([3, 2, 1, 0]);
    for (const group of result.current.groups) {
      expect(group.brassAngle).toBeGreaterThanOrEqual(0);
      expect(group.brassAngle).toBeLessThanOrEqual(360);
      expect(Number.isInteger(group.brassAngle)).toBe(true);
    }
  });

  it('stretches the viewBox for a frame and keeps it square for a medallion', () => {
    const { result } = renderHook(() => useDecoLatticePaths({ mode: 'frame', hw: 2, hh: 1 }));
    expect(result.current.viewBox).toBe('-2.06 -1.06 4.12 2.12');
    expect(result.current.aspectMode).toBe('none');
  });

  it('is deterministic for the same request and different across seeds', () => {
    const first = renderHook(() => useDecoLatticePaths({ seed: 7, density: 0.5, level: 3 }));
    const second = renderHook(() => useDecoLatticePaths({ seed: 7, density: 0.5, level: 3 }));
    const other = renderHook(() => useDecoLatticePaths({ seed: 8, density: 0.5, level: 3 }));

    expect(first.result.current.groups).toEqual(second.result.current.groups);
    expect(other.result.current.groups).not.toEqual(first.result.current.groups);
  });

  it('keeps the same object between renders while the request is unchanged', () => {
    const { result, rerender } = renderHook(() => useDecoLatticePaths({ seed: 1925 }));
    const groups = result.current.groups;
    rerender();
    expect(result.current.groups).toBe(groups);
  });
});
