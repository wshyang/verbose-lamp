import { useCallback, useState } from 'react';
import type { LuckyDrawEntry } from '@/features/lucky-draw';
import { useSpectacle } from '@/features/spectacle';

const LANDED_CONFETTI_ORIGIN = { x: 0.5, y: 0.4 } as const;
const SEED_MODULUS = 100000;

/**
 * Owns a lucky-draw session and the celebration that follows a winner. Extracted
 * from the Event Night screen so any host (Event Night, the premiere console) can
 * offer the same drum without copying the chaining rules (ADDENDUM-025).
 */
export function useLuckyDrawStage() {
  const { play } = useSpectacle();
  const [isOpen, setOpen] = useState(false);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const handleLanded = useCallback(
    (winner: LuckyDrawEntry) => {
      play('confetti', {
        mode: 'burst',
        origin: LANDED_CONFETTI_ORIGIN,
        seed: Date.now() % SEED_MODULUS,
      });
      play('name-reveal', { name: winner.name, subtitle: winner.subtitle ?? 'Lucky draw winner' });
    },
    [play],
  );

  return { isOpen, open, close, handleLanded };
}

export type LuckyDrawStageState = ReturnType<typeof useLuckyDrawStage>;
