import { LuckyDrawStage } from '@/features/lucky-draw';
import { SpectaclePreviewPanel } from '@/features/spectacle-preview';
import type { PremiereSpectacle } from '../hooks/usePremiereSpectacle';

interface PremiereSpectacleOverlayProps {
  spectacle: PremiereSpectacle;
}

/**
 * The small overlay: the docked, non-modal console that drives every effect,
 * plus the lucky-draw dialog it can open. Nothing here is modal except the
 * draw itself, so the effect stays visible while you tune it.
 */
export function PremiereSpectacleOverlay({ spectacle }: PremiereSpectacleOverlayProps) {
  return (
    <>
      <SpectaclePreviewPanel preview={spectacle.preview} onOpenDraw={spectacle.openDraw} />
      {spectacle.isDrawOpen && (
        <LuckyDrawStage onClose={spectacle.closeDraw} onLanded={spectacle.handleLanded} />
      )}
    </>
  );
}
