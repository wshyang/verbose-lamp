import { GildedNavBar } from '@/features/gilded-ui';
import { LuckyDrawStage } from '@/features/lucky-draw';
import { useSpectacle } from '@/features/spectacle';
import {
  SpectaclePreviewLauncher, SpectaclePreviewPanel, useSpectaclePreview,
} from '@/features/spectacle-preview';
import { useAmbientShow } from '../hooks/useAmbientShow';
import { useEventNight } from '../hooks/useEventNight';
import { EventNightHeader } from './EventNightHeader';
import { KeepClearSpeaker } from './KeepClearSpeaker';
import { OriginCrosshair } from './OriginCrosshair';
import { PickOriginHint } from './PickOriginHint';
import { StageBackdrop } from './StageBackdrop';
import { TitleMedallion } from './TitleMedallion';

interface EventNightStageProps {
  onExit: () => void;
}

/** Composes the event-night surfaces inside the spectacle provider. */
export function EventNightStage({ onExit }: EventNightStageProps) {
  const { isReady } = useSpectacle();
  const preview = useSpectaclePreview();
  const night = useEventNight(preview.navItems);
  const { toggleFireworks, toggleSearchlights } = preview;

  useAmbientShow({
    isReady,
    start: () => {
      toggleFireworks();
      toggleSearchlights();
    },
  });

  return (
    <>
      <StageBackdrop />
      <div
        className="relative z-10 flex h-full min-h-0 flex-col"
        onClick={(e) => preview.onStageClick(e.clientX, e.clientY)}
      >
        <EventNightHeader
          onExit={onExit}
          onOpenDraw={night.openDraw}
          launcher={<SpectaclePreviewLauncher open={preview.open} onToggle={() => preview.setOpen(!preview.open)} />}
        />
        <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-28 pt-2">
          <TitleMedallion
            lattice={{
              seed: preview.latticeSeed, density: preview.latticeDensity, level: preview.latticeLevel,
            }}
            hasMarquee={preview.marqueeOn}
            tagline={night.tagline}
          />
        </main>
        <div ref={night.navRef} className="fixed inset-x-0 bottom-3 z-30 flex justify-center px-2">
          <GildedNavBar items={preview.navItems} activeId={night.activeId} onSelect={night.selectNav} />
        </div>
      </div>
      {preview.open && <OriginCrosshair origin={preview.origin} isPicking={preview.picking} />}
      {preview.picking && <PickOriginHint />}
      {preview.keepClearOn && <KeepClearSpeaker rect={preview.speaker} onMove={preview.moveSpeaker} />}
      <SpectaclePreviewPanel preview={preview} onOpenDraw={night.openDraw} />
      {night.isDrawOpen && <LuckyDrawStage onClose={night.closeDraw} onLanded={night.handleLanded} />}
    </>
  );
}
