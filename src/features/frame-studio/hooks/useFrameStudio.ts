import { useCallback, useState } from 'react';
import type { FrameSurface } from '@/features/art-deco-frame';
import type { FrameStudioTarget } from './frameStudioTarget';
import { usePanelVisibility } from './usePanelVisibility';
import { useScreenBorder } from './useScreenBorder';
import { useSequenceFrame } from './useSequenceFrame';

export type { FrameStudioTarget } from './frameStudioTarget';

/**
 * Frame Studio state. The title-card frame, the screen border and the panel's visibility are
 * separate hooks; this one decides which surface the shared controls (genes) act on and wires
 * the cross-cutting actions (choosing the border surface shows it, reset restores both).
 */
export function useFrameStudio(getTarget: () => FrameStudioTarget | null) {
  const visibility = usePanelVisibility();
  const { reset: resetSequence, genome: sequenceGenome, setGene: setSequenceGene, ...sequence } =
    useSequenceFrame(getTarget);
  const { reset: resetBorder, genome: borderGenome, setGene: setBorderGene, ...border } = useScreenBorder(getTarget);
  const [surface, setSurfaceState] = useState<FrameSurface>('title-cards');
  const [proportionsOpen, setProportionsOpen] = useState(false);

  const { borderEnabled, setBorderEnabled } = border;
  const setSurface = useCallback(
    (next: FrameSurface) => {
      setSurfaceState(next);
      if (next === 'screen-border' && !borderEnabled) setBorderEnabled(true);
    },
    [borderEnabled, setBorderEnabled]
  );

  const resetAll = useCallback(() => {
    setSurfaceState('title-cards');
    resetSequence();
    resetBorder();
    setProportionsOpen(false);
  }, [resetSequence, resetBorder]);

  const isTitle = surface === 'title-cards';

  return {
    ...visibility,
    ...sequence,
    ...border,
    surface,
    setSurface,
    proportionsOpen,
    setProportionsOpen,
    genome: isTitle ? sequenceGenome : borderGenome,
    setGene: isTitle ? setSequenceGene : setBorderGene,
    resetAll,
  };
}

export type FrameStudioController = ReturnType<typeof useFrameStudio>;
