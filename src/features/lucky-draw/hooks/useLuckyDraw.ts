import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '@/shared/hooks/useReducedMotion';
import { SAMPLE_GUESTS } from '../data/sampleGuests';
import { validateEntries, withoutWinners, type LuckyDrawEntry } from '../model/entries';
import { pickWinner } from '../model/pickWinner';
import { planSpin, type SpinProfile } from '../model/spin';

export type DrawPhase = 'idle' | 'spinning' | 'landed';

interface UseLuckyDrawOptions {
  onLanded?: (winner: LuckyDrawEntry) => void;
}

/** Decides: validation, fair pick, spin profile, phase. The stage only renders. */
export function useLuckyDraw({ onLanded }: UseLuckyDrawOptions) {
  const [guestCount, setGuestCountState] = useState(300);
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [winner, setWinner] = useState<LuckyDrawEntry | null>(null);
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const positionRef = useRef(0);
  const speedRef = useRef(0);
  const profileRef = useRef<SpinProfile | null>(null);
  const rafRef = useRef(0);
  const reduced = useReducedMotion();

  const all = useMemo(() => {
    const result = validateEntries(SAMPLE_GUESTS.slice(0, guestCount));
    return result.ok ? result.entries : [];
  }, [guestCount]);
  const pool = useMemo(() => withoutWinners(all, excluded), [all, excluded]);

  const cancelLoop = useCallback(() => cancelAnimationFrame(rafRef.current), []);
  useEffect(() => cancelLoop, [cancelLoop]);

  const spinWith = useCallback(
    (entries: readonly LuckyDrawEntry[]) => {
      if (entries.length < 2) return;
      const picked = pickWinner(entries);
      const profile = planSpin({
        startP: positionRef.current,
        winnerIndex: entries.indexOf(picked),
        n: entries.length,
        ...(reduced ? { accelMs: 350, decelMs: 700, minCruiseMs: 250, settle: false } : {}),
      });
      profileRef.current = profile;
      setWinner(picked);
      setPhase('spinning');
      const start = performance.now();
      const tick = (now: number) => {
        const t = now - start;
        positionRef.current = profile.positionAt(t);
        speedRef.current = profile.velocityAt(t);
        if (t >= profile.durationMs) {
          setPhase('landed');
          onLanded?.(picked);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      cancelLoop();
      rafRef.current = requestAnimationFrame(tick);
    },
    [reduced, onLanded, cancelLoop],
  );

  const spin = useCallback(() => {
    if (phase !== 'spinning') spinWith(pool);
  }, [phase, pool, spinWith]);

  const redraw = useCallback(() => {
    if (phase === 'spinning' || !winner) return;
    const nextExcluded = [...excluded, winner.id];
    setExcluded(nextExcluded);
    spinWith(withoutWinners(all, nextExcluded));
  }, [phase, winner, excluded, all, spinWith]);

  const reset = useCallback(() => {
    cancelLoop();
    setExcluded([]);
    setWinner(null);
    setPhase('idle');
    speedRef.current = 0;
  }, [cancelLoop]);

  const setGuestCount = useCallback(
    (n: number) => {
      cancelLoop();
      setGuestCountState(n);
      setExcluded([]);
      setWinner(null);
      setPhase('idle');
    },
    [cancelLoop],
  );

  return {
    pool, phase, winner, guestCount, setGuestCount,
    spin, redraw, reset, positionRef, speedRef,
    drawnCount: excluded.length,
  };
}