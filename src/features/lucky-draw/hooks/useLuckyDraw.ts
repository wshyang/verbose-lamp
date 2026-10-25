import { useCallback, useState } from 'react';
import { useReducedMotion } from '@/shared/hooks/useReducedMotion';
import type { LuckyDrawEntry } from '../model/entries';
import { useDrawPool } from './useDrawPool';
import { useSpinAnimation } from './useSpinAnimation';

export type DrawPhase = 'idle' | 'spinning' | 'landed';

interface UseLuckyDrawOptions {
  onLanded?: (winner: LuckyDrawEntry) => void;
}

/** Decides: phase and winner. The pool hook validates, the spin hook animates. */
export function useLuckyDraw({ onLanded }: UseLuckyDrawOptions) {
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [winner, setWinner] = useState<LuckyDrawEntry | null>(null);
  const isReducedMotion = useReducedMotion();
  const drawPool = useDrawPool();

  const handleSpinStart = useCallback((picked: LuckyDrawEntry) => {
    setWinner(picked);
    setPhase('spinning');
  }, []);
  const handleLanded = useCallback(
    (picked: LuckyDrawEntry) => {
      setPhase('landed');
      onLanded?.(picked);
    },
    [onLanded],
  );
  const spinner = useSpinAnimation({ onSpinStart: handleSpinStart, onLanded: handleLanded });

  const spin = useCallback(() => {
    if (phase !== 'spinning') spinner.start({ entries: drawPool.pool, isReducedMotion });
  }, [phase, drawPool.pool, isReducedMotion, spinner]);

  const redraw = useCallback(() => {
    if (phase === 'spinning' || !winner) return;
    spinner.start({ entries: drawPool.exclude(winner), isReducedMotion });
  }, [phase, winner, drawPool, isReducedMotion, spinner]);

  const reset = useCallback(() => {
    spinner.stop();
    drawPool.clearExclusions();
    setWinner(null);
    setPhase('idle');
  }, [spinner, drawPool]);

  const setGuestCount = useCallback(
    (n: number) => {
      drawPool.setGuestCount(n);
      reset();
    },
    [drawPool, reset],
  );

  return {
    pool: drawPool.pool, phase, winner, guestCount: drawPool.guestCount, setGuestCount,
    spin, redraw, reset,
    positionRef: spinner.positionRef, speedRef: spinner.speedRef,
    drawnCount: drawPool.drawnCount,
  };
}
