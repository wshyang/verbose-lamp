import { useCallback, useState } from 'react';
import { playWinnerCelebration, useSpectacle, winnerCelebration } from '@/features/spectacle';
import { useSpectaclePreview } from '@/features/spectacle-preview';
import type { LuckyDrawEntry } from '@/features/lucky-draw';
import { DEFAULT_SEED } from '@/shared/lib/random';

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
      playWinnerCelebration(play, winnerCelebration({ winner, seed: DEFAULT_SEED, sparklerCount: FAN_SIZE }));
    },
    [play]
  );

  return { preview, isDrawOpen, openDraw, closeDraw, handleLanded };
}

export type PremiereSpectacle = ReturnType<typeof usePremiereSpectacle>;
