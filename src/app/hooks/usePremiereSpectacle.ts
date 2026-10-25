import { useCallback, useState } from 'react';
import { useSpectacle } from '@/features/spectacle';
import { useSpectaclePreview } from '@/features/spectacle-preview';
import type { LuckyDrawEntry } from '@/features/lucky-draw';

const CELEBRATION_ORIGIN = { x: 0.5, y: 0.4 } as const;
const CELEBRATION_SEED = 1925;
const FAN_SIZE = 5;

/**
 * The premiere's spectacle console: the docked preview panel, the origin
 * picking, and the lucky-draw dialog. Lives under `SpectacleProvider`, so the
 * hooks can call the stage (ADDENDUM-025 §5).
 */
export function usePremiereSpectacle() {
  const preview = useSpectaclePreview();
  const { play } = useSpectacle();
  const [isDrawOpen, setDrawOpen] = useState(false);

  const openDraw = useCallback(() => setDrawOpen(true), []);
  const closeDraw = useCallback(() => setDrawOpen(false), []);

  const handleLanded = useCallback(
    (winner: LuckyDrawEntry) => {
      play('confetti', { mode: 'burst', origin: CELEBRATION_ORIGIN, seed: CELEBRATION_SEED });
      play('sparkler', {
        origin: CELEBRATION_ORIGIN,
        count: FAN_SIZE,
        seed: CELEBRATION_SEED,
        intensity: 0.9,
      });
      play('name-reveal', { name: winner.name, subtitle: winner.subtitle ?? 'Lucky draw winner' });
    },
    [play]
  );

  return { preview, isDrawOpen, openDraw, closeDraw, handleLanded };
}

export type PremiereSpectacle = ReturnType<typeof usePremiereSpectacle>;
