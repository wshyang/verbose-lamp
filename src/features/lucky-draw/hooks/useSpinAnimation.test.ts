// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpinAnimation } from './useSpinAnimation';

const ENTRIES = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bertie' },
] as const;

const mocks = vi.hoisted(() => ({
  profile: {
    durationMs: 100,
    endP: 5,
    cruiseMs: 10,
    positionAt: vi.fn((ms: number) => ms / 10),
    velocityAt: vi.fn((ms: number) => ms / 20),
  },
  pickWinner: vi.fn(),
  planSpin: vi.fn(),
}));

vi.mock('../model/pickWinner', () => ({ pickWinner: mocks.pickWinner }));
vi.mock('../model/spin', () => ({ planSpin: mocks.planSpin }));

let callbacks = new Map<number, FrameRequestCallback>();
let nextId = 1;

function frame(now: number) {
  const pending = [...callbacks.values()];
  callbacks.clear();
  pending.forEach((callback) => callback(now));
}

beforeEach(() => {
  callbacks = new Map();
  nextId = 1;
  vi.clearAllMocks();
  mocks.pickWinner.mockReturnValue(ENTRIES[1]);
  mocks.planSpin.mockReturnValue(mocks.profile);
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useSpinAnimation', () => {
  it('does nothing for fewer than two entries', () => {
    const options = { onSpinStart: vi.fn(), onLanded: vi.fn() };
    const { result } = renderHook(() => useSpinAnimation(options));
    act(() => result.current.start({ entries: [ENTRIES[0]], isReducedMotion: false }));
    expect(mocks.pickWinner).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
  });

  it('picks first, animates to the profile end, then lands once', () => {
    const options = { onSpinStart: vi.fn(), onLanded: vi.fn() };
    const { result } = renderHook(() => useSpinAnimation(options));
    result.current.positionRef.current = 3;
    act(() => result.current.start({ entries: ENTRIES, isReducedMotion: false }));
    expect(mocks.planSpin).toHaveBeenCalledWith({ startP: 3, winnerIndex: 1, n: 2 });
    expect(options.onSpinStart).toHaveBeenCalledWith(ENTRIES[1]);
    frame(1050);
    expect(result.current.positionRef.current).toBe(5);
    expect(result.current.speedRef.current).toBe(2.5);
    frame(1100);
    expect(options.onLanded).toHaveBeenCalledWith(ENTRIES[1]);
    expect(callbacks.size).toBe(0);
  });

  it('uses the reduced profile, stop zeroes speed, and unmount cancels', () => {
    const options = { onSpinStart: vi.fn(), onLanded: vi.fn() };
    const { result, unmount } = renderHook(() => useSpinAnimation(options));
    act(() => result.current.start({ entries: ENTRIES, isReducedMotion: true }));
    expect(mocks.planSpin).toHaveBeenCalledWith({
      startP: 0, winnerIndex: 1, n: 2, accelMs: 350, decelMs: 700, minCruiseMs: 250, settle: false,
    });
    frame(1010);
    act(() => result.current.stop());
    expect(result.current.speedRef.current).toBe(0);
    expect(callbacks.size).toBe(0);
    act(() => result.current.start({ entries: ENTRIES, isReducedMotion: false }));
    unmount();
    expect(callbacks.size).toBe(0);
  });
});
