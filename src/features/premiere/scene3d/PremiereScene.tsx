import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { CinemaCamera } from './CinemaCamera';
import { DecoWall } from './DecoWall';
import { GoldDust } from './GoldDust';
import { GreenLight } from './GreenLight';
import { LightingRig } from './LightingRig';
import { PlaybackClock } from './PlaybackClock';
import { ScreenBorder } from './ScreenBorder';
import { Searchlights } from './Searchlights';
import { TitleCard } from './TitleCard';
import type { PremiereStore } from './premiereStore';

export interface PremiereSceneProps {
  store: PremiereStore;
  /** Coarse-pointer devices get the auto-levelled mobile framing (ADDENDUM-012). */
  hasCoarsePointer?: boolean;
}

/**
 * Everything that draws, composed in one place (ADDENDUM-022 §6.3). The environment and the
 * composer stay out of this tree so the scene renders in the test renderer without a GPU;
 * `PremiereCanvas` adds them.
 */
export function PremiereScene({ store, hasCoarsePointer = false }: PremiereSceneProps) {
  const size = useThree((state) => state.size);
  const fit = useMemo(
    () => resolveViewportFit(size.width, size.height, hasCoarsePointer),
    [hasCoarsePointer, size.height, size.width],
  );

  return (
    <>
      <PlaybackClock store={store} />
      <LightingRig store={store} />
      <CinemaCamera store={store} fit={fit} />
      <DecoWall store={store} />
      <Searchlights store={store} />
      <GreenLight store={store} />
      <GoldDust store={store} />
      <ScreenBorder store={store} />
      {SEQUENCE_CHAPTERS.map((chapter, index) => (
        <TitleCard key={chapter.id} store={store} index={index} cardScale={fit.cardScale} />
      ))}
    </>
  );
}
