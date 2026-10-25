import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from 'zustand';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase } from '../scene/choreography';
import { createGatsbyCardRig } from '../scene/decoCards';
import type { FrameStyle } from '@/features/art-deco-frame';
import type { PremiereStore } from './premiereStore';

export interface TitleCardProps {
  store: PremiereStore;
  index: number;
  cardScale: number;
}

/**
 * One chapter's golden gate (ADDENDUM-022 §6.3): the rig is built once, the frame style is
 * re-applied at most once per frame, and a new hero configuration rebuilds only this card.
 */
export function TitleCard({ store, index, cardScale }: TitleCardProps) {
  const chapter = SEQUENCE_CHAPTERS[index];
  const isFinale = index === SEQUENCE_CHAPTERS.length - 1;
  const isHero = chapter.archetype === 'gatsby_hero';
  const heroConfig = useStore(store, (state) => state.heroConfig);
  // A new title (or its pinstripe toggle) is a different card, so it gets a fresh rig.
  const heroKey = isHero ? JSON.stringify(heroConfig) : '';

  const rig = useMemo(
    () =>
      createGatsbyCardRig(chapter, {
        heroOverride: isHero ? heroConfig : undefined,
        style: store.getState().frameStyle,
      }),
    // heroConfig is folded into heroKey on purpose: only the hero card may rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter, isHero, heroKey, store],
  );

  const appliedStyle = useRef<FrameStyle>(store.getState().frameStyle);

  useEffect(() => {
    rig.root.scale.setScalar(cardScale);
  }, [rig, cardScale]);

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame((state) => {
    const scene = store.getState();
    // Coalesced like the old scheduleFrameRebuild: one rebuild per frame, however many edits.
    if (scene.frameStyle !== appliedStyle.current) {
      appliedStyle.current = scene.frameStyle;
      rig.setFrameStyle(scene.frameStyle);
    }

    const chapterDuration = chapter.endTime - chapter.startTime;
    const localT = (scene.currentTime - chapter.startTime) / chapterDuration;
    const elapsed = scene.freezeAt ?? state.clock.elapsedTime;
    rig.updateState({ ...cardPhase(localT, isFinale), time: elapsed });
  });

  return <primitive object={rig.root} dispose={null} />;
}
