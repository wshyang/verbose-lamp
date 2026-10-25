import { useCallback, useState } from 'react';
import { CustomTitleModal } from '@/features/title-customizer';
import { ResearchModal } from '@/features/research';
import {
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
  usePremiereController,
  usePremiereShortcuts,
} from '@/features/premiere';
import { SpectaclePreviewLauncher } from '@/features/spectacle-preview';
import { usePremiereSpectacle } from '../hooks/usePremiereSpectacle';
import { CinematicStage } from './CinematicStage';
import { FloatingHudToggle } from './FloatingHudToggle';
import { FrameStudioDock } from './FrameStudioDock';
import { OrbitHint } from './OrbitHint';
import { PremiereHeader } from './PremiereHeader';
import { PremiereSpectacleOverlay } from './PremiereSpectacleOverlay';
import { PremiereTimeline } from './PremiereTimeline';

interface PremiereSurfacesProps {
  onOpenEventNight: () => void;
}

/**
 * Everything inside the premiere's spectacle stage: the cinematic canvas, the
 * HUD, the frame studio and the spectacle console. Split out of
 * `GatsbyPremiere` so the console's hooks run inside `SpectacleProvider`.
 */
export function PremiereSurfaces({ onOpenEventNight }: PremiereSurfacesProps) {
  const premiere = usePremiereController();
  const spectacle = usePremiereSpectacle();
  const [hudHidden, setHudHidden] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const toggleHud = useCallback(() => setHudHidden((hidden) => !hidden), []);
  const closeResearch = useCallback(() => setShowResearch(false), []);
  const closeCustomizer = useCallback(() => setShowCustomizer(false), []);
  const toggleSpectacle = useCallback(
    () => spectacle.preview.setOpen(!spectacle.preview.open),
    [spectacle.preview]
  );
  const { onStageClick } = spectacle.preview;

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
      onClick={(event) => onStageClick(event.clientX, event.clientY)}
    >
      <CinematicStage
        mountRef={premiere.stageRef}
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
        launcher={<SpectaclePreviewLauncher open={spectacle.preview.open} onToggle={toggleSpectacle} />}
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
      <FloatingHudToggle isHidden={hudHidden} onToggle={toggleHud} />
      <ResearchModal open={showResearch} onClose={closeResearch} />
      <CustomTitleModal
        open={showCustomizer}
        config={premiere.heroConfig}
        onApply={premiere.applyHeroTitle}
        onClose={closeCustomizer}
      />
      <PremiereSpectacleOverlay spectacle={spectacle} />
    </main>
  );
}
