import { useCallback, useState } from 'react';
import { GildedGlyphDefs } from '@/features/gilded-ui';
import { LuckyDrawStage } from '@/features/lucky-draw';
import { SpectacleProvider } from '@/features/spectacle';
import {
  KeepClearSpeaker,
  OriginCrosshair,
  PickOriginHint,
  SpectaclePreviewPanel,
} from '@/features/spectacle-preview';
import { CustomTitleModal } from '@/features/title-customizer';
import { ResearchModal } from '@/features/research';
import {
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
  usePremiereController,
  usePremiereShortcuts,
} from '@/features/premiere';
import { CinematicStage } from './components/CinematicStage';
import { FloatingHudToggle } from './components/FloatingHudToggle';
import { FrameStudioDock } from './components/FrameStudioDock';
import { OrbitHint } from './components/OrbitHint';
import { PremiereHeader } from './components/PremiereHeader';
import { PremiereTimeline } from './components/PremiereTimeline';
import { usePremiereSpectacle } from './hooks/usePremiereSpectacle';

interface GatsbyPremiereProps {
  onOpenEventNight: () => void;
}

function PremiereScreen({ onOpenEventNight }: GatsbyPremiereProps) {
  const premiere = usePremiereController();
  const spectacle = usePremiereSpectacle();
  const preview = spectacle.preview;
  const [hudHidden, setHudHidden] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const toggleHud = useCallback(() => setHudHidden((hidden) => !hidden), []);
  const closeResearch = useCallback(() => setShowResearch(false), []);
  const closeCustomizer = useCallback(() => setShowCustomizer(false), []);

  usePremiereShortcuts({
    isDialogOpen: showResearch || showCustomizer || spectacle.isDrawOpen,
    togglePlayback: premiere.togglePlayback,
    selectAct: premiere.selectAct,
    toggleCameraMode: premiere.toggleCameraMode,
    toggleHud,
  });

  return (
    <main
      className="relative h-dvh w-screen select-none overflow-hidden bg-[#050407]"
      onClick={(event) => preview.onStageClick(event.clientX, event.clientY)}
    >
      <CinematicStage
        store={premiere.sceneStore}
        cameraMode={premiere.cameraMode}
        hudHidden={hudHidden}
      />
      <PremiereHeader
        cameraMode={premiere.cameraMode}
        nitrateMode={premiere.nitrateMode}
        soundOn={premiere.soundOn}
        hudHidden={hudHidden}
        onOpenResearch={() => setShowResearch(true)}
        onOpenCustomizer={() => setShowCustomizer(true)}
        onOpenEventNight={onOpenEventNight}
        spectacleOpen={preview.open}
        onToggleSpectacle={spectacle.togglePanel}
        onToggleCameraMode={premiere.toggleCameraMode}
        onToggleNitrate={premiere.toggleNitrateMode}
        onToggleSound={premiere.toggleSound}
      />
      <FrameStudioDock studio={premiere.frameStudio} hudHidden={hudHidden} />
      <OrbitHint isVisible={premiere.cameraMode === 'orbit' && !hudHidden} />
      <PremiereTimeline
        chapters={SEQUENCE_CHAPTERS}
        currentChapter={premiere.currentChapter}
        heroConfig={premiere.heroConfig}
        activeAct={premiere.activeAct}
        currentTime={premiere.currentTime}
        duration={TOTAL_SEQUENCE_DURATION}
        isPlaying={premiere.isPlaying}
        hudHidden={hudHidden}
        onSelectAct={premiere.selectAct}
        onTogglePlayback={premiere.togglePlayback}
        onReplay={premiere.replay}
        onScrub={premiere.scrub}
      />
      {preview.open && <OriginCrosshair origin={preview.origin} isPicking={preview.picking} />}
      {preview.picking && <PickOriginHint />}
      {preview.keepClearOn && <KeepClearSpeaker rect={preview.speaker} onMove={preview.moveSpeaker} />}
      <SpectaclePreviewPanel preview={preview} onOpenDraw={spectacle.openDraw} placement="left" />
      {spectacle.isDrawOpen && (
        <LuckyDrawStage onClose={spectacle.closeDraw} onLanded={spectacle.handleLanded} />
      )}
      <FloatingHudToggle isHidden={hudHidden} onToggle={toggleHud} />
      <ResearchModal open={showResearch} onClose={closeResearch} />
      <CustomTitleModal
        open={showCustomizer}
        config={premiere.heroConfig}
        onApply={premiere.applyHeroTitle}
        onClose={closeCustomizer}
      />
    </main>
  );
}

/** The premiere owns one spectacle stage so its small console can drive effects live. */
export function GatsbyPremiere({ onOpenEventNight }: GatsbyPremiereProps) {
  return (
    <SpectacleProvider className="relative h-dvh w-screen overflow-hidden bg-[#050407]">
      <GildedGlyphDefs />
      <PremiereScreen onOpenEventNight={onOpenEventNight} />
    </SpectacleProvider>
  );
}
