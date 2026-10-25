import { LuckyDrawStage } from '@/features/lucky-draw';
import type { SpectacleConsoleState } from '../hooks/useSpectacleConsole';
import { SpectaclePreviewPanel } from './SpectaclePreviewPanel';

interface SpectacleConsoleOverlayProps {
  state: SpectacleConsoleState;
}

/**
 * The console's overlay surfaces: the small docked panel and, when the panel or a
 * host asks for it, the lucky-draw dialog. Both are fixed-position, so a host only
 * has to render this component once inside its spectacle provider.
 */
export function SpectacleConsoleOverlay({ state }: SpectacleConsoleOverlayProps) {
  const { preview, draw } = state;
  return (
    <>
      <SpectaclePreviewPanel preview={preview} onOpenDraw={draw.open} />
      {draw.isOpen && <LuckyDrawStage onClose={draw.close} onLanded={draw.handleLanded} />}
    </>
  );
}
