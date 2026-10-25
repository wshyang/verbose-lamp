// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('starts with the authored film baseline and all catalogue data', () => {
    const { result, unmount } = setup();
    expect(result.current.isOpen).toBe(true);
    expect(result.current.surface).toBe('title-cards');
    expect(result.current.baseSource).toBe('authored');
    expect(result.current.isDesignPattern).toBe(true);
    expect(result.current.isLatticePattern).toBe(false);
    expect(result.current.latticeSeed).toBe(1925);
    expect(result.current.detailPercent).toBe(50);
    expect(result.current.activePreset?.id).toBe('baseline');
    expect(result.current.layers.map((layer) => layer.source)).toEqual(['fractal', 'rosette', 'arcade', 'lattice']);
    expect(result.current.designGallery.length).toBeGreaterThan(0);
    unmount();
  });

  it('commits pattern, design, gene, layer, level, and detail changes', () => {
    const { result, target } = setup();
    act(() => result.current.selectPattern('lattice'));
    expect(result.current.baseSource).toBe('lattice');
    expect(result.current.isLatticePattern).toBe(true);
    expect(result.current.layers.some((layer) => layer.source === 'lattice')).toBe(false);

    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    act(() => result.current.rerollSeed());
    expect(result.current.latticeSeed).toBe(123456);

    act(() => result.current.setLayerEnabled('fractal', true));
    act(() => result.current.setLayerLevel('fractal', 99));
    expect(result.current.layers[0]).toMatchObject({ enabled: true, level: 4 });
    act(() => result.current.setLayerLevel('fractal', -4));
    expect(result.current.layers[0].level).toBe(1);

    act(() => result.current.selectPattern('authored'));
    const designIndex = result.current.designGallery[0].index;
    act(() => result.current.selectDesign(designIndex));
    act(() => result.current.setGene('cornerScale', 1.25));
    act(() => result.current.setLevel(4));
    act(() => result.current.setDetail(140));
    expect(result.current.level).toBe(4);
    expect(result.current.detailPercent).toBe(100);
    expect(result.current.activePreset?.id).toBe('baroque');
    act(() => result.current.setDetail(-20));
    expect(result.current.detailPercent).toBe(0);
    act(() => result.current.setDetail(37));
    expect(result.current.activePreset).toBeNull();
    expect(target?.setSequenceFrameStyle).toHaveBeenCalled();
  });

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

  it('toggles with F outside text entry, ignores inputs, and cleans up', () => {
    const { result, unmount } = setup(null);
    fireEvent.keyDown(window, { key: 'x' });
    expect(result.current.isOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'F' });
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.isOpen).toBe(false);

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(input, textarea);
    fireEvent.keyDown(input, { key: 'f' });
    fireEvent.keyDown(textarea, { key: 'f' });
    expect(result.current.isOpen).toBe(false);
    unmount();
    fireEvent.keyDown(window, { key: 'f' });
    input.remove();
    textarea.remove();
  });

  it('marks lattice active from an enabled lattice layer', () => {
    const { result } = setup(null);
    act(() => result.current.setLayerEnabled('lattice', true));
    expect(result.current.isLatticePattern).toBe(true);
  });
});
