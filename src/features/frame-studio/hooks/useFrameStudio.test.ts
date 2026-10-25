// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCREEN_BORDER_STYLE, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { setupDomTests } from '@/test/dom';
import { DESIGN_GALLERY, designAt } from '../data/frameDesigns';
import { useFrameStudio, type FrameStudioTarget } from './useFrameStudio';

setupDomTests();

function target(): FrameStudioTarget & { [K in keyof FrameStudioTarget]: ReturnType<typeof vi.fn> } {
  return {
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
  } as unknown as FrameStudioTarget & { [K in keyof FrameStudioTarget]: ReturnType<typeof vi.fn> };
}

function studio(scene: FrameStudioTarget | null = target()) {
  const ref = { current: scene };
  const { result } = renderHook(() => useFrameStudio(() => ref.current));
  return { result, ref };
}

describe('useFrameStudio', () => {
  it('starts open on the title cards with the delivered style', () => {
    const { result } = studio();
    expect(result.current.isOpen).toBe(true);
    expect(result.current.surface).toBe('title-cards');
    expect(result.current.baseSource).toBe('authored');
    expect(result.current.detailPercent).toBe(50);
    expect(result.current.borderPattern).toBe('poster');
    expect(result.current.borderEnabled).toBe(false);
    expect(result.current.isDesignPattern).toBe(true);
  });

  it('commits pattern, level and detail changes to the scene', () => {
    const scene = target();
    const { result } = studio(scene);

    act(() => result.current.selectPattern('lattice'));
    expect(scene.setSequenceFrameStyle).toHaveBeenCalledTimes(1);
    expect(result.current.baseSource).toBe('lattice');

    act(() => result.current.setLevel(3));
    expect(result.current.level).toBe(3);

    act(() => result.current.setDetail(75));
    expect(result.current.detailPercent).toBe(75);
    expect(result.current.activePreset?.id).toBe('ornate');
  });

  it('adopts a gallery design wholesale, genome and all', () => {
    const scene = target();
    const { result } = studio(scene);

    act(() => result.current.selectDesign(2));
    const style = scene.setSequenceFrameStyle.mock.calls.at(-1)?.[0] as { formula: { genome: unknown } };

    expect(result.current.activeDesignIndex).toBe(2);
    expect(result.current.designLabel).toBe(designAt(2).label);
    expect(style.formula.genome).toEqual(designAt(2).genome);

    // The gallery wraps, so an out-of-range index still lands on a real design.
    act(() => result.current.selectDesign(DESIGN_GALLERY.length));
    expect(result.current.activeDesignIndex).toBe(0);
    expect(result.current.designLabel).toBe(DESIGN_GALLERY[0].label);
  });

  it('rerolls the lattice seed into the six-digit range', () => {
    const scene = target();
    const { result } = studio(scene);
    act(() => result.current.selectPattern('lattice'));
    const before = result.current.level;

    act(() => result.current.rerollPattern());

    const style = scene.setSequenceFrameStyle.mock.calls.at(-1)?.[0] as { formula: { seed?: number } };
    expect(style.formula.seed).toBeGreaterThanOrEqual(0);
    expect(style.formula.seed).toBeLessThan(1_000_000);
    expect(result.current.level).toBe(before);
  });

  it('switches the proscenium pattern and rerolls its seed', () => {
    const scene = target();
    const { result } = studio(scene);

    act(() => result.current.setBorderPattern('lattice'));
    expect(result.current.borderPattern).toBe('lattice');
    expect(scene.setScreenBorderStyle).toHaveBeenCalledTimes(1);

    act(() => result.current.rerollBorder());
    const style = scene.setScreenBorderStyle.mock.calls.at(-1)?.[0] as { seed?: number; pattern?: string };
    expect(style.pattern).toBe('lattice');
    expect(style.seed).toBeGreaterThanOrEqual(0);
    expect(style.seed).toBeLessThan(1_000_000);
  });

  it('ignores a pattern the border already has', () => {
    const scene = target();
    const { result } = studio(scene);

    act(() => result.current.setBorderPattern('poster'));

    expect(scene.setScreenBorderStyle).not.toHaveBeenCalled();
  });

  it('enables the border when the screen-border surface is chosen', () => {
    const scene = target();
    const { result } = studio(scene);

    act(() => result.current.setSurface('screen-border'));

    expect(result.current.surface).toBe('screen-border');
    expect(result.current.borderEnabled).toBe(true);
    expect(scene.setScreenBorderEnabled).toHaveBeenCalledWith(true);
  });

  it('weights the border and edits its genome on the border surface', () => {
    const scene = target();
    const { result } = studio(scene);
    act(() => result.current.setSurface('screen-border'));

    act(() => result.current.setBorderWeight(80));
    expect(result.current.borderWeight).toBe(80);

    act(() => result.current.setGene('rayDensity', 1.4));
    const style = scene.setScreenBorderStyle.mock.calls.at(-1)?.[0] as { genome: { rayDensity: number } };
    expect(style.genome.rayDensity).toBe(1.4);
    expect(result.current.genome.rayDensity).toBe(1.4);
  });

  it('toggles a composable layer and clamps its level', () => {
    const scene = target();
    const { result } = studio(scene);
    const layer = result.current.layers.find((entry) => entry.source === 'fractal');
    expect(layer).toBeTruthy();

    act(() => result.current.setLayerEnabled('fractal', true));
    act(() => result.current.setLayerLevel('fractal', 9));

    const updated = result.current.layers.find((entry) => entry.source === 'fractal');
    expect(updated?.enabled).toBe(true);
    expect(updated?.level).toBe(4);
    expect(scene.setSequenceFrameStyle).toHaveBeenCalledTimes(2);
  });

  it('selects gallery designs and drops off the gallery for a custom genome', () => {
    const { result } = studio();
    expect(result.current.activeDesignIndex).toBe(0);

    act(() => result.current.setGene('rayDensity', 1.35));

    expect(result.current.activeDesignIndex).toBeNull();
    expect(result.current.designLabel).toContain('Custom');
  });

  it('resets everything back to the delivered frame', () => {
    const scene = target();
    const { result } = studio(scene);
    act(() => result.current.selectPattern('lattice'));
    act(() => result.current.setSurface('screen-border'));
    act(() => result.current.setBorderPattern('lattice'));
    act(() => result.current.setDetail(90));

    act(() => result.current.resetAll());

    expect(result.current.surface).toBe('title-cards');
    expect(result.current.baseSource).toBe('authored');
    expect(result.current.detailPercent).toBe(50);
    expect(result.current.borderPattern).toBe(DEFAULT_SCREEN_BORDER_STYLE.pattern);
    expect(result.current.borderEnabled).toBe(false);
    expect(result.current.genome).toEqual(SIGNATURE_GENOME);
    expect(scene.setScreenBorderEnabled).toHaveBeenLastCalledWith(false);
  });

  it('dismisses, reveals and toggles with F', () => {
    const { result } = studio();

    act(() => result.current.dismiss());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.isOpen).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('leaves the F key alone while typing', () => {
    const { result } = studio();
    const input = document.createElement('input');
    document.body.append(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    });

    expect(result.current.isOpen).toBe(true);
    input.remove();
  });

  it('keeps working before the scene exists', () => {
    const { result } = studio(null);

    expect(() => {
      act(() => result.current.selectPattern('fractal'));
      act(() => result.current.setBorderPattern('lattice'));
      act(() => result.current.setBorderEnabled(true));
    }).not.toThrow();

    expect(result.current.baseSource).toBe('fractal');
    expect(result.current.borderEnabled).toBe(true);
  });
});
