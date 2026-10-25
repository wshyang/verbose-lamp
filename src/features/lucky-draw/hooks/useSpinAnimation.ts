import { useCallback, useEffect, useRef } from 'react';
import type { LuckyDrawEntry } from '../model/entries';
import { pickWinner } from '../model/pickWinner';
import { planSpin, type SpinProfile } from '../model/spin';

interface SpinStart {
  entries: readonly LuckyDrawEntry[];
  /** Shorter, settle-free profile for reduced motion. */
  isReducedMotion: boolean;
}

interface UseSpinAnimationOptions {
  onSpinStart: (winner: LuckyDrawEntry) => void;
  onLanded: (winner: LuckyDrawEntry) => void;
}

const REDUCED_PROFILE = { accelMs: 350, decelMs: 700, minCruiseMs: 250, settle: false } as const;

/**
 * Owns the requestAnimationFrame spin. The fair pick happens here, before the
 * animation, and the animation only plays it out (fairness boundary).
 */
export function useSpinAnimation({ onSpinStart, onLanded }: UseSpinAnimationOptions) {
  const positionRef = useRef(0);
  const speedRef = useRef(0);
  const profileRef = useRef<SpinProfile | null>(null);
  const rafRef = useRef(0);

  const cancel = useCallback(() => cancelAnimationFrame(rafRef.current), []);
  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    ({ entries, isReducedMotion }: SpinStart) => {
      if (entries.length < 2) return;
      const picked = pickWinner(entries);
      const profile = planSpin({
        startP: positionRef.current,
        winnerIndex: entries.indexOf(picked),
        n: entries.length,
        ...(isReducedMotion ? REDUCED_PROFILE : {}),
      });
      profileRef.current = profile;
      onSpinStart(picked);
      const startedAt = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startedAt;
        positionRef.current = profile.positionAt(elapsed);
        speedRef.current = profile.velocityAt(elapsed);
        if (elapsed >= profile.durationMs) {
          onLanded(picked);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      cancel();
      rafRef.current = requestAnimationFrame(tick);
    },
    [onSpinStart, onLanded, cancel],
  );

  const stop = useCallback(() => {
    cancel();
    speedRef.current = 0;
  }, [cancel]);

  return { positionRef, speedRef, start, stop };
}
