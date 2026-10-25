import { useCallback } from 'react';
import type { LuckyDrawEntry } from '@/features/lucky-draw';
import { useSpectacle } from '@/features/spectacle';

/**
 * What happens when the drum lands: a gold burst, then the name in gilded
 * lettering. The same chain the Event Night screen uses, kept small enough to
 * reuse from any host.
 */
export function useWinnerCelebration() {
  const { play } = useSpectacle();
  return useCallback(
    (winner: LuckyDrawEntry) => {
      play('confetti', { mode: 'burst', origin: { x: 0.5, y: 0.55 }, seed: 1925 });
      play('name-reveal', { name: winner.name, subtitle: 'Lucky draw winner' });
    },
    [play]
  );
}
