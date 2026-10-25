// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFrameStudio, type FrameStudioTarget } from './useFrameStudio';
import { setupDomTests } from '@/test/dom';

setupDomTests();
function target_p6(): FrameStudioTarget & { [K in keyof FrameStudioTarget]: ReturnType<typeof vi.fn> } {
  return {
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
  } as unknown as FrameStudioTarget & { [K in keyof FrameStudioTarget]: ReturnType<typeof vi.fn> };
}
function studio_p6(scene: FrameStudioTarget | null = target_p6()) {
  const ref = { current: scene };
  const { result } = renderHook(() => useFrameStudio(() => ref.current));
  return { result, ref };
}
describe('useFrameStudio', () => {
  it('rerolls the lattice seed into the six-digit range', () => {
    const scene = target_p6();
    const { result } = studio_p6(scene);
    act(() => result.current.selectPattern('lattice'));
    const before = result.current.level;

    act(() => result.current.rerollPattern());

    const style = scene.setSequenceFrameStyle.mock.calls.at(-1)?.[0] as { formula: { seed?: number } };
    expect(style.formula.seed).toBeGreaterThanOrEqual(0);
    expect(style.formula.seed).toBeLessThan(1_000_000);
    expect(result.current.level).toBe(before);
  });

  it('switches the proscenium pattern and rerolls its seed', () => {
    const scene = target_p6();
    const { result } = studio_p6(scene);

    act(() => result.current.setBorderPattern('lattice'));
    expect(result.current.borderPattern).toBe('lattice');
    expect(scene.setScreenBorderStyle).toHaveBeenCalledTimes(1);

    act(() => result.current.rerollBorder());
    const style = scene.setScreenBorderStyle.mock.calls.at(-1)?.[0] as { seed?: number; pattern?: string };
    expect(style.pattern).toBe('lattice');
    expect(style.seed).toBeGreaterThanOrEqual(0);
    expect(style.seed).toBeLessThan(1_000_000);
  });
});
