import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from 'zustand';
import type { FrameStyle } from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { cardPhase, cardRole, chapterProgress } from '../scene/choreography';
import { createGatsbyCardRig } from '../scene/decoCards';
import type { PremiereStoreApi } from './premiereStore';

interface TitleCardProps {
  store: PremiereStoreApi;
  /** Which of `SEQUENCE_CHAPTERS` this card stages; its role (finale or not) follows from it. */
  index: number;
  cardScale: number;
}

/**
 * One chapter's golden gate (ADDENDUM-022 §2.3). The rig is built once; a new frame style
 * is re-applied at most once per frame however many edits arrive; and a new hero title
 * rebuilds only the hero card (a pinstripe toggle counts as a new title).
 */
export function TitleCard({ store, index, cardScale }: TitleCardProps) {
  const chapter = SEQUENCE_CHAPTERS[index];
  const role = cardRole(index, SEQUENCE_CHAPTERS.length);
  const isHero = chapter.archetype === 'gatsby_hero';
  const heroConfig = useStore(store, (state) => state.heroConfig);
  // Folding the title into a key lets only the hero card's rig depend on it.
  const heroKey = isHero ? JSON.stringify(heroConfig) : '';
  const appliedStyle = useRef<FrameStyle>(store.getState().frameStyle);

  const rig = useMemo(() => {
    const { frameStyle } = store.getState();
    appliedStyle.current = frameStyle;
    return createGatsbyCardRig(chapter, {
      heroOverride: isHero ? JSON.parse(heroKey) : undefined,
      style: frameStyle,
    });
  }, [chapter, isHero, heroKey, store]);

  useEffect(() => {
    rig.root.scale.setScalar(cardScale);
  }, [rig, cardScale]);

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame(() => {
    const { currentTime, elapsed, frameStyle } = store.getState();
    // Coalesced like the manager's scheduleFrameRebuild: one rebuild per frame.
    if (frameStyle !== appliedStyle.current) {
      appliedStyle.current = frameStyle;
      rig.setFrameStyle(frameStyle);
    }
    rig.updateState({ ...cardPhase({ localT: chapterProgress(currentTime, chapter), role }), time: elapsed });
  });

  return <primitive object={rig.root} name={`title-card-${index}`} dispose={null} />;
}
