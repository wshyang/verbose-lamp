import { usePremiereStore, type PremiereStoreApi } from './premiereStore';
import { Atmosphere } from './Atmosphere';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaCamera } from './CinemaCamera';
import { CinemaComposer } from './CinemaComposer';
import { LightingRig } from './LightingRig';
import { PlaybackClock } from './PlaybackClock';
import { ScreenBorder } from './ScreenBorder';
import { TitleCard } from './TitleCard';
import { useResponsiveFit } from './useResponsiveFit';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { PlaybackTelemetry } from '../scene/sceneApi';

export interface SceneCallbacks {
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  onFrameReady?: () => void;
}

interface PremiereSceneProps extends SceneCallbacks {
  store: PremiereStoreApi;
}

/**
 * The whole sequence as a React scene graph (ADDENDUM-022 §2.3). One concern per
 * child; this file only composes them.
 */
export function PremiereScene({ store, ...callbacks }: PremiereSceneProps) {
  const fit = useResponsiveFit();
  const heroConfig = usePremiereStore(store, (state) => state.heroConfig);
  const heroKey = JSON.stringify(heroConfig);
  const lastIndex = SEQUENCE_CHAPTERS.length - 1;

  return (
    <>
      <PlaybackClock store={store} {...callbacks} />
      <BallroomEnvironment />
      <LightingRig store={store} />
      <Atmosphere store={store} />
      {SEQUENCE_CHAPTERS.map((chapter, index) => {
        const isHero = chapter.archetype === 'gatsby_hero';
        return (
          <TitleCard
            // The hero card is keyed by its config, so a new title replaces exactly
            // one rig instead of being patched in place.
            key={isHero ? `${chapter.id}:${heroKey}` : chapter.id}
            chapter={chapter}
            isFinale={index === lastIndex}
            heroConfig={isHero ? heroConfig : undefined}
            scale={fit.cardScale}
            store={store}
          />
        );
      })}
      <CinemaCamera store={store} fit={fit} />
      <ScreenBorder store={store} />
      <CinemaComposer store={store} />
    </>
  );
}
