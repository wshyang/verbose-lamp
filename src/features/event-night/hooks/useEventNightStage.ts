import { useSpectacle } from '@/features/spectacle';
import { useSpectaclePreview } from '@/features/spectacle-preview';
import { useAmbientShow } from './useAmbientShow';
import { useEventNight } from './useEventNight';
import { useGoldUiLines } from './useGoldUiLines';
import { useLatticeControls } from './useLatticeControls';

/**
 * Everything the Event Night stage decides: the console, the two controls only this screen uses
 * (the gold nav lines and the title lattice), the nav and draw behaviour, and the ambient show that
 * starts once the stage is ready. The component renders what this returns.
 */
export function useEventNightStage() {
  const { isReady } = useSpectacle();
  const preview = useSpectaclePreview();
  const gold = useGoldUiLines();
  const lattice = useLatticeControls();
  const night = useEventNight(gold.navItems);
  const { toggleFireworks, toggleSearchlights } = preview;

  useAmbientShow({
    isReady,
    start: () => {
      toggleFireworks();
      toggleSearchlights();
    },
  });

  return { preview, gold, lattice, night };
}
