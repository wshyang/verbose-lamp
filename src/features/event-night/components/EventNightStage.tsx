import { GildedNavBar } from '@/features/gilded-ui';
import { LuckyDrawStage } from '@/features/lucky-draw';
import {
  KeepClearSpeaker, OriginCrosshair, PickOriginHint,
  SpectaclePreviewLauncher, SpectaclePreviewPanel,
} from '@/features/spectacle-preview';
import { GoldUiSection, LatticeSection } from './EventNightConsoleSections';
import { useEventNightStage } from '../hooks/useEventNightStage';
import { EventNightHeader } from './EventNightHeader';
import { StageBackdrop } from './StageBackdrop';
import { TitleMedallion } from './TitleMedallion';

interface EventNightStageProps {
  onExit: () => void;
}

/** Composes the event-night surfaces inside the spectacle provider. */
export function EventNightStage({ onExit }: EventNightStageProps) {
  const { preview, gold, lattice, night } = useEventNightStage();

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
              seed: lattice.latticeSeed, density: lattice.latticeDensity, level: lattice.latticeLevel,
            }}
            hasMarquee={preview.marqueeOn}
            tagline={night.tagline}
          />
        </main>
        <div ref={night.navRef} className="fixed inset-x-0 bottom-3 z-30 flex justify-center px-2">
          <GildedNavBar items={gold.navItems} activeId={night.activeId} onSelect={night.selectNav} />
        </div>
      </div>
      {preview.open && (
        <OriginCrosshair origin={preview.origin} isPicking={preview.picking} testId="event-night__origin-crosshair" />
      )}
      {preview.picking && <PickOriginHint testId="event-night__pick-hint" />}
      {preview.keepClearOn && (
        <KeepClearSpeaker rect={preview.speaker} onMove={preview.moveSpeaker} testId="event-night__speaker" />
      )}
      <SpectaclePreviewPanel preview={preview} onOpenDraw={night.openDraw}>
        <GoldUiSection gold={gold} />
        <LatticeSection lattice={lattice} />
      </SpectaclePreviewPanel>
      {night.isDrawOpen && <LuckyDrawStage onClose={night.closeDraw} onLanded={night.handleLanded} />}
    </>
  );
}
