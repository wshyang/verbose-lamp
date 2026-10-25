import { useCallback, useState } from 'react';
import { CustomTitleModal } from '@/features/title-customizer';
import { ResearchModal } from '@/features/research';
import {
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
  usePremiereController,
  usePremiereShortcuts,
} from '@/features/premiere';
import { SpectacleProvider } from '@/features/spectacle';
import {
  SpectacleConsoleOverlay,
  SpectaclePreviewLauncher,
  useSpectacleConsole,
} from '@/features/spectacle-preview';
import { CinematicStage } from './components/CinematicStage';
import { FloatingHudToggle } from './components/FloatingHudToggle';
import { FrameStudioDock } from './components/FrameStudioDock';
import { OrbitHint } from './components/OrbitHint';
import { PremiereHeader } from './components/PremiereHeader';
import { PremiereTimeline } from './components/PremiereTimeline';

interface GatsbyPremiereProps {
  onOpenEventNight: () => void;
}

/**
 * The premiere screen. It owns one spectacle stage, so the celebration effects
 * and the small console overlay play over the WebGL title sequence instead of
 * being confined to the Event Night demo (ADDENDUM-025).
 *
 * The provider has to sit above anything that calls `useSpectacle`, so the screen
 * itself is a separate component (hooks cannot consume a context rendered below
 * them).
 */
export function GatsbyPremiere({ onOpenEventNight }: GatsbyPremiereProps) {
  return (
    <SpectacleProvider className="relative h-dvh w-screen overflow-hidden">
      <PremiereScreen onOpenEventNight={onOpenEventNight} />
    </SpectacleProvider>
  );
}

function PremiereScreen({ onOpenEventNight }: GatsbyPremiereProps) {
  const premiere = usePremiereController();
  const spectacle = useSpectacleConsole();
  const [hudHidden, setHudHidden] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const toggleHud = useCallback(() => setHudHidden((hidden) => !hidden), []);
  const closeResearch = useCallback(() => setShowResearch(false), []);
  const closeCustomizer = useCallback(() => setShowCustomizer(false), []);

  usePremiereShortcuts({
    isDialogOpen: showResearch || showCustomizer,
    togglePlayback: premiere.togglePlayback,
    selectAct: premiere.selectAct,
    toggleCameraMode: premiere.toggleCameraMode,
    toggleHud,
  });

  return (
    <main className="relative h-full w-full select-none overflow-hidden bg-[#050407]">
      <CinematicStage
        mountRef={premiere.stageRef}
        store={premiere.store}
        cameraMode={premiere.cameraMode}
        hudHidden={hudHidden}
      />
      <PremiereHeader
        launcher={<SpectaclePreviewLauncher open={spectacle.preview.open} onToggle={spectacle.toggle} />}
        cameraMode={premiere.cameraMode}
        nitrateMode={premiere.nitrateMode}
        soundOn={premiere.soundOn}
        hudHidden={hudHidden}
        onOpenResearch={() => setShowResearch(true)}
        onOpenCustomizer={() => setShowCustomizer(true)}
        onOpenEventNight={onOpenEventNight}
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
      <SpectacleConsoleOverlay state={spectacle} />
    </main>
  );
}
