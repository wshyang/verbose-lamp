import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from 'zustand';
import type { FrameStyle } from '@/features/art-deco-frame';
import type { SequenceChapter } from '../model/types';
import { cardPhase, chapterProgress } from '../scene/choreography';
import { createGatsbyCardRig } from '../scene/decoCards';
import type { PremiereStore } from './premiereStore';
import { sceneElapsed } from './sceneElapsed';

interface TitleCardProps {
  store: PremiereStore;
  chapter: SequenceChapter;
  variant: 'standard' | 'finale';
  cardScale: number;
}

/** React owner for one imperative `GatsbyCardRig`; builders stay unchanged. */
export function TitleCard({ store, chapter, variant, cardScale }: TitleCardProps) {
  const heroConfig = useStore(store, (state) => state.heroConfig);
  const pendingStyleRef = useRef<FrameStyle | null>(null);
  const isHero = chapter.archetype === 'gatsby_hero';

  const heroForCard = isHero ? heroConfig : undefined;
  const rig = useMemo(
    () =>
      createGatsbyCardRig(chapter, {
        heroOverride: heroForCard,
        style: store.getState().frameStyle,
      }),
    [chapter, heroForCard, store]
  );

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => {
    rig.root.scale.setScalar(cardScale);
  }, [cardScale, rig]);
  useEffect(
    () =>
      store.subscribe((state, previous) => {
        if (state.frameStyle !== previous.frameStyle) pendingStyleRef.current = state.frameStyle;
      }),
    [store]
  );

  useFrame((state) => {
    if (pendingStyleRef.current) {
      rig.setFrameStyle(pendingStyleRef.current);
      pendingStyleRef.current = null;
    }
    const currentTime = store.getState().currentTime;
    const localT = chapterProgress({ time: currentTime, chapter });
    rig.updateState({
      ...cardPhase({ localT, variant }),
      time: sceneElapsed(store, state),
    });
  });

  return <primitive object={rig.root} />;
}
