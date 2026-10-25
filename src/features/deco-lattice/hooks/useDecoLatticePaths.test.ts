// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { useDecoLatticePaths } from './useDecoLatticePaths';

setupDomTests();

describe('useDecoLatticePaths', () => {
  it('groups four layers back to front and seeds each brass angle', () => {
    const { result } = renderHook(() => useDecoLatticePaths({ seed: 1925, level: 4 }));

    expect(result.current.groups.map((group) => group.layer)).toEqual([3, 2, 1, 0]);
    for (const group of result.current.groups) {
      expect(group.brassAngle).toBeGreaterThanOrEqual(0);
      expect(group.brassAngle).toBeLessThan(360);
    }
    expect(result.current.groups[3].paths.length).toBeGreaterThan(0);
  });

  it('defaults every request field', () => {
    const { result } = renderHook(() => useDecoLatticePaths(undefined));
    const withDefaults = renderHook(() =>
      useDecoLatticePaths({ mode: 'medallion', hw: 1, hh: 1, seed: 1925, density: 0.7, level: 4 }),
    );

    expect(result.current.viewBox).toBe(withDefaults.result.current.viewBox);
    expect(result.current.groups.map((g) => g.paths.length)).toEqual(
      withDefaults.result.current.groups.map((g) => g.paths.length),
    );
  });

  it('sizes the viewBox with a margin and keeps the medallion aspect', () => {
    const { result } = renderHook(() => useDecoLatticePaths({ mode: 'medallion', hw: 2, hh: 1 }));

    expect(result.current.viewBox).toBe('-2.06 -1.06 4.12 2.12');
    expect(result.current.aspectMode).toBe('xMidYMid meet');
  });

  it('stretches frame mode to fill the box', () => {
    const { result } = renderHook(() => useDecoLatticePaths({ mode: 'frame', hw: 1.6, hh: 1 }));
    expect(result.current.aspectMode).toBe('none');
  });

  it('produces an SSR-safe id without punctuation', () => {
    const { result } = renderHook(() => useDecoLatticePaths({}));
    expect(result.current.uid).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('is deterministic per seed and changes with it', () => {
    const a = renderHook(() => useDecoLatticePaths({ seed: 7 }));
    const b = renderHook(() => useDecoLatticePaths({ seed: 7 }));
    const c = renderHook(() => useDecoLatticePaths({ seed: 8 }));

    expect(a.result.current.groups[3].brassAngle).toBe(b.result.current.groups[3].brassAngle);
    expect(a.result.current.groups.map((g) => g.paths)).toEqual(b.result.current.groups.map((g) => g.paths));
    expect(a.result.current.groups.map((g) => g.brassAngle)).not.toEqual(
      c.result.current.groups.map((g) => g.brassAngle),
    );
  });
});
