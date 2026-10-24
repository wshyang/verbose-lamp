import { useEffect, useState } from 'react';
import { playDing, primeAudio } from '../audio/ding.js';
import type { ScanOutcome } from './useFringeStation.js';

/**
 * ADR-092 — the screen itself confirms a server-acknowledged award: a green border flash
 * plus a ding. Only `awarded` celebrates — a queued scan is a promise, a duplicate is a
 * refusal, and neither should sound like a success. Returns a counter the page uses to
 * re-key the flash overlay so back-to-back awards each flash.
 */
export function useAwardCelebration(outcome: ScanOutcome | null): number {
  const [celebration, setCelebration] = useState(0);

  // Audio unlocks only inside a user gesture (iOS); the first tap anywhere arms it.
  useEffect(() => {
    window.addEventListener('pointerdown', primeAudio);
    return () => window.removeEventListener('pointerdown', primeAudio);
  }, []);

  useEffect(() => {
    if (outcome?.kind !== 'awarded') return;
    playDing();
    setCelebration((count) => count + 1);
  }, [outcome]);

  return celebration;
}
