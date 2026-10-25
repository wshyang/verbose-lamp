// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectHandle } from '@/features/spectacle';
import { useBackdropActions } from './useBackdropActions';
import { useCelebrationActions } from './useCelebrationActions';
import { useEffectRunner, type EffectRunner } from './useEffectRunner';
import { useStageSettings } from './useStageSettings';
import { useTransitionActions } from './useTransitionActions';

const spectacle = vi.hoisted(() => ({
  play: vi.fn(),
  stopAll: vi.fn(),
}));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({ play: spectacle.play, stopAll: spectacle.stopAll }),
}));

function deferredHandle() {
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const handle: EffectHandle = { finished, stop: vi.fn() };
  return { handle, finish };
}

function fakeRunner() {
  return {
    playing: new Set<string>(),
    run: vi.fn(),
    toggle: vi.fn(),
    stopKey: vi.fn(),
    stopAll: vi.fn(),
  } as unknown as EffectRunner & {
    run: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    stopKey: ReturnType<typeof vi.fn>;
  };
}

const ORIGIN = { x: 0.5, y: 0.5 };

describe('useEffectRunner', () => {
  beforeEach(() => {
    spectacle.play.mockReset();
    spectacle.stopAll.mockReset();
  });

  it('plays an effect, marks the key live, and clears it when the effect ends', async () => {
    const { handle, finish } = deferredHandle();
    spectacle.play.mockReturnValue(handle);
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.run('fireworks', 'sparkler', { origin: ORIGIN, count: 2 }));
    expect(spectacle.play).toHaveBeenCalledWith('sparkler', { origin: ORIGIN, count: 2 });
    expect([...result.current.playing]).toEqual(['fireworks']);

    await act(async () => {
      finish();
      await handle.finished;
    });
    expect([...result.current.playing]).toEqual([]);
  });

  it('stops the previous handle when the same key restarts', () => {
    const first = deferredHandle();
    const second = deferredHandle();
    spectacle.play.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.run('fire', 'sparkler', { origin: ORIGIN }));
    act(() => result.current.run('fire', 'sparkler', { origin: ORIGIN }));
    expect(first.handle.stop).toHaveBeenCalledOnce();
    expect(second.handle.stop).not.toHaveBeenCalled();
  });

  it('ignores the completion of a replaced handle', async () => {
    const first = deferredHandle();
    const second = deferredHandle();
    spectacle.play.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.run('fire', 'sparkler', { origin: ORIGIN }));
    act(() => result.current.run('fire', 'sparkler', { origin: ORIGIN }));
    await act(async () => {
      first.finish();
      await first.handle.finished;
    });
    expect([...result.current.playing]).toEqual(['fire']);

    await act(async () => {
      second.finish();
      await second.handle.finished;
    });
    expect([...result.current.playing]).toEqual([]);
  });

  it('toggles a key on and off', () => {
    const { handle } = deferredHandle();
    spectacle.play.mockReturnValue(handle);
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.toggle('search', 'searchlights', { beams: 3 }));
    expect(spectacle.play).toHaveBeenCalledOnce();
    act(() => result.current.toggle('search', 'searchlights', { beams: 3 }));
    expect(handle.stop).toHaveBeenCalledOnce();
  });

  it('stops a key that was never live and exposes stopAll', () => {
    const { result } = renderHook(() => useEffectRunner());
    expect(() => act(() => result.current.stopKey('missing'))).not.toThrow();
    act(() => result.current.stopAll());
    expect(spectacle.stopAll).toHaveBeenCalledOnce();
  });
});

describe('useTransitionActions', () => {
  it('runs an orb transition with the shared origin and swaps the demo screen', () => {
    const runner = fakeRunner();
    const origin = { x: 0.25, y: 0.75 };
    const { result } = renderHook(() => useTransitionActions({ runner, origin }));

    expect(result.current.demoScreen).toBe('A');
    const params = { origin, pattern: 'sides', direction: 'outward', onCovered: expect.any(Function) };
    act(() => result.current.playOrb('orb', 'sides', 'outward'));
    expect(runner.run).toHaveBeenCalledWith('orb', 'orb-transition', params);

    const [, , passed] = runner.run.mock.calls[0] as [string, string, { onCovered: () => void }];
    act(() => passed.onCovered());
    expect(result.current.demoScreen).toBe('B');
    act(() => passed.onCovered());
    expect(result.current.demoScreen).toBe('A');
  });

  it('plants a fan sunburst at the bottom edge but keeps the origin for iris', () => {
    const runner = fakeRunner();
    const origin = { x: 0.25, y: 0.75 };
    const { result } = renderHook(() => useTransitionActions({ runner, origin }));

    act(() => result.current.playSunburst('fan', 'fan'));
    expect(runner.run).toHaveBeenLastCalledWith(
      'fan',
      'sunburst-wipe',
      expect.objectContaining({ origin: { x: 0.5, y: 1 }, variant: 'fan' })
    );

    act(() => result.current.playSunburst('iris', 'iris'));
    expect(runner.run).toHaveBeenLastCalledWith(
      'iris',
      'sunburst-wipe',
      expect.objectContaining({ origin, variant: 'iris' })
    );
  });
});

describe('useCelebrationActions', () => {
  it('runs confetti per mode, a five-beat countdown and the gilded name reveal', () => {
    const runner = fakeRunner();
    const onCountdownComplete = vi.fn();
    const origin = { x: 0.5, y: 0.42 };
    const { result } = renderHook(() =>
      useCelebrationActions({ runner, origin, seed: 1925, onCountdownComplete })
    );

    act(() => result.current.playConfetti('burst'));
    expect(runner.run).toHaveBeenCalledWith('confetti-burst', 'confetti', { mode: 'burst', origin, seed: 1925 });
    act(() => result.current.playConfetti('rain'));
    expect(runner.run).toHaveBeenLastCalledWith('confetti-rain', 'confetti', expect.objectContaining({ mode: 'rain' }));

    act(() => result.current.playCountdown());
    expect(runner.run).toHaveBeenLastCalledWith('countdown', 'countdown', { from: 5, onComplete: onCountdownComplete });

    act(() => result.current.playNameReveal());
    expect(runner.run).toHaveBeenLastCalledWith('name-reveal', 'name-reveal', {
      name: 'Jay Gatsby',
      subtitle: 'Lucky draw winner',
    });
  });
});

describe('useStageSettings', () => {
  const click = () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
  };

  it('starts centred with no keep-clear box', () => {
    const { result } = renderHook(() => useStageSettings());
    expect(result.current.origin).toEqual({ x: 0.5, y: 0.42 });
    expect(result.current.intensity).toBe(0.6);
    expect(result.current.seed).toBe(1925);
    expect(result.current.picking).toBe(false);
    expect(result.current.keepClear).toEqual([]);
    expect(result.current.keepClearOn).toBe(false);
  });

  it('only moves the origin while picking, then stops picking', () => {
    click();
    const { result } = renderHook(() => useStageSettings());
    expect(result.current.onStageClick(100, 100)).toBe(false);
    expect(result.current.origin).toEqual({ x: 0.5, y: 0.42 });

    act(() => result.current.setPicking(true));
    let handled = false;
    act(() => {
      handled = result.current.onStageClick(250, 125);
    });
    expect(handled).toBe(true);
    expect(result.current.origin).toEqual({ x: 0.25, y: 0.25 });
    expect(result.current.picking).toBe(false);
  });

  it('keeps the speaker box inside the stage', () => {
    const { result } = renderHook(() => useStageSettings());
    act(() => result.current.moveSpeaker(5, 5));
    expect(result.current.speaker).toEqual({ x: 0.84, y: 0.76, w: 0.16, h: 0.24 });
    act(() => result.current.moveSpeaker(-5, -5));
    expect(result.current.speaker).toEqual({ x: 0, y: 0, w: 0.16, h: 0.24 });
  });

  it('exposes the speaker box only while keep-clear is on', () => {
    const { result } = renderHook(() => useStageSettings());
    act(() => result.current.setKeepClearOn(true));
    expect(result.current.keepClear).toEqual([{ x: 0.42, y: 0.28, w: 0.16, h: 0.24 }]);
    act(() => result.current.setKeepClearOn(false));
    expect(result.current.keepClear).toEqual([]);
  });

  it('rerolls the seed inside the catalogue range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { result } = renderHook(() => useStageSettings());
    act(() => result.current.rerollSeed());
    expect(result.current.seed).toBe(500_000);
    vi.restoreAllMocks();
  });

  it('accepts manual intensity and seed overrides', () => {
    const { result } = renderHook(() => useStageSettings());
    act(() => result.current.setIntensity(1));
    act(() => result.current.setSeed(7));
    expect(result.current.intensity).toBe(1);
    expect(result.current.seed).toBe(7);
  });
});



describe('useBackdropActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(settingsOverrides: Partial<ReturnType<typeof useStageSettings>> = {}) {
    const runner = fakeRunner();
    const settings = {
      origin: { x: 0.5, y: 0.42 },
      picking: false,
      setPicking: vi.fn(),
      intensity: 0.6,
      setIntensity: vi.fn(),
      seed: 1925,
      setSeed: vi.fn(),
      rerollSeed: vi.fn(),
      keepClearOn: false,
      setKeepClearOn: vi.fn(),
      keepClear: [],
      speaker: { x: 0.42, y: 0.28, w: 0.16, h: 0.24 },
      moveSpeaker: vi.fn(),
      onStageClick: vi.fn(),
      ...settingsOverrides,
    } as ReturnType<typeof useStageSettings>;
    const hook = renderHook(() => useBackdropActions({ runner, settings }));
    return { runner, settings, hook };
  }

  it('toggles the ambient fireworks show with the live settings', () => {
    const { runner, hook } = setup();
    act(() => hook.result.current.toggleFireworks());
    expect(runner.toggle).toHaveBeenCalledWith('fireworks', 'fireworks', {
      continuous: true,
      intensity: 0.6,
      seed: 1925,
      keepClear: [],
      greenLight: true,
    });
  });

  it('plays the finale at full intensity', () => {
    const { runner, hook } = setup();
    act(() => hook.result.current.playFinale());
    expect(runner.run).toHaveBeenCalledWith('finale', 'fireworks', {
      finale: true,
      intensity: 1,
      seed: 1925,
      keepClear: [],
      greenLight: true,
    });
  });

  it('toggles searchlights and champagne', () => {
    const { runner, hook } = setup();
    act(() => hook.result.current.toggleSearchlights());
    expect(runner.toggle).toHaveBeenCalledWith('searchlights', 'searchlights', {
      beams: 3,
      seed: 1925,
      keepClear: [],
    });
    act(() => hook.result.current.toggleChampagne());
    expect(runner.toggle).toHaveBeenCalledWith('champagne', 'champagne', { seed: 1925 });
  });

  it('restarts a live show once after keep-clear changes, debounced', () => {
    const live = fakeRunner();
    live.playing = new Set(['fireworks']);
    const runner = live as ReturnType<typeof fakeRunner>;
    const settings = {
      intensity: 0.6,
      seed: 1925,
      keepClear: [],
    } as unknown as ReturnType<typeof useStageSettings>;

    const { rerender } = renderHook(
      (props: { keepClear: never[] | Array<{ x: number; y: number; w: number; h: number }> }) =>
        useBackdropActions({
          runner,
          settings: { ...settings, keepClear: props.keepClear } as ReturnType<typeof useStageSettings>,
        }),
      { initialProps: { keepClear: [] as never[] | Array<{ x: number; y: number; w: number; h: number }> } }
    );

    rerender({ keepClear: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] });
    expect(runner.stopKey).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(350));
    expect(runner.stopKey).toHaveBeenCalledWith('fireworks');
    expect(runner.run).toHaveBeenCalledWith(
      'fireworks',
      'fireworks',
      expect.objectContaining({ keepClear: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] })
    );
  });

  it('cancels the debounced restart when the show is stopped first', () => {
    const runner = fakeRunner();
    const settings = {
      intensity: 1,
      seed: 1,
      keepClear: [],
    } as unknown as ReturnType<typeof useStageSettings>;
    const { rerender, unmount } = renderHook(
      (props: { keepClear: Array<{ x: number; y: number; w: number; h: number }> }) =>
        useBackdropActions({ runner, settings: { ...settings, keepClear: props.keepClear } as ReturnType<typeof useStageSettings> }),
      { initialProps: { keepClear: [] as Array<{ x: number; y: number; w: number; h: number }> } }
    );
    rerender({ keepClear: [{ x: 0, y: 0, w: 1, h: 1 }] });
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(runner.stopKey).not.toHaveBeenCalled();
  });
});
