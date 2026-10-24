import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAwardCelebration } from './useAwardCelebration.js';
import { playDing, primeAudio } from '../audio/ding.js';
import type { ScanOutcome } from './useFringeStation.js';

/**
 * ADR-092 — only a server-acknowledged award celebrates; queued, duplicate and rejected
 * outcomes stay silent, and the audio context is primed by the first touch (iOS unlock).
 */

vi.mock('../audio/ding.js', () => ({ playDing: vi.fn(), primeAudio: vi.fn() }));

beforeEach(() => {
  vi.mocked(playDing).mockClear();
  vi.mocked(primeAudio).mockClear();
});

function outcomeOf(kind: ScanOutcome['kind']): ScanOutcome {
  return { kind, message: 'outcome' };
}

describe('useAwardCelebration', () => {
  it('counts awarded outcomes only, once per new outcome', () => {
    const { result, rerender } = renderHook(
      ({ outcome }: { outcome: ScanOutcome | null }) => useAwardCelebration(outcome),
      { initialProps: { outcome: null as ScanOutcome | null } },
    );
    expect(result.current).toBe(0);

    rerender({ outcome: outcomeOf('queued') });
    rerender({ outcome: outcomeOf('duplicate') });
    rerender({ outcome: outcomeOf('rejected') });
    expect(result.current).toBe(0);
    expect(playDing).not.toHaveBeenCalled();

    rerender({ outcome: outcomeOf('awarded') });
    expect(result.current).toBe(1);
    rerender({ outcome: outcomeOf('awarded') });
    expect(result.current).toBe(2);
    expect(playDing).toHaveBeenCalledTimes(2);
  });

  it('primes audio on the first touch and stops listening after unmount', () => {
    const { unmount } = renderHook(() => useAwardCelebration(null));

    window.dispatchEvent(new Event('pointerdown'));
    expect(primeAudio).toHaveBeenCalledTimes(1);

    unmount();
    window.dispatchEvent(new Event('pointerdown'));
    expect(primeAudio).toHaveBeenCalledTimes(1);
  });
});
