import { useCallback, useState } from 'react';
import { LuckyDrawStage } from '@/features/lucky-draw';
import { PartySparklerLauncher, usePartySparklers } from '@/features/party-sparklers';
import {
  SpectaclePreviewLauncher,
  SpectaclePreviewPanel,
  useSpectaclePreview,
} from '@/features/spectacle-preview';
import { useWinnerCelebration } from '../hooks/useWinnerCelebration';

/**
 * The premiere's effects controls: the reusable Spectacle console, the one-click
 * party-sparkler button with its small overlay, and the lucky-draw drum they can
 * both open (ADDENDUM-027). The panel and the dialog are fixed/portal, so this
 * lives wherever the host has room — here, in the header nav.
 */
export function PremiereEffectsDock() {
  const preview = useSpectaclePreview();
  const sparklers = usePartySparklers();
  const [isDrawOpen, setDrawOpen] = useState(false);
  const onLanded = useWinnerCelebration();
  const openDraw = useCallback(() => setDrawOpen(true), []);
  const closeDraw = useCallback(() => setDrawOpen(false), []);
  const toggleConsole = useCallback(() => preview.setOpen(!preview.open), [preview]);

  return (
    <>
      <SpectaclePreviewLauncher open={preview.open} onToggle={toggleConsole} />
      <PartySparklerLauncher sparklers={sparklers} />
      <SpectaclePreviewPanel preview={preview} onOpenDraw={openDraw} />
      {isDrawOpen ? <LuckyDrawStage onClose={closeDraw} onLanded={onLanded} /> : null}
    </>
  );
}
