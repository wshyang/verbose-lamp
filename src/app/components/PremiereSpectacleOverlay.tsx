import { LuckyDrawStage } from '@/features/lucky-draw';
import {
  KeepClearSpeaker,
  OriginCrosshair,
  PickOriginHint,
  SpectaclePreviewPanel,
} from '@/features/spectacle-preview';
import type { PremiereSpectacle } from '../hooks/usePremiereSpectacle';

interface PremiereSpectacleOverlayProps {
  spectacle: PremiereSpectacle;
}

/**
 * The small overlay: the docked, non-modal console that drives every effect,
 * plus the lucky-draw dialog it can open. Nothing here is modal except the
 * draw itself, so the effect stays visible while you tune it.
 *
 * The stage markers belong with the console: without them "Pick origin" arms the
 * click handler but shows nothing to click, and the keep-clear box cannot be seen
 * or dragged. Event Night mounts the same three.
 */
export function PremiereSpectacleOverlay({ spectacle }: PremiereSpectacleOverlayProps) {
  const { preview } = spectacle;
  return (
    <>
      {preview.open && <OriginCrosshair origin={preview.origin} isPicking={preview.picking} />}
      {preview.picking && <PickOriginHint />}
      {preview.keepClearOn && <KeepClearSpeaker rect={preview.speaker} onMove={preview.moveSpeaker} />}
      <SpectaclePreviewPanel preview={preview} onOpenDraw={spectacle.openDraw} />
      {spectacle.isDrawOpen && (
        <LuckyDrawStage onClose={spectacle.closeDraw} onLanded={spectacle.handleLanded} />
      )}
    </>
  );
}
