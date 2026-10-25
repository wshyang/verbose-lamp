import { useCallback, useState } from 'react';
import type { LuckyDrawEntry } from '@/features/lucky-draw';
import { useSpectacle } from '@/features/spectacle';
import { useSpectaclePreview } from '@/features/spectacle-preview';

const LANDED_CONFETTI_ORIGIN = { x: 0.5, y: 0.4 } as const;

/** Premiere-host decisions for the docked Spectacle console and lucky draw. */
export function usePremiereSpectacle() {
  const preview = useSpectaclePreview();
  const { play } = useSpectacle();
  const [isDrawOpen, setDrawOpen] = useState(false);

  const togglePanel = useCallback(() => {
    preview.setOpen(!preview.open);
  }, [preview]);
  const openDraw = useCallback(() => setDrawOpen(true), []);
  const closeDraw = useCallback(() => setDrawOpen(false), []);
  const handleLanded = useCallback(
    (winner: LuckyDrawEntry) => {
      play('confetti', { mode: 'burst', origin: LANDED_CONFETTI_ORIGIN, seed: 1925 });
      play('name-reveal', { name: winner.name, subtitle: winner.subtitle ?? 'Lucky draw winner' });
    },
    [play]
  );

  return { preview, isDrawOpen, togglePanel, openDraw, closeDraw, handleLanded };
}
