import { useCallback, useState } from 'react';
import type { GeneKey, ScreenBorderStyle } from '@/features/art-deco-frame';
import { defaultBorderStyle, detailPercent, withBorderGene, withBorderWeight } from '../model/frameDraft';
import type { FrameStudioTarget } from '../model/target';

/** The one-sheet border: its style, whether it is drawn, and the two edits it takes. */
export function useScreenBorder(getTarget: () => FrameStudioTarget | null) {
  const [border, setBorder] = useState<ScreenBorderStyle>(defaultBorderStyle);
  const [enabled, setEnabled] = useState(false);

  const commit = useCallback(
    (next: ScreenBorderStyle) => {
      setBorder(next);
      getTarget()?.setScreenBorderStyle(next);
    },
    [getTarget]
  );
  const setBorderEnabled = useCallback(
    (next: boolean) => {
      setEnabled(next);
      getTarget()?.setScreenBorderEnabled(next);
    },
    [getTarget]
  );
  const setWeight = useCallback((percent: number) => commit(withBorderWeight(border, percent)), [commit, border]);
  const setGene = useCallback((key: GeneKey, value: number) => commit(withBorderGene(border, key, value)), [commit, border]);
  const restore = useCallback(() => setBorder(defaultBorderStyle()), []);

  return {
    border,
    enabled,
    setBorderEnabled,
    setWeight,
    setGene,
    restore,
    panel: {
      borderEnabled: enabled,
      borderWeight: detailPercent(border.weight),
      setBorderEnabled,
      setBorderWeight: setWeight,
    },
  };
}
