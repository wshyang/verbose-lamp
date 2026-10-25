import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import { Backdrop } from './Backdrop';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaCamera } from './CinemaCamera';
import { CinemaComposer } from './CinemaComposer';
import { GoldDust } from './GoldDust';
import { GreenLight } from './GreenLight';
import { LightingRig } from './LightingRig';
import { PlaybackClock } from './PlaybackClock';
import { ScreenBorder } from './ScreenBorder';
import { TitleCard } from './TitleCard';
import { usePremiereStore } from './usePremiereStore';
import { useViewportFit } from './useViewportFit';

interface PremiereSceneProps {
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (index: number) => void;
  onFrameReady: () => void;
}

/**
 * The whole stage (ADDENDUM-022 §2.3). Mount order is load-bearing at
 * frame priority 0: CinemaCamera moves first, so the backdrop group
 * and lighting rig anchor to this frame's camera z — the manager's
 * animate() order. The hero card is keyed by its billing config, so a
 * Frame Studio title edit remounts exactly that rig.
 */
export function PremiereScene({ onTelemetry, onChapterChange, onFrameReady }: PremiereSceneProps) {
  const heroConfig = usePremiereStore((state) => state.heroConfig);
  const { cardScale } = useViewportFit();

  const cards = SEQUENCE_CHAPTERS.map((chapter, index) => {
    const isHero = chapter.archetype === 'gatsby_hero';
    return (
      <TitleCard
        key={isHero ? `hero-${JSON.stringify(heroConfig)}` : chapter.id}
        chapter={chapter}
        role={index === SEQUENCE_CHAPTERS.length - 1 ? 'finale' : 'standard'}
        cardScale={cardScale}
        heroOverride={isHero ? heroConfig : undefined}
      />
    );
  });

  return (
    <>
      <PlaybackClock
        onTelemetry={onTelemetry}
        onChapterChange={onChapterChange}
        onFrameReady={onFrameReady}
      />
      <BallroomEnvironment />
      <CinemaCamera />
      <LightingRig />
      <Backdrop />
      <GreenLight />
      <GoldDust />
      {cards}
      <ScreenBorder />
      <CinemaComposer />
    </>
  );
}
