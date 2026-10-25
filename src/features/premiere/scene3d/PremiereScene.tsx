import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from 'zustand';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { Atmosphere } from './Atmosphere';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaCamera } from './CinemaCamera';
import { CinemaComposer } from './CinemaComposer';
import { LightingRig } from './LightingRig';
import { PlaybackClock } from './PlaybackClock';
import type { PremiereStore } from './premiereStore';
import { ScreenBorder } from './ScreenBorder';
import { TitleCard } from './TitleCard';

interface PremiereSceneProps {
  store: PremiereStore;
  /** `core` omits real-GL environment/post for headless scene-graph tests. */
  variant?: 'full' | 'core';
}

function browserHasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/** Composition root inside the Canvas: clock, five cards, atmosphere, camera, post. */
export function PremiereScene({ store, variant = 'full' }: PremiereSceneProps) {
  const size = useThree((state) => state.size);
  const heroConfig = useStore(store, (state) => state.heroConfig);
  const hasCoarsePointer = useMemo(browserHasCoarsePointer, []);
  const viewportFit = resolveViewportFit(size.width, size.height, hasCoarsePointer);
  const lastIndex = SEQUENCE_CHAPTERS.length - 1;

  return (
    <>
      <PlaybackClock store={store} />
      {variant === 'full' && <BallroomEnvironment />}
      <LightingRig store={store} />
      <Atmosphere store={store} />
      {SEQUENCE_CHAPTERS.map((chapter, index) => (
        <TitleCard
          key={
            chapter.archetype === 'gatsby_hero'
              ? `${chapter.id}-${JSON.stringify(heroConfig)}`
              : chapter.id
          }
          store={store}
          chapter={chapter}
          variant={index === lastIndex ? 'finale' : 'standard'}
          cardScale={viewportFit.cardScale}
        />
      ))}
      <CinemaCamera store={store} viewportFit={viewportFit} />
      <ScreenBorder store={store} />
      {variant === 'full' && <CinemaComposer store={store} />}
    </>
  );
}
