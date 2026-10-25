// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBackdropActions } from './useBackdropActions';
import { useEffectRunner, type EffectRunner } from './useEffectRunner';
import { useSpeakerDrag } from './useSpeakerDrag';
import { useSpectaclePreview } from './useSpectaclePreview';
import { useStageSettings, type StageSettings } from './useStageSettings';

interface DeferredHandle {
  finished: Promise<void>;
  stop: ReturnType<typeof vi.fn>;
  resolve: () => void;
}

function deferredHandle(): DeferredHandle {
  let resolve!: () => void;
  const finished = new Promise<void>((done) => { resolve = done; });
  return { finished, stop: vi.fn(), resolve };
}

const spectacle = vi.hoisted(() => ({ handles: [] as DeferredHandle[], api: undefined as never }));
spectacle.api = {
  play: vi.fn(() => {
    const handle = deferredHandle();
    spectacle.handles.push(handle);
    return handle;
  }),
  stopAll: vi.fn(),
  qualityTier: 'high',
  simulatedReducedMotion: true,
  setSimulatedReducedMotion: vi.fn(),
} as never;

vi.mock('@/features/spectacle', () => ({ useSpectacle: () => spectacle.api }));

function fakeRunner(playing = new Set<string>()): EffectRunner {
  return {
    playing, run: vi.fn(), toggle: vi.fn(), stopKey: vi.fn(), stopAll: vi.fn(),
  } as EffectRunner;
}

beforeEach(() => {
  spectacle.handles = [];
  vi.clearAllMocks();
  (spectacle.api as unknown as { play: ReturnType<typeof vi.fn> }).play.mockImplementation(() => {
    const handle = deferredHandle();
    spectacle.handles.push(handle);
    return handle;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useEffectRunner', () => {
  it('tracks, replaces, toggles, and cleans up handles by key', async () => {
    const { result } = renderHook(() => useEffectRunner());
    act(() => result.current.run('a', 'flash', {}));
    act(() => result.current.run('a', 'flash', {}));
    expect(spectacle.handles[0].stop).toHaveBeenCalledOnce();
    await act(async () => spectacle.handles[0].resolve());
    expect(result.current.playing.has('a')).toBe(true);
    act(() => result.current.toggle('a', 'flash', {}));
    expect(spectacle.handles[1].stop).toHaveBeenCalledOnce();
    await act(async () => spectacle.handles[1].resolve());
    expect(result.current.playing.has('a')).toBe(false);
    act(() => result.current.toggle('a', 'flash', {}));
    act(() => result.current.stopKey('missing'));
    act(() => result.current.stopAll());
    expect((spectacle.api as unknown as { stopAll: ReturnType<typeof vi.fn> }).stopAll).toHaveBeenCalledOnce();
  });
});

describe('stage settings and speaker drag', () => {
  it('picks origins, clamps the speaker, rerolls, and exposes keep-clear', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const { result } = renderHook(() => useStageSettings());
    expect(result.current.onStageClick(10, 10)).toBe(false);
    act(() => result.current.setPicking(true));
    let accepted = false;
    act(() => { accepted = result.current.onStageClick(window.innerWidth / 4, window.innerHeight / 2); });
    expect(accepted).toBe(true);
    expect(result.current).toMatchObject({ origin: { x: 0.25, y: 0.5 }, picking: false });
    act(() => result.current.setIntensity(0.9));
    act(() => result.current.setSeed(42));
    act(() => result.current.rerollSeed());
    expect(result.current.seed).toBe(250000);
    act(() => result.current.moveSpeaker(-10, -10));
    expect(result.current.speaker).toMatchObject({ x: 0, y: 0 });
    act(() => result.current.moveSpeaker(10, 10));
    expect(result.current.speaker).toMatchObject({ x: 0.84, y: 0.76 });
    expect(result.current.keepClear).toEqual([]);
    act(() => result.current.setKeepClearOn(true));
    expect(result.current.keepClear).toEqual([result.current.speaker]);
  });

  it('reports pointer movement only while dragging', () => {
    const move = vi.fn();
    const { result } = renderHook(() => useSpeakerDrag(move));
    const capture = vi.fn();
    const event = (movementX: number, movementY: number) => ({
      pointerId: 7, movementX, movementY, currentTarget: { setPointerCapture: capture },
    }) as unknown as PointerEvent<HTMLElement>;
    act(() => result.current.onPointerMove(event(10, 10)));
    expect(move).not.toHaveBeenCalled();
    act(() => result.current.onPointerDown(event(0, 0)));
    act(() => result.current.onPointerMove(event(window.innerWidth / 2, window.innerHeight / 4)));
    expect(capture).toHaveBeenCalledWith(7);
    expect(move).toHaveBeenCalledWith(0.5, 0.25);
    act(() => result.current.onPointerUp());
    act(() => result.current.onPointerMove(event(1, 1)));
    expect(move).toHaveBeenCalledOnce();
  });
});

describe('preview action hooks', () => {
  it('plays backdrop effects and debounces keep-clear restarts', () => {
    vi.useFakeTimers();
    const firstClear = [{ x: 0, y: 0, w: 0.1, h: 0.1 }];
    const secondClear = [{ x: 0.2, y: 0, w: 0.1, h: 0.1 }];
    const thirdClear = [{ x: 0.4, y: 0, w: 0.1, h: 0.1 }];
    const runner = fakeRunner();
    const settings = { intensity: 0.7, seed: 9, keepClear: firstClear } as StageSettings;
    const props = { runner, settings };
    const { result, rerender } = renderHook((p: typeof props) => useBackdropActions(p), { initialProps: props });
    act(() => result.current.toggleFireworks());
    act(() => result.current.playFinale());
    act(() => result.current.toggleSearchlights());
    act(() => result.current.toggleChampagne());
    expect(runner.toggle).toHaveBeenCalledWith('fireworks', 'fireworks', expect.objectContaining({ intensity: 0.7 }));
    expect(runner.run).toHaveBeenCalledWith('finale', 'fireworks', expect.objectContaining({ finale: true }));

    const liveRunner = fakeRunner(new Set(['fireworks']));
    rerender({ runner: liveRunner, settings });
    rerender({ runner: liveRunner, settings: { ...settings, keepClear: secondClear } });
    rerender({ runner: liveRunner, settings: { ...settings, keepClear: thirdClear } });
    act(() => vi.advanceTimersByTime(349));
    expect(liveRunner.stopKey).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(liveRunner.stopKey).toHaveBeenCalledWith('fireworks');
    expect(liveRunner.run).toHaveBeenCalledWith('fireworks', 'fireworks', expect.objectContaining({ keepClear: thirdClear }));
  });

});

describe('useSpectaclePreview', () => {
  it('composes every console section and chains countdown completion to the finale', () => {
    const { result } = renderHook(() => useSpectaclePreview());
    expect(result.current).toMatchObject({
      open: false, marqueeOn: true, qualityTier: 'high', simulatedReducedMotion: true,
    });
    act(() => result.current.setOpen(true));
    act(() => result.current.setMarqueeOn(false));
    act(() => result.current.playCountdown());
    const play = (spectacle.api as unknown as { play: ReturnType<typeof vi.fn> }).play;
    const countdownParams = play.mock.calls.at(-1)?.[1];
    act(() => countdownParams.onComplete());
    expect(play).toHaveBeenLastCalledWith('fireworks', expect.objectContaining({ finale: true }));
    act(() => result.current.stopAll());
  });
});
