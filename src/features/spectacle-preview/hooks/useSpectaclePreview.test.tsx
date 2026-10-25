// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSpectaclePreview } from './useSpectaclePreview';

const spectacle = vi.hoisted(() => ({
  play: vi.fn((_id: string, _params: unknown) => ({
    finished: Promise.resolve(),
    stop: vi.fn(),
  })),
  stopAll: vi.fn(),
  setSimulatedReducedMotion: vi.fn(),
}));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({
    play: spectacle.play,
    stopAll: spectacle.stopAll,
    qualityTier: 'high',
    isReady: true,
    reducedMotion: false,
    simulatedReducedMotion: false,
    setSimulatedReducedMotion: spectacle.setSimulatedReducedMotion,
  }),
}));

function lastPlay() {
  return spectacle.play.mock.calls.at(-1);
}

describe('useSpectaclePreview', () => {
  it('starts closed with the marquee on and sane stage defaults', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    expect(result.current.open).toBe(false);
    expect(result.current.marqueeOn).toBe(true);
    expect(result.current.qualityTier).toBe('high');
    expect(result.current.origin).toEqual({ x: 0.5, y: 0.42 });
    expect(result.current.seed).toBe(1925);
    expect(result.current.intensity).toBe(0.6);
  });

  it('toggles the panel, the marquee and the reduced-motion simulation', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.setMarqueeOn(false));
    expect(result.current.marqueeOn).toBe(false);
    act(() => result.current.setSimulatedReducedMotion(true));
    expect(spectacle.setSimulatedReducedMotion).toHaveBeenCalledWith(true);
  });

  it('picks a new origin from a stage click only while picking', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    expect(result.current.onStageClick(10, 10)).toBe(false);

    act(() => result.current.setPicking(true));
    let consumed = false;
    act(() => {
      consumed = result.current.onStageClick(window.innerWidth / 2, window.innerHeight / 4);
    });
    expect(consumed).toBe(true);
    expect(result.current.origin).toEqual({ x: 0.5, y: 0.25 });
    expect(result.current.picking).toBe(false);
  });

  it('moves the keep-clear speaker inside the viewport', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    expect(result.current.keepClear).toEqual([]);
    act(() => result.current.setKeepClearOn(true));
    expect(result.current.keepClear).toHaveLength(1);

    act(() => result.current.moveSpeaker(-5, -5));
    expect(result.current.speaker.x).toBe(0);
    expect(result.current.speaker.y).toBe(0);

    act(() => result.current.moveSpeaker(5, 5));
    expect(result.current.speaker.x).toBeCloseTo(0.84);
    expect(result.current.speaker.y).toBeCloseTo(0.76);
  });

  it('rerolls the seed', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    const before = result.current.seed;
    act(() => result.current.rerollSeed());
    expect(result.current.seed).not.toBe(before);
  });

  it('starts the ambient show with the shared settings and stops it again', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.toggleFireworks());
    expect(lastPlay()?.[0]).toBe('fireworks');
    expect(lastPlay()?.[1]).toMatchObject({ continuous: true, intensity: 0.6, seed: 1925, greenLight: true });
    expect(result.current.playing.has('fireworks')).toBe(true);

    const handle = spectacle.play.mock.results.at(-1)?.value;
    act(() => result.current.toggleFireworks());
    expect(handle?.stop).toHaveBeenCalledTimes(1);
  });

  it('drops a key from the live set once its effect finishes', async () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.playFinale());
    await waitFor(() => expect(result.current.playing.has('finale')).toBe(false));
  });

  it('plays the finale, searchlights and champagne', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.playFinale());
    expect(lastPlay()?.[1]).toMatchObject({ finale: true, intensity: 1 });
    act(() => result.current.toggleSearchlights());
    expect(lastPlay()?.[1]).toMatchObject({ beams: 3 });
    act(() => result.current.toggleChampagne());
    expect(lastPlay()?.[1]).toMatchObject({ seed: 1925 });
  });

  it('restarts a live show after keep-clear changes', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSpectaclePreview());
      act(() => result.current.toggleFireworks());
      act(() => result.current.setKeepClearOn(true));
      const callsBefore = spectacle.play.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(spectacle.play.mock.calls.length).toBe(callsBefore + 1);
      expect(lastPlay()?.[1]).toMatchObject({ keepClear: [expect.any(Object)] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays each transition and swaps the demo screen under cover', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    expect(result.current.demoScreen).toBe('A');

    act(() => result.current.playOrb('orb-sides-outward', 'sides', 'outward'));
    const orbParams = lastPlay()?.[1] as { pattern: string; onCovered: () => void };
    expect(orbParams.pattern).toBe('sides');
    act(() => orbParams.onCovered());
    expect(result.current.demoScreen).toBe('B');

    act(() => result.current.playSunburst('sunburst-fan', 'fan'));
    const fanParams = lastPlay()?.[1] as { origin: { y: number }; onCovered: () => void };
    expect(fanParams.origin.y).toBe(1);
    act(() => fanParams.onCovered());
    expect(result.current.demoScreen).toBe('A');

    act(() => result.current.playSunburst('sunburst-iris', 'iris'));
    const irisParams = lastPlay()?.[1] as { origin: { x: number } };
    expect(irisParams.origin.x).toBe(0.5);
  });

  it('chains the countdown into the finale', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.playCountdown());
    expect(lastPlay()?.[0]).toBe('countdown');
    const params = lastPlay()?.[1] as { from: number; onComplete: () => void };
    expect(params.from).toBe(5);
    act(() => params.onComplete());
    expect(lastPlay()?.[1]).toMatchObject({ finale: true });
  });

  it('plays confetti in both modes and the gilded name reveal', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.playConfetti('burst'));
    expect(lastPlay()?.[1]).toMatchObject({ mode: 'burst' });
    act(() => result.current.playConfetti('rain'));
    expect(lastPlay()?.[1]).toMatchObject({ mode: 'rain' });
    act(() => result.current.playNameReveal());
    expect(lastPlay()?.[1]).toMatchObject({ name: 'Jay Gatsby' });
  });

  it('stops everything on demand', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    act(() => result.current.stopAll());
    expect(spectacle.stopAll).toHaveBeenCalled();
  });
});
