// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NAV_LINES } from '../data/navLines';
import { useGoldUiLines } from './useGoldUiLines';
import { useLatticeControls } from './useLatticeControls';

afterEach(() => vi.restoreAllMocks());

describe('useLatticeControls', () => {
  it('starts from the documented defaults', () => {
    const { result } = renderHook(() => useLatticeControls());

    expect(result.current.latticeSeed).toBe(1925);
    expect(result.current.latticeDensity).toBe(0.7);
    expect(result.current.latticeLevel).toBe(4);
  });

  it('rerolls the seed into the six-digit range', () => {
    const { result } = renderHook(() => useLatticeControls());

    act(() => result.current.rerollLattice());
    const first = result.current.latticeSeed;
    act(() => result.current.rerollLattice());

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1_000_000);
    expect(Number.isInteger(first)).toBe(true);
    expect(result.current.latticeSeed).not.toBe(1925);
  });

  it('stores density and level edits, and a reroll leaves them alone', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const { result } = renderHook(() => useLatticeControls());

    act(() => result.current.setLatticeDensity(0.3));
    act(() => result.current.setLatticeLevel(2));
    act(() => result.current.rerollLattice());

    expect(result.current.latticeDensity).toBe(0.3);
    expect(result.current.latticeLevel).toBe(2);
    expect(result.current.latticeSeed).toBe(250_000);
  });

  it('hands out a stable reroll, so a memoised control does not re-render', () => {
    const { result, rerender } = renderHook(() => useLatticeControls());
    const first = result.current.rerollLattice;

    rerender();

    expect(result.current.rerollLattice).toBe(first);
  });
});

describe('useGoldUiLines', () => {
  it('parses the default nav lines into a valid bar', () => {
    const { result } = renderHook(() => useGoldUiLines());

    expect(result.current.navText).toBe(DEFAULT_NAV_LINES);
    expect(result.current.navValidation.ok).toBe(true);
    expect(result.current.navItems).toHaveLength(5);
  });

  it('keeps the default bar while the editor is invalid', () => {
    const { result } = renderHook(() => useGoldUiLines());
    const defaults = result.current.navItems;

    act(() => result.current.setNavText('no emoji or label separator'));

    expect(result.current.navValidation.ok).toBe(false);
    expect(result.current.navItems).toEqual(defaults);
    expect(result.current.navItems.map((item) => item.label)).toContain('Foyer');
  });

  it('accepts a rewritten bar once it validates', () => {
    const { result } = renderHook(() => useGoldUiLines());

    act(() => result.current.setNavText('🥂,Toast\n🎷,Program'));

    expect(result.current.navValidation.ok).toBe(true);
    expect(result.current.navItems.map((item) => item.label)).toEqual(['Toast', 'Program']);
  });
});
