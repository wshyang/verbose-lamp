import { useCallback } from 'react';
import { useFrameStudio } from '@/features/frame-studio';
import { CustomTitleModal } from '@/features/title-customizer';
import { ResearchModal } from '@/features/research';
import {
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
  usePremiereController,
  usePremiereShortcuts,
} from '@/features/premiere';
import { SpectaclePreviewLauncher } from '@/features/spectacle-preview';
import { usePremiereChrome } from '../hooks/usePremiereChrome';
import { usePremiereSpectacle } from '../hooks/usePremiereSpectacle';
import { CinematicStage } from './CinematicStage';
import { FloatingHudToggle } from './FloatingHudToggle';
import { FrameStudioDock } from './FrameStudioDock';
import { forwardStageClick } from './forwardStageClick';
import { OrbitHint } from './OrbitHint';
import { PremiereHeader } from './PremiereHeader';
import { PremiereSpectacleOverlay } from './PremiereSpectacleOverlay';
import { PremiereTimeline } from './PremiereTimeline';

interface PremiereSurfacesProps {
  onOpenEventNight: () => void;
}

/**
 * Everything inside the premiere's spectacle stage: the cinematic canvas, the HUD, the frame
 * studio and the spectacle console. Split out of `GatsbyPremiere` so the console's hooks run
 * inside `SpectacleProvider`.
 */
export function PremiereSurfaces({ onOpenEventNight }: PremiereSurfacesProps) {
  const premiere = usePremiereController();
  const frameStudio = useFrameStudio(premiere.getSceneApi);
  const spectacle = usePremiereSpectacle();
  const chrome = usePremiereChrome();
  const { hudHidden, toggleHud, showResearch, showCustomizer } = chrome;
  const { open: isConsoleOpen, setOpen: setConsoleOpen, onStageClick } = spectacle.preview;
  const toggleSpectacle = useCallback(() => setConsoleOpen(!isConsoleOpen), [isConsoleOpen, setConsoleOpen]);

  usePremiereShortcuts({
    isDialogOpen: showResearch || showCustomizer || spectacle.isDrawOpen,
    togglePlayback: premiere.togglePlayback,
    selectAct: premiere.selectAct,
    toggleCameraMode: premiere.toggleCameraMode,
    toggleHud,
  });

  return (
    <main
      className="relative h-full w-full select-none overflow-hidden"
      onClick={(event) => forwardStageClick(event, onStageClick)}
    >
      <CinematicStage
        mountRef={premiere.stageRef}
        cameraMode={premiere.cameraMode}
        hudHidden={hudHidden}
        store={premiere.runtime.store}
        onSceneTelemetry={premiere.runtime.onSceneTelemetry}
        onSceneChapterChange={premiere.runtime.onSceneChapterChange}
        onSceneFrameReady={premiere.runtime.onSceneFrameReady}
      />
      <PremiereHeader
        cameraMode={premiere.cameraMode}
        nitrateMode={premiere.nitrateMode}
        soundOn={premiere.soundOn}
        hudHidden={hudHidden}
        onOpenResearch={chrome.openResearch}
        onOpenCustomizer={chrome.openCustomizer}
        onOpenEventNight={onOpenEventNight}
        launcher={<SpectaclePreviewLauncher open={isConsoleOpen} onToggle={toggleSpectacle} />}
        onToggleCameraMode={premiere.toggleCameraMode}
        onToggleNitrate={premiere.toggleNitrateMode}
        onToggleSound={premiere.toggleSound}
      />
      <FrameStudioDock studio={frameStudio} hudHidden={hudHidden} />
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
      <FloatingHudToggle isHidden={hudHidden} onToggle={toggleHud} />
      <ResearchModal open={showResearch} onClose={chrome.closeResearch} />
      <CustomTitleModal
        open={showCustomizer}
        config={premiere.heroConfig}
        onApply={premiere.applyHeroTitle}
        onClose={chrome.closeCustomizer}
      />
      <PremiereSpectacleOverlay spectacle={spectacle} />
    </main>
  );
}