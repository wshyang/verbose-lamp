// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import type { EffectHandle } from '@/features/spectacle';
import { useEffectRunner } from './useEffectRunner';

setupDomTests();

/** A handle whose lifetime the test controls. */
function createHandle() {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const stop = vi.fn(() => finish());
  return { handle: { finished, stop } as EffectHandle, finish, stop };
}

const stage = vi.hoisted(() => ({
  play: vi.fn(),
  stopAll: vi.fn(),
}));

vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({ play: stage.play, stopAll: stage.stopAll }),
}));

const confetti = { mode: 'burst', origin: { x: 0.5, y: 0.4 }, seed: 7 } as const;

describe('useEffectRunner', () => {
  it('plays an effect and marks its key live', async () => {
    const { handle } = createHandle();
    stage.play.mockReturnValue(handle);
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.run('burst', 'confetti', confetti));

    expect(stage.play).toHaveBeenCalledWith('confetti', confetti);
    expect(result.current.playing.has('burst')).toBe(true);
    expect(result.current.playing.has('burst')).toBe(true);
  });

  it('drops the key when the effect finishes on its own', async () => {
    const { handle, finish } = createHandle();
    stage.play.mockReturnValue(handle);
    const { result } = renderHook(() => useEffectRunner());
    act(() => result.current.run('burst', 'confetti', confetti));

    await act(async () => { finish(); await handle.finished; });

    expect(result.current.playing.has('burst')).toBe(false);
    expect(result.current.playing.has('burst')).toBe(false);
  });

  it('stops the previous effect when a key is replayed', () => {
    const first = createHandle();
    const second = createHandle();
    stage.play.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.run('burst', 'confetti', confetti));
    act(() => result.current.run('burst', 'confetti', confetti));

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(result.current.playing.size).toBe(1);
  });

  it('ignores the late finish of a superseded handle', async () => {
    const first = createHandle();
    const second = createHandle();
    stage.play.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const { result } = renderHook(() => useEffectRunner());
    act(() => result.current.run('burst', 'confetti', confetti));
    act(() => result.current.run('burst', 'confetti', confetti));

    await act(async () => { first.finish(); await first.handle.finished; });

    expect(result.current.playing.has('burst')).toBe(true);
  });

  it('stops one key or every key', () => {
    const run = createHandle();
    stage.play.mockReturnValue(run.handle);
    const { result } = renderHook(() => useEffectRunner());
    act(() => result.current.run('a', 'confetti', confetti));

    act(() => result.current.stopKey('a'));
    expect(run.stop).toHaveBeenCalledTimes(1);

    act(() => result.current.stopAll());
    expect(stage.stopAll).toHaveBeenCalledTimes(1);
  });

  it('does nothing when stopping a key that was never played', () => {
    const { result } = renderHook(() => useEffectRunner());

    act(() => result.current.stopKey('absent'));

    expect(result.current.playing.size).toBe(0);
    expect(result.current.playing.has('absent')).toBe(false);
  });
});
