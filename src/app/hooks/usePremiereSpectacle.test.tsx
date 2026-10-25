// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { usePremiereSpectacle } from './usePremiereSpectacle';

setupDomTests();

const stage = vi.hoisted(() => ({ play: vi.fn(), stopAll: vi.fn() }));
const preview = vi.hoisted(() => ({ open: false, setOpen: vi.fn(), marqueeOn: true }));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({ play: stage.play, stopAll: stage.stopAll }),
}));

vi.mock('@/features/spectacle-preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle-preview')>()),
  useSpectaclePreview: () => preview,
}));

const winner = { id: 'jordan', name: 'Jordan Baker', subtitle: 'Golfer' };
const unnamed = { id: 'owl-eyes', name: 'Owl Eyes' };

describe('usePremiereSpectacle', () => {
  it('closes the draw to begin with, and opens and closes it', () => {
    const { result } = renderHook(() => usePremiereSpectacle());

    expect(result.current.isDrawOpen).toBe(false);
    act(() => result.current.openDraw());
    expect(result.current.isDrawOpen).toBe(true);
    act(() => result.current.closeDraw());
    expect(result.current.isDrawOpen).toBe(false);
  });

  it('hands the preview console through untouched', () => {
    const { result } = renderHook(() => usePremiereSpectacle());

    expect(result.current.preview).toBe(preview);
  });

  it('celebrates a landing with confetti, a sparkler fan and the name', () => {
    const { result } = renderHook(() => usePremiereSpectacle());

    act(() => result.current.handleLanded(winner));

    expect(stage.play).toHaveBeenCalledWith('confetti', {
      mode: 'burst', origin: { x: 0.5, y: 0.4 }, seed: 1925,
    });
    expect(stage.play).toHaveBeenCalledWith('sparkler', {
      origin: { x: 0.5, y: 0.4 }, count: 5, seed: 1925, intensity: 0.9,
    });
    expect(stage.play).toHaveBeenCalledWith('name-reveal', {
      name: 'Jordan Baker', subtitle: 'Golfer',
    });
  });

  it('falls back to a house subtitle when the entry has none', () => {
    const { result } = renderHook(() => usePremiereSpectacle());

    act(() => result.current.handleLanded(unnamed));

    expect(stage.play).toHaveBeenCalledWith('name-reveal', {
      name: 'Owl Eyes', subtitle: 'Lucky draw winner',
    });
  });
});
