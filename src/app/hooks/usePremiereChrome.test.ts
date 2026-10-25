// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePremiereChrome } from './usePremiereChrome';

describe('usePremiereChrome', () => {
  it('opens with the HUD showing and both dialogs closed', () => {
    const { result } = renderHook(() => usePremiereChrome());

    expect(result.current.hudHidden).toBe(false);
    expect(result.current.showResearch).toBe(false);
    expect(result.current.showCustomizer).toBe(false);
  });

  it('toggles the HUD back and forth', () => {
    const { result } = renderHook(() => usePremiereChrome());

    act(() => result.current.toggleHud());
    expect(result.current.hudHidden).toBe(true);

    act(() => result.current.toggleHud());
    expect(result.current.hudHidden).toBe(false);
  });

  it('opens and closes the research dialog without touching the title dialog', () => {
    const { result } = renderHook(() => usePremiereChrome());

    act(() => result.current.openResearch());
    expect(result.current.showResearch).toBe(true);
    expect(result.current.showCustomizer).toBe(false);

    act(() => result.current.closeResearch());
    expect(result.current.showResearch).toBe(false);
  });

  it('opens and closes the title dialog without touching the research dialog', () => {
    const { result } = renderHook(() => usePremiereChrome());

    act(() => result.current.openCustomizer());
    expect(result.current.showCustomizer).toBe(true);
    expect(result.current.showResearch).toBe(false);

    act(() => result.current.closeCustomizer());
    expect(result.current.showCustomizer).toBe(false);
  });

  it('hands out stable handlers, so memoised children do not re-render', () => {
    const { result, rerender } = renderHook(() => usePremiereChrome());
    const first = result.current;

    rerender();

    expect(result.current.toggleHud).toBe(first.toggleHud);
    expect(result.current.openResearch).toBe(first.openResearch);
    expect(result.current.closeCustomizer).toBe(first.closeCustomizer);
  });
});
