import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { FrameStyle } from '@/features/art-deco-frame';
import { createGatsbyCardRig } from '../scene/decoCards';
import { cardPhase } from '../scene/choreography';
import type { HeroTitleConfig, SequenceChapter } from '../model/types';
import type { PremiereStoreApi } from './premiereStore';

interface TitleCardProps {
  chapter: SequenceChapter;
  isFinale: boolean;
  /** Only the hero card takes an override; the others keep their own copy. */
  heroConfig?: HeroTitleConfig;
  scale: number;
  store: PremiereStoreApi;
}

/**
 * One chapter's card rig, wrapped for React (ADDENDUM-022 §2.3). The builder is
 * reused untouched; this component only drives it. A frame-style change is picked
 * up in `useFrame`, so several slider moves inside one frame collapse into a
 * single geometry rebuild, exactly as `scheduleFrameRebuild` did.
 */
export function TitleCard({ chapter, isFinale, heroConfig, scale, store }: TitleCardProps) {
  const rig = useMemo(
    () =>
      createGatsbyCardRig(chapter, {
        heroOverride: heroConfig,
        style: store.getState().frameStyle,
      }),
    // A new hero config means a new rig, which replaces the manual rebuild the
    // imperative renderer did in `updateHeroTitle`.
    [chapter, heroConfig, store]
  );
  const appliedStyle = useRef<FrameStyle>(store.getState().frameStyle);

  useEffect(() => () => rig.dispose(), [rig]);

  useEffect(() => {
    rig.root.scale.setScalar(scale);
  }, [rig, scale]);

  useFrame(() => {
    const scene = store.getState();
    if (scene.frameStyle !== appliedStyle.current) {
      appliedStyle.current = scene.frameStyle;
      rig.setFrameStyle(scene.frameStyle);
    }
    const localT = (scene.currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime);
    rig.updateState({ ...cardPhase({ localT, isFinale }), time: scene.elapsed });
  });

  return <primitive object={rig.root} />;
}
