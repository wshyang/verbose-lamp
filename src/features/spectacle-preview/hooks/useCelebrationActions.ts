import { useCallback } from 'react';
import type { EffectRunner } from './useEffectRunner';

const COUNTDOWN_FROM = 5;

interface CelebrationInputs {
  runner: EffectRunner;
  origin: { x: number; y: number };
  seed: number;
  /** Chained when the countdown reaches zero. */
  onCountdownComplete: () => void;
}

/** Confetti, countdown and the gilded name reveal. */
export function useCelebrationActions({ runner, origin, seed, onCountdownComplete }: CelebrationInputs) {
  const { run } = runner;

  const playConfetti = useCallback(
    (mode: 'burst' | 'rain') => run(`confetti-${mode}`, 'confetti', { mode, origin, seed }),
    [run, origin, seed],
  );

  const playCountdown = useCallback(() => {
    run('countdown', 'countdown', { from: COUNTDOWN_FROM, onComplete: onCountdownComplete });
  }, [run, onCountdownComplete]);

  const playNameReveal = useCallback(() => {
    run('name-reveal', 'name-reveal', { name: 'Jay Gatsby', subtitle: 'Lucky draw winner' });
  }, [run]);

  const playSparklers = useCallback(
    (count: number) => {
      run(`sparkler-${count}`, 'sparkler', { origin, count, seed, intensity: 0.9 });
    },
    [run, origin, seed],
  );

  return { playConfetti, playCountdown, playNameReveal, playSparklers };
}
