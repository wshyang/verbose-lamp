import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { FrameStyle } from '@/features/art-deco-frame';
import type { HeroTitleConfig, SequenceChapter } from '../model/types';
import { cardPhase, type CardRole } from '../scene/choreography';
import { createGatsbyCardRig, type GatsbyCardRig } from '../scene/decoCards';
import { usePremiereStoreApi } from './usePremiereStore';

interface TitleCardProps {
  chapter: SequenceChapter;
  role: CardRole;
  cardScale: number;
  heroOverride?: HeroTitleConfig;
}

/**
 * One golden title card (ADDENDUM-022 §2.3): the existing imperative rig,
 * created in an effect so mount/unmount/dispose stay symmetric under
 * StrictMode. The hero card is keyed by its config in PremiereScene, so
 * a billing edit remounts exactly this component — the declarative
 * replacement for updateHeroTitle. Frame-style changes are applied in
 * useFrame when the store value's identity changes, coalescing to one
 * rebuild per frame just like scheduleFrameRebuild did.
 */
export function TitleCard({ chapter, role, cardScale, heroOverride }: TitleCardProps) {
  const store = usePremiereStoreApi();
  const [rig, setRig] = useState<GatsbyCardRig | null>(null);
  const appliedStyleRef = useRef<FrameStyle | null>(null);
  const scaleRef = useRef(cardScale);
  scaleRef.current = cardScale;

  useEffect(() => {
    const style = store.getState().frameStyle;
    const created = createGatsbyCardRig(chapter, { heroOverride, style });
    created.root.scale.setScalar(scaleRef.current);
    appliedStyleRef.current = style;
    setRig(created);
    return () => {
      created.dispose();
      setRig(null);
    };
  }, [store, chapter, heroOverride]);

  useEffect(() => {
    rig?.root.scale.setScalar(cardScale);
  }, [rig, cardScale]);

  useFrame(({ clock }) => {
    if (!rig) return;
    const { currentTime, freezeAt, frameStyle } = store.getState();
    if (frameStyle !== appliedStyleRef.current) {
      appliedStyleRef.current = frameStyle;
      rig.setFrameStyle(frameStyle);
    }
    const localT = (currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime);
    rig.updateState({
      ...cardPhase({ localT, role }),
      time: freezeAt ?? clock.elapsedTime,
    });
  });

  return rig ? <primitive object={rig.root} /> : null;
}
