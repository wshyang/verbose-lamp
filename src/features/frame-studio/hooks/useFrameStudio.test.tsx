// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRAME_LAYER_SOURCES } from '@/features/art-deco-frame';
import { DESIGN_GALLERY } from '../data/frameDesigns';
import { useFrameStudio } from './useFrameStudio';

function makeTarget() {
  return {
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
  };
}

function press(key: string, tagName?: string) {
  const target = tagName ? Object.assign(document.createElement(tagName), {}) : window;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  if (tagName) {
    document.body.appendChild(target as unknown as HTMLElement);
  }
  act(() => {
    (target as unknown as EventTarget).dispatchEvent(event);
  });
}

describe('useFrameStudio', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function setup(target: ReturnType<typeof makeTarget> | null = makeTarget()) {
    return { target, hook: renderHook(() => useFrameStudio(() => target)) };
  }

  it('opens on the title cards with the signature design', () => {
    const { hook } = setup();
    expect(hook.result.current.isOpen).toBe(true);
    expect(hook.result.current.surface).toBe('title-cards');
    expect(hook.result.current.designLabel).toBe('Original');
    expect(hook.result.current.activeDesignIndex).toBe(0);
    expect(hook.result.current.detailPercent).toBeGreaterThan(0);
    expect(hook.result.current.borderEnabled).toBe(false);
    expect(hook.result.current.proportionsOpen).toBe(false);
  });

  it('commits a chosen design to the scene', () => {
    const { hook, target } = setup();
    act(() => hook.result.current.selectDesign(2));
    expect(target?.setSequenceFrameStyle).toHaveBeenCalledOnce();
    const style = target?.setSequenceFrameStyle.mock.calls[0][0];
    expect(style.formula.genome).toBeTruthy();
    expect(hook.result.current.activeDesignIndex).toBe(2);
    expect(hook.result.current.designLabel).toBe(DESIGN_GALLERY[2].label);
  });

  it('drops the design badge once a gene is hand-tuned', () => {
    const { hook } = setup();
    act(() => hook.result.current.setGene('rayDensity', 1.4));
    expect(hook.result.current.activeDesignIndex).toBeNull();
    expect(hook.result.current.designLabel).toBe('Custom');
    expect(hook.result.current.genome.rayDensity).toBe(1.4);
  });

  it('never offers the base pattern as one of its own overlay layers', () => {
    const { hook } = setup();
    const other = FRAME_LAYER_SOURCES.find((layer) => layer.id !== hook.result.current.baseSource)!;

    act(() => hook.result.current.selectPattern(other.id));
    expect(hook.result.current.baseSource).toBe(other.id);
    expect(hook.result.current.layers.some((layer) => layer.source === other.id)).toBe(false);
    expect(hook.result.current.layers).toHaveLength(FRAME_LAYER_SOURCES.length - 1);

    act(() => hook.result.current.selectPattern('authored'));
    expect(hook.result.current.isDesignPattern).toBe(true);
    expect(hook.result.current.layers.some((layer) => layer.source === other.id)).toBe(true);
    expect(hook.result.current.layers).toHaveLength(FRAME_LAYER_SOURCES.length);
  });

  it('sets the sequence intricacy level', () => {
    const { hook, target } = setup();
    act(() => hook.result.current.setLevel(3));
    expect(hook.result.current.level).toBe(3);
    expect(target?.setSequenceFrameStyle.mock.calls[0][0].formula.level).toBe(3);
  });

  it('clamps layer levels, detail and the border weight', () => {
    const { hook, target } = setup();
    const source = FRAME_LAYER_SOURCES.find((layer) => layer.id !== hook.result.current.baseSource)!;
    act(() => hook.result.current.setLayerLevel(source.id, 9));
    expect(hook.result.current.layers.find((layer) => layer.source === source.id)?.level).toBe(4);
    act(() => hook.result.current.setLayerLevel(source.id, -3));
    expect(hook.result.current.layers.find((layer) => layer.source === source.id)?.level).toBe(1);

    act(() => hook.result.current.setDetail(400));
    expect(hook.result.current.detailPercent).toBe(100);
    act(() => hook.result.current.setDetail(-40));
    expect(hook.result.current.detailPercent).toBe(0);

    act(() => hook.result.current.setBorderWeight(250));
    expect(hook.result.current.borderWeight).toBe(100);
    expect(target?.setScreenBorderStyle).toHaveBeenCalled();
  });

  it('edits the screen border through the border surface', () => {
    const { hook, target } = setup();
    act(() => hook.result.current.setSurface('screen-border'));
    expect(hook.result.current.surface).toBe('screen-border');
    expect(hook.result.current.borderEnabled).toBe(true);
    expect(target?.setScreenBorderEnabled).toHaveBeenCalledWith(true);

    act(() => hook.result.current.setGene('wingDelta', 1));
    const style = target?.setScreenBorderStyle.mock.calls.at(-1)?.[0];
    expect(style.genome.wingDelta).toBe(1);
    expect(hook.result.current.genome.wingDelta).toBe(1);
  });

  it('toggles the border off explicitly', () => {
    const { hook, target } = setup();
    act(() => hook.result.current.setBorderEnabled(true));
    act(() => hook.result.current.setBorderEnabled(false));
    expect(target?.setScreenBorderEnabled).toHaveBeenNthCalledWith(1, true);
    expect(target?.setScreenBorderEnabled).toHaveBeenNthCalledWith(2, false);
    expect(hook.result.current.borderEnabled).toBe(false);
  });

  it('resets everything back to the original', () => {
    const { hook } = setup();
    act(() => hook.result.current.selectDesign(3));
    act(() => hook.result.current.setSurface('screen-border'));
    act(() => hook.result.current.setProportionsOpen(true));
    act(() => hook.result.current.resetAll());
    expect(hook.result.current.surface).toBe('title-cards');
    expect(hook.result.current.designLabel).toBe('Original');
    expect(hook.result.current.borderEnabled).toBe(false);
    expect(hook.result.current.proportionsOpen).toBe(false);
  });

  it('dismisses and reveals the panel', () => {
    const { hook } = setup();
    act(() => hook.result.current.dismiss());
    expect(hook.result.current.isOpen).toBe(false);
    act(() => hook.result.current.reveal());
    expect(hook.result.current.isOpen).toBe(true);
  });

  it('binds the F key unless the user is typing', () => {
    const { hook } = setup();
    press('f');
    expect(hook.result.current.isOpen).toBe(false);
    press('f', 'INPUT');
    expect(hook.result.current.isOpen).toBe(false);
    press('F');
    expect(hook.result.current.isOpen).toBe(true);
  });

  it('leaves other keys alone and does not re-enable an already-on border', () => {
    const { hook, target } = setup();
    press('x');
    expect(hook.result.current.isOpen).toBe(true);
    act(() => hook.result.current.setBorderEnabled(true));
    target?.setScreenBorderEnabled.mockClear();
    act(() => hook.result.current.setSurface('screen-border'));
    // The border was already on, so the surface switch must not claim it again.
    expect(target?.setScreenBorderEnabled).not.toHaveBeenCalled();
    expect(hook.result.current.borderEnabled).toBe(true);
  });

  it('reports no preset when the detail sits between the named ones', () => {
    const { hook } = setup();
    act(() => hook.result.current.setDetail(37));
    expect(hook.result.current.detailPercent).toBe(37);
    expect(hook.result.current.activePreset).toBeNull();
  });

  it('works without a scene target', () => {
    const { hook } = setup(null);
    expect(() => {
      act(() => hook.result.current.selectDesign(1));
      act(() => hook.result.current.setBorderEnabled(true));
    }).not.toThrow();
    expect(hook.result.current.activeDesignIndex).toBe(1);
  });
});
