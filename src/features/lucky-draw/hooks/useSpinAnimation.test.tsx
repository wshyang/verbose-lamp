// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { useSpinAnimation } from './useSpinAnimation';
import type { LuckyDrawEntry } from '../model/entries';

setupDomTests();

const entries: LuckyDrawEntry[] = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cy' },
];

const frames: FrameRequestCallback[] = [];
const cancelled: number[] = [];
let nextId = 1;
const T0 = 5_000;

beforeEach(() => {
  frames.length = 0;
  cancelled.length = 0;
  nextId = 1;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
    // A cancelled frame never runs again.
    frames.length = 0;
  });
  vi.spyOn(performance, 'now').mockReturnValue(T0);
});

/** Plays the queued frame at `elapsed` ms after the spin started. */
function tick(elapsed: number) {
  const frame = frames.pop();
  expect(frame).toBeDefined();
  frame!(T0 + elapsed);
}

const mount = () => {
  const onSpinStart = vi.fn();
  const onLanded = vi.fn();
  const view = renderHook(() => useSpinAnimation({ onSpinStart, onLanded }));
  return { ...view, onSpinStart, onLanded };
};

describe('useSpinAnimation', () => {
  it('refuses to spin a pool that cannot produce a winner', () => {
    const { result, onSpinStart } = mount();

    act(() => result.current.start({ entries: [entries[0]], isReducedMotion: false }));

    expect(onSpinStart).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it('announces the fair pick before the first frame', () => {
    const { result, onSpinStart, onLanded } = mount();

    act(() => result.current.start({ entries, isReducedMotion: false }));

    expect(onSpinStart).toHaveBeenCalledTimes(1);
    expect(entries).toContainEqual(onSpinStart.mock.calls[0][0]);
    expect(onLanded).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
  });

  it('drives the position and speed refs every frame', () => {
    const { result } = mount();

    act(() => result.current.start({ entries, isReducedMotion: false }));
    act(() => tick(120));

    // The drum spins either way, so only that motion happened matters here.
    expect(Number.isFinite(result.current.positionRef.current)).toBe(true);
    expect(result.current.positionRef.current).not.toBe(0);
    expect(Number.isFinite(result.current.speedRef.current)).toBe(true);
    expect(result.current.speedRef.current).not.toBe(0);
    expect(frames).toHaveLength(1);
  });

  it('lands on the picked entry and stops the loop', () => {
    const { result, onSpinStart, onLanded } = mount();

    act(() => result.current.start({ entries, isReducedMotion: false }));
    const picked = onSpinStart.mock.calls[0][0] as LuckyDrawEntry;

    act(() => tick(1_000_000));

    expect(onLanded).toHaveBeenCalledWith(picked);
    // No further frame is queued once landed.
    expect(frames).toHaveLength(0);
  });

  it('uses the shorter settle-free profile for reduced motion', () => {
    const full = mount();
    act(() => full.result.current.start({ entries, isReducedMotion: false }));
    act(() => tick(60));
    expect(full.result.current.speedRef.current).not.toBe(0);
    expect(frames).toHaveLength(1);

    // Three seconds in: a reduced-motion spin has landed, the full one is still
    // cruising (its shortest possible profile is 4.46 s).
    act(() => tick(3_000));
    expect(full.onLanded).not.toHaveBeenCalled();

    const reduced = mount();
    act(() => reduced.result.current.start({ entries, isReducedMotion: true }));
    act(() => tick(3_000));
    expect(reduced.onLanded).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous frame when a new spin starts', () => {
    const { result } = mount();

    act(() => result.current.start({ entries, isReducedMotion: false }));
    act(() => result.current.start({ entries, isReducedMotion: false }));

    expect(cancelled.length).toBeGreaterThan(0);
  });

  it('stops the drum dead', () => {
    const { result } = mount();

    act(() => result.current.start({ entries, isReducedMotion: false }));
    act(() => tick(90));
    expect(result.current.speedRef.current).not.toBe(0);

    act(() => result.current.stop());

    expect(result.current.speedRef.current).toBe(0);
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it('cancels any pending frame on unmount', () => {
    const { result, unmount } = mount();

    act(() => result.current.start({ entries, isReducedMotion: false }));
    unmount();

    expect(cancelled.length).toBeGreaterThan(0);
  });
});
