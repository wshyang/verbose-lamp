import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from 'zustand';
import type { SequenceChapter } from '../model/types';
import { cardPhase } from '../scene/choreography';
import { createGatsbyCardRig, type GatsbyCardRig } from '../scene/decoCards';
import type { PremiereStore } from './premiereStore';

interface TitleCardProps {
  store: PremiereStore;
  chapter: SequenceChapter;
  index: number;
  isFinale: boolean;
  cardScale: number;
}

/**
 * One choreographed title card (ADDENDUM-022 §6 step 2.3).
 *
 * The rig itself is three.js and is reused untouched: `createGatsbyCardRig` builds the
 * frame, the extruded Deco typography and the gate, and `updateState` drives the draw
 * on. What changes is who owns its lifetime — React does, so the hero card is rebuilt
 * by *keying* it on the hero config instead of the manager's manual remove/recreate.
 *
 * Timings are read imperatively inside `useFrame` (`store.getState()`), so sixty frames
 * a second never re-render React.
 */
export function TitleCard({ store, chapter, index, isFinale, cardScale }: TitleCardProps) {
  // The hero card follows the customizer; every other card has one fixed composition.
  const heroConfig = useStore(store, (state) => state.heroConfig);
  const heroOverride = chapter.archetype === 'gatsby_hero' ? heroConfig : undefined;
  const heroKey = chapter.archetype === 'gatsby_hero' ? JSON.stringify(heroConfig) : 'fixed';

  /**
   * The style version the rig was *built* with. Recorded here because the rig is
   * created from the live style, and the frame loop needs to know whether a later
   * style change has already been applied to this rig.
   */
  const builtVersion = useRef(0);

  const rig = useMemo<GatsbyCardRig>(() => {
    const state = store.getState();
    builtVersion.current = state.frameStyleVersion;
    return createGatsbyCardRig(chapter, { heroOverride, style: state.frameStyle });
  },
  // `heroKey` is the whole hero config; the style is applied imperatively below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [chapter, heroKey]);

  useEffect(() => {
    rig.root.scale.setScalar(cardScale);
  }, [rig, cardScale]);

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame(() => {
    const state = store.getState();
    const localT = (state.currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime);
    rig.updateState({ ...cardPhase(localT, isFinale), time: state.elapsed });

    // Coalesced to one rebuild per frame, exactly as `scheduleFrameRebuild` did: two
    // slider events inside one frame must not rebuild the geometry twice.
    if (builtVersion.current !== state.frameStyleVersion) {
      builtVersion.current = state.frameStyleVersion;
      rig.setFrameStyle(state.frameStyle);
    }
  });

  return <primitive object={rig.root} name={`title-card-${index}`} />;
}
