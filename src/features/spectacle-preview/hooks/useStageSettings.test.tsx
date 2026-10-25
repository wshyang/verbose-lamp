// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { useStageSettings } from './useStageSettings';

setupDomTests();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStageSettings', () => {
  it('opens on the house defaults', () => {
    const { result } = renderHook(() => useStageSettings());

    expect(result.current.origin).toEqual({ x: 0.5, y: 0.42 });
    expect(result.current.intensity).toBe(0.6);
    expect(result.current.seed).toBe(1925);
    expect(result.current.picking).toBe(false);
    expect(result.current.keepClear).toEqual([]);
    expect(result.current.speaker).toEqual({ x: 0.42, y: 0.28, w: 0.16, h: 0.24 });
  });

  it('ignores stage clicks until an origin is being picked', () => {
    const { result } = renderHook(() => useStageSettings());

    expect(result.current.onStageClick(10, 20)).toBe(false);
    expect(result.current.origin).toEqual({ x: 0.5, y: 0.42 });
  });

  it('turns a picked click into a normalised origin', () => {
    const { result } = renderHook(() => useStageSettings());
    act(() => result.current.setPicking(true));

    let handled = false;
    act(() => { handled = result.current.onStageClick(240, 450); });

    expect(handled).toBe(true);
    expect(result.current.origin.x).toBeCloseTo(240 / window.innerWidth);
    expect(result.current.origin.y).toBeCloseTo(450 / window.innerHeight);
    expect(result.current.picking).toBe(false);
  });

  it('clamps the keep-clear speaker inside the stage', () => {
    const { result } = renderHook(() => useStageSettings());
    act(() => result.current.setKeepClearOn(true));

    act(() => result.current.moveSpeaker(-5, -5));
    expect(result.current.speaker.x).toBe(0);
    expect(result.current.speaker.y).toBe(0);

    act(() => result.current.moveSpeaker(9, 9));
    expect(result.current.speaker.x).toBeCloseTo(1 - 0.16);
    expect(result.current.speaker.y).toBeCloseTo(1 - 0.24);
    expect(result.current.keepClear).toHaveLength(1);
    expect(result.current.keepClear[0]).toEqual(result.current.speaker);
  });

  it('rerolls the seed within range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const { result } = renderHook(() => useStageSettings());

    act(() => result.current.rerollSeed());

    expect(result.current.seed).toBe(999999);
  });

  it('takes an explicit seed and intensity', () => {
    const { result } = renderHook(() => useStageSettings());

    act(() => result.current.setSeed(7));
    act(() => result.current.setIntensity(0.9));

    expect(result.current.seed).toBe(7);
    expect(result.current.intensity).toBe(0.9);
  });
});
