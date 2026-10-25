// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useFrameStudio, type FrameStudioTarget } from './useFrameStudio';

function setup(target: FrameStudioTarget | null = {
  setSequenceFrameStyle: vi.fn(),
  setScreenBorderStyle: vi.fn(),
  setScreenBorderEnabled: vi.fn(),
}) {
  const getTarget = vi.fn(() => target);
  const rendered = renderHook(() => useFrameStudio(getTarget));
  return { ...rendered, target, getTarget };
}
afterEach(() => vi.restoreAllMocks());
describe('useFrameStudio', () => {
  it('routes genes and weight to the border after switching surfaces', () => {
    const { result, target } = setup();
    act(() => result.current.setSurface('screen-border'));
    expect(result.current.surface).toBe('screen-border');
    expect(result.current.borderEnabled).toBe(true);
    expect(target?.setScreenBorderEnabled).toHaveBeenCalledWith(true);

    act(() => result.current.setGene('rayDensity', 1.4));
    act(() => result.current.setBorderWeight(82));
    act(() => result.current.setBorderPattern('lattice'));
    expect(result.current.borderWeight).toBe(82);
    expect(result.current.borderPattern).toBe('lattice');
    expect(target?.setScreenBorderStyle).toHaveBeenLastCalledWith(expect.objectContaining({ pattern: 'lattice' }));

    act(() => result.current.setSurface('screen-border'));
    expect(target?.setScreenBorderEnabled).toHaveBeenCalledTimes(1);
    act(() => result.current.setBorderEnabled(false));
    expect(result.current.borderEnabled).toBe(false);
  });

  it('supports a missing scene target and resets every surface', () => {
    const { result } = setup(null);
    act(() => result.current.selectPattern('rosette'));
    act(() => result.current.setProportionsOpen(true));
    act(() => result.current.setBorderPattern('lattice'));
    act(() => result.current.resetAll());
    expect(result.current.baseSource).toBe('authored');
    expect(result.current.surface).toBe('title-cards');
    expect(result.current.borderEnabled).toBe(false);
    expect(result.current.borderPattern).toBe('poster');
    expect(result.current.proportionsOpen).toBe(false);
  });
});
