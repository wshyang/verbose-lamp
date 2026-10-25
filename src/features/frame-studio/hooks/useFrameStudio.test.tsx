// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_FRAME_LAYERS,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { DESIGN_GALLERY } from '../data/frameDesigns';
import { useFrameStudio } from './useFrameStudio';

function makeTarget() {
  return {
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
  };
}


describe('useFrameStudio', () => {
  it('opens on the title cards surface with the signature genome', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.surface).toBe('title-cards');
    expect(result.current.genome).toEqual(SIGNATURE_GENOME);
    expect(result.current.designLabel).toBe('Original');
    expect(result.current.detailPercent).toBe(Math.round(DEFAULT_FRAME_STYLE.intricacy * 100));
    expect(result.current.borderEnabled).toBe(false);
    expect(result.current.proportionsOpen).toBe(false);
    expect(result.current.isDesignPattern).toBe(true);
  });

  it('commits a pattern choice to the live target', () => {
    const target = makeTarget();
    const { result } = renderHook(() => useFrameStudio(() => target));
    act(() => result.current.selectPattern('authored'));
    expect(target.setSequenceFrameStyle).toHaveBeenCalledWith(
      expect.objectContaining({ formula: expect.objectContaining({ source: 'authored' }) }),
    );
    expect(result.current.baseSource).toBe('authored');
    expect(result.current.isDesignPattern).toBe(true);
  });

  it('applies a gallery design and reports its label', () => {
    const target = makeTarget();
    const { result } = renderHook(() => useFrameStudio(() => target));
    act(() => result.current.selectDesign(1));
    expect(result.current.activeDesignIndex).toBe(DESIGN_GALLERY[1].index);
    expect(result.current.designLabel).toBe(DESIGN_GALLERY[1].label);

    act(() => result.current.setGene('rayDensity', 1.2));
    expect(result.current.genome.rayDensity).toBeCloseTo(1.2, 5);
    expect(result.current.designLabel).toBe('Custom');
  });

  it('wraps a design index that is out of range', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    act(() => result.current.selectDesign(DESIGN_GALLERY.length + 2));
    expect(result.current.activeDesignIndex).toBe(DESIGN_GALLERY[2].index);
    act(() => result.current.selectDesign(-1));
    expect(result.current.activeDesignIndex).toBe(DESIGN_GALLERY.at(-1)!.index);
  });

  it('clamps levels and layer detail', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    act(() => result.current.setLevel(3));
    expect(result.current.level).toBe(3);
    act(() => result.current.setDetail(140));
    expect(result.current.detailPercent).toBe(100);
    act(() => result.current.setDetail(-20));
    expect(result.current.detailPercent).toBe(0);

    const [firstLayer] = result.current.layers;
    act(() => result.current.setLayerEnabled(firstLayer.source, true));
    expect(result.current.layers.find((layer) => layer.source === firstLayer.source)?.enabled).toBe(true);
    act(() => result.current.setLayerLevel(firstLayer.source, 9));
    expect(result.current.layers.find((layer) => layer.source === firstLayer.source)?.level).toBe(4);
    act(() => result.current.setLayerLevel(firstLayer.source, 0));
    expect(result.current.layers.find((layer) => layer.source === firstLayer.source)?.level).toBe(1);
  });

  it('finds an active detail preset, or none for a hand-set value', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    expect(result.current.activePreset).not.toBeNull();
    act(() => result.current.setDetail(37));
    expect(result.current.activePreset).toBeNull();
  });

  it('commits the screen border style and enables it with the surface', () => {
    const target = makeTarget();
    const { result } = renderHook(() => useFrameStudio(() => target));

    act(() => result.current.setSurface('screen-border'));
    expect(result.current.surface).toBe('screen-border');
    expect(target.setScreenBorderEnabled).toHaveBeenCalledWith(true);

    act(() => result.current.setBorderWeight(150));
    expect(result.current.borderWeight).toBe(100);
    act(() => result.current.setGene('zigguratSteps', 4));
    expect(result.current.genome.zigguratSteps).toBe(4);

    act(() => result.current.setBorderEnabled(false));
    expect(target.setScreenBorderEnabled).toHaveBeenLastCalledWith(false);
  });

  it('keeps the border state when switching back to the title cards', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    act(() => result.current.setBorderEnabled(true));
    act(() => result.current.setSurface('screen-border'));
    act(() => result.current.setSurface('title-cards'));
    expect(result.current.surface).toBe('title-cards');
    expect(result.current.borderEnabled).toBe(true);
  });

  it('resets everything to the signature defaults', () => {
    const target = makeTarget();
    const { result } = renderHook(() => useFrameStudio(() => target));
    act(() => {
      result.current.selectPattern('authored');
      result.current.setBorderEnabled(true);
      result.current.setProportionsOpen(true);
      result.current.setSurface('screen-border');
    });
    act(() => result.current.resetAll());
    expect(result.current.surface).toBe('title-cards');
    expect(result.current.genome).toEqual(SIGNATURE_GENOME);
    expect(result.current.borderEnabled).toBe(false);
    expect(result.current.proportionsOpen).toBe(false);
    expect(result.current.borderWeight).toBe(Math.round(DEFAULT_SCREEN_BORDER_STYLE.weight * 100));
  });

  it('dismisses and reveals the panel, including with the F key', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    act(() => result.current.dismiss());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.isOpen).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F' }));
    });
    expect(result.current.isOpen).toBe(false);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    });
    expect(result.current.isOpen).toBe(false);
    input.remove();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('toggles proportions', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    act(() => result.current.setProportionsOpen(true));
    expect(result.current.proportionsOpen).toBe(true);
    act(() => result.current.setProportionsOpen(false));
    expect(result.current.proportionsOpen).toBe(false);
  });
});

describe('useFrameStudio pattern sourced from another generator', () => {
  it('drops the gallery design and disables the matching layer', () => {
    const layerSource = DEFAULT_FRAME_LAYERS[0].source;
    const target = makeTarget();
    const { result } = renderHook(() => useFrameStudio(() => target));
    expect(result.current.layers.find((layer) => layer.source === layerSource)?.enabled).toBe(
      DEFAULT_FRAME_LAYERS[0].enabled,
    );

    act(() => result.current.selectPattern(layerSource));
    expect(result.current.baseSource).toBe(layerSource);
    expect(result.current.isDesignPattern).toBe(false);
    expect(result.current.layers.every((layer) => layer.source !== layerSource)).toBe(true);
    expect(
      target.setSequenceFrameStyle.mock.calls.at(-1)?.[0].formula.layers.find(
        (layer: { source: string }) => layer.source === layerSource,
      )?.enabled,
    ).toBe(false);
  });

  it('falls back to the authored level when returning to the design', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));
    act(() => result.current.selectPattern(DEFAULT_FRAME_LAYERS[0].source));
    act(() => result.current.setLevel(4));
    act(() => result.current.selectPattern('authored'));
    expect(result.current.level).toBe(DEFAULT_FRAME_STYLE.formula.level);
    expect(result.current.baseSource).toBe('authored');
  });
});
