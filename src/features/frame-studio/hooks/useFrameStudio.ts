import { useCallback, useState } from 'react';
import type { FrameSurface } from '@/features/art-deco-frame';
import type { FrameStudioTarget } from '../model/target';
import { usePanelVisibility } from './usePanelVisibility';
import { useScreenBorder } from './useScreenBorder';
import { useSequenceFrame } from './useSequenceFrame';
import { useStudioView } from './useStudioView';

export type { FrameStudioTarget };

/**
 * The frame studio's single entry point (ADDENDUM-037): the panel gets one flat
 * object of state and handlers, and never learns which hook owns what.
 *
 * Composition only — the sequence frame, the border and the panel's own chrome
 * are three hooks, the derived readout is a fourth, and the panel itself is a
 * tree of components that receive `Pick`s of this object.
 */
export function useFrameStudio(getTarget: () => FrameStudioTarget | null) {
  const sequence = useSequenceFrame(getTarget);
  const border = useScreenBorder(getTarget);
  const { isOpen, dismiss, reveal } = usePanelVisibility();
  const [surface, setSurfaceState] = useState<FrameSurface>('title-cards');
  const [proportionsOpen, setProportionsOpen] = useState(false);
  const view = useStudioView(sequence.draft);

  const setSurface = useCallback(
    (next: FrameSurface) => {
      setSurfaceState(next);
      // Switching to the border surface shows it; there is nothing to edit otherwise.
      if (next === 'screen-border' && !border.enabled) border.setBorderEnabled(true);
    },
    [border]
  );

  const resetAll = useCallback(() => {
    sequence.reset();
    border.restore();
    border.setBorderEnabled(false);
    setSurfaceState('title-cards');
    setProportionsOpen(false);
  }, [sequence, border]);

  const isTitle = surface === 'title-cards';

  return {
    ...view,
    ...sequence.panel,
    ...border.panel,
    isOpen,
    dismiss,
    reveal,
    surface,
    setSurface,
    proportionsOpen,
    setProportionsOpen,
    genome: isTitle ? sequence.draft.formula.genome : border.border.genome,
    setGene: isTitle ? sequence.setGene : border.setGene,
    resetAll,
  };
}

export type FrameStudioController = ReturnType<typeof useFrameStudio>;
