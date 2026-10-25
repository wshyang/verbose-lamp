// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { useDrawPool } from './useDrawPool';

setupDomTests();

describe('useDrawPool', () => {
  it('fills the drum with the default guest count', () => {
    const { result } = renderHook(() => useDrawPool());

    expect(result.current.guestCount).toBe(300);
    expect(result.current.pool.length).toBeGreaterThan(0);
    expect(result.current.drawnCount).toBe(0);
  });

  it('resizes the pool with the guest count', () => {
    const { result } = renderHook(() => useDrawPool());
    const full = result.current.pool.length;

    act(() => result.current.setGuestCount(10));

    expect(result.current.pool).toHaveLength(10);
    expect(result.current.pool.length).toBeLessThan(full);
  });

  it('removes each winner and returns the remaining pool', () => {
    const { result } = renderHook(() => useDrawPool());
    const winner = result.current.pool[0];
    let remaining: readonly unknown[] = [];

    act(() => {
      remaining = result.current.exclude(winner);
    });

    expect(result.current.drawnCount).toBe(1);
    expect(result.current.pool.some((entry) => entry.id === winner.id)).toBe(false);
    expect(remaining.some((entry) => (entry as { id: string }).id === winner.id)).toBe(false);
  });

  it('never draws the same guest twice', () => {
    const { result } = renderHook(() => useDrawPool());
    const first = result.current.pool[0];
    const second = result.current.pool[1];

    act(() => {
      result.current.exclude(first);
    });
    act(() => {
      result.current.exclude(second);
    });

    expect(result.current.drawnCount).toBe(2);
    expect(result.current.pool.some((entry) => entry.id === first.id || entry.id === second.id)).toBe(false);
  });

  it('clears the winners back into the drum', () => {
    const { result } = renderHook(() => useDrawPool());
    const before = result.current.pool.length;

    act(() => {
      result.current.exclude(result.current.pool[0]);
    });
    act(() => result.current.clearExclusions());

    expect(result.current.drawnCount).toBe(0);
    expect(result.current.pool).toHaveLength(before);
  });
});
