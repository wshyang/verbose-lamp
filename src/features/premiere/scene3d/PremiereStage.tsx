import { usePremiereStore, type PremiereStoreApi } from './premiereStore';
import { Atmosphere } from './Atmosphere';
import { CinemaCamera } from './CinemaCamera';
import { LightingRig } from './LightingRig';
import { PlaybackClock } from './PlaybackClock';
import { ScreenBorder } from './ScreenBorder';
import { TitleCard } from './TitleCard';
import { useResponsiveFit } from './useResponsiveFit';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { SceneCallbacks } from './PremiereScene';

/**
 * Everything in the sequence that a GPU is *not* required to build: the clock, the
 * five card rigs, the camera, the border and the atmosphere (ADDENDUM-029 §2).
 * `PremiereScene` adds the two children that do need real GL on top of this, which
 * is what lets the whole scene be mounted under `@react-three/test-renderer`.
 */
export function PremiereStage({ store, ...callbacks }: { store: PremiereStoreApi } & SceneCallbacks) {
  const fit = useResponsiveFit();
  const heroConfig = usePremiereStore(store, (state) => state.heroConfig);
  const heroKey = JSON.stringify(heroConfig);
  const lastIndex = SEQUENCE_CHAPTERS.length - 1;

  return (
    <>
      <PlaybackClock store={store} {...callbacks} />
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
    </>
  );
}
