// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFrameStudio } from '@/features/frame-studio';
import type { PremiereSceneApi } from '@/features/premiere';

/**
 * The host composes the Frame Studio against the premiere's scene getter (PremiereSurfaces):
 * the premiere no longer owns the studio (modularity review, Issue 3). These pin the wiring that
 * used to be tested through `usePremiereController().frameStudio`.
 */
type FakeScene = { [K in keyof PremiereSceneApi]: ReturnType<typeof vi.fn> };

function createScene(): FakeScene {
  return {
    updateHeroTitle: vi.fn(),
    jumpToChapter: vi.fn(),
    setTime: vi.fn(),
    setPlaying: vi.fn(),
    togglePlaying: vi.fn(() => true),
    setCameraMode: vi.fn(),
    setNitrateMode: vi.fn(),
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('the Frame Studio bound to the premiere scene getter', () => {
  it('shows the screen border on the scene when that surface is chosen', () => {
    const scene = createScene();
    const { result } = renderHook(() => useFrameStudio(() => scene as unknown as PremiereSceneApi));

    act(() => result.current.setSurface('screen-border'));

    expect(scene.setScreenBorderEnabled).toHaveBeenCalledWith(true);
  });

  it('pushes a changed detail level to the scene as a sequence frame style', () => {
    const scene = createScene();
    const { result } = renderHook(() => useFrameStudio(() => scene as unknown as PremiereSceneApi));

    act(() => result.current.setDetail(40));

    expect(scene.setSequenceFrameStyle).toHaveBeenCalledWith(expect.objectContaining({ intricacy: 0.4 }));
  });

  it('reads the scene each time it acts, so a scene created after the studio is still driven', () => {
    const scene = createScene();
    const current: { value: PremiereSceneApi | null } = { value: null };
    const { result } = renderHook(() => useFrameStudio(() => current.value));

    act(() => result.current.setDetail(10));
    expect(scene.setSequenceFrameStyle).not.toHaveBeenCalled();

    current.value = scene as unknown as PremiereSceneApi;
    act(() => result.current.setDetail(20));
    expect(scene.setSequenceFrameStyle).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed without a scene', () => {
    const { result } = renderHook(() => useFrameStudio(() => null));

    expect(() => act(() => result.current.dismiss())).not.toThrow();
    expect(result.current.isOpen).toBe(false);
  });
});
