import { useCallback, useState } from 'react';
import type { FrameLayerSource, FrameSource, GeneKey } from '@/features/art-deco-frame';
import {
  clampLayerLevel,
  initialDraft,
  sequenceStyleOf,
  withDesign,
  withDetail,
  withGene,
  withLayer,
  withLevel,
  withPattern,
  type FrameDraft,
} from '../model/frameDraft';
import type { FrameStudioTarget } from '../model/target';

/**
 * The sequence frame's state and every edit that commits it to the scene.
 * Each mutator is a pure transition (`model/frameDraft`) plus one commit, so the
 * hook only decides *when* the renderer hears about a change (ADDENDUM-037).
 */
export function useSequenceFrame(getTarget: () => FrameStudioTarget | null) {
  const [draft, setDraft] = useState<FrameDraft>(initialDraft);

  const commit = useCallback(
    (next: FrameDraft) => {
      setDraft(next);
      getTarget()?.setSequenceFrameStyle(sequenceStyleOf(next));
    },
    [getTarget]
  );
  const run = useCallback((transition: (current: FrameDraft) => FrameDraft) => commit(transition(draft)), [commit, draft]);

  const selectPattern = useCallback((source: FrameSource) => run((current) => withPattern(current, source)), [run]);
  const selectDesign = useCallback((index: number) => run((current) => withDesign(current, index)), [run]);
  const setGene = useCallback((key: GeneKey, value: number) => run((current) => withGene(current, key, value)), [run]);
  const setLayerEnabled = useCallback(
    (source: FrameLayerSource, enabled: boolean) => run((current) => withLayer(current, source, { enabled })),
    [run]
  );
  const setLayerLevel = useCallback(
    (source: FrameLayerSource, level: number) => run((current) => withLayer(current, source, { level: clampLayerLevel(level) })),
    [run]
  );
  const setLevel = useCallback((level: number) => run((current) => withLevel(current, level)), [run]);
  const setDetail = useCallback((percent: number) => run((current) => withDetail(current, percent)), [run]);
  const reset = useCallback(() => commit(initialDraft()), [commit]);

  return {
    draft,
    panel: {
      baseSource: draft.formula.source,
      level: draft.formula.level,
      selectPattern,
      selectDesign,
      setLevel,
      setDetail,
      setLayerEnabled,
      setLayerLevel,
    },
    selectPattern,
    selectDesign,
    setGene,
    setLayerEnabled,
    setLayerLevel,
    setLevel,
    setDetail,
    reset,
  };
}
