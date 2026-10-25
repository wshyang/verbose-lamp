import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_FRAME_STYLE, type FrameFormula } from '@/features/art-deco-frame';
import { sequenceActions } from '../model/studioActions';
import { defaultFrameFormula } from '../model/studioFormula';
import { sequenceView } from '../model/studioView';
import type { FrameStudioTarget } from './frameStudioTarget';

/** The title-card frame: its formula and intricacy, and the controls that edit them. */
export function useSequenceFrame(getTarget: () => FrameStudioTarget | null) {
  const [formula, setFormula] = useState<FrameFormula>(defaultFrameFormula);
  const [intricacy, setIntricacy] = useState(DEFAULT_FRAME_STYLE.intricacy);

  const commit = useCallback(
    (nextFormula: FrameFormula, nextIntricacy: number) => {
      setFormula(nextFormula);
      setIntricacy(nextIntricacy);
      getTarget()?.setSequenceFrameStyle({ intricacy: nextIntricacy, formula: nextFormula });
    },
    [getTarget]
  );

  const actions = useMemo(() => sequenceActions(formula, intricacy, commit), [formula, intricacy, commit]);
  const view = useMemo(() => sequenceView(formula, intricacy), [formula, intricacy]);
  const reset = useCallback(() => commit(defaultFrameFormula(), DEFAULT_FRAME_STYLE.intricacy), [commit]);

  return { ...view, ...actions, reset };
}
