import { useCallback, useMemo, useState } from 'react';
import type { ScreenBorderStyle } from '@/features/art-deco-frame';
import { borderActions } from '../model/studioActions';
import { defaultBorderStyle } from '../model/studioFormula';
import { borderView } from '../model/studioView';
import type { FrameStudioTarget } from './frameStudioTarget';

/** The screen border: its style, whether it is shown, and the controls that edit it. */
export function useScreenBorder(getTarget: () => FrameStudioTarget | null) {
  const [border, setBorder] = useState<ScreenBorderStyle>(defaultBorderStyle);
  const [borderEnabled, setBorderEnabledState] = useState(false);

  const commitBorder = useCallback(
    (next: ScreenBorderStyle) => {
      setBorder(next);
      getTarget()?.setScreenBorderStyle(next);
    },
    [getTarget]
  );

  const setBorderEnabled = useCallback(
    (enabled: boolean) => {
      setBorderEnabledState(enabled);
      getTarget()?.setScreenBorderEnabled(enabled);
    },
    [getTarget]
  );

  const actions = useMemo(() => borderActions(border, commitBorder), [border, commitBorder]);
  const reset = useCallback(() => {
    setBorder(defaultBorderStyle());
    setBorderEnabled(false);
  }, [setBorderEnabled]);

  return { ...borderView(border), ...actions, reset, borderEnabled, setBorderEnabled };
}
