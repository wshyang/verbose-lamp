import { useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { resolveViewportFit, type ViewportFit } from '../scene/responsiveLayout';

/**
 * The manager's resize-driven viewport fit (ADDENDUM-022 §2.3): the
 * coarse-pointer test is sampled once at mount, exactly as its readonly
 * field was, and the fit recomputes whenever the canvas size changes.
 */
export function useViewportFit(): ViewportFit {
  const size = useThree((state) => state.size);
  const [hasCoarsePointer] = useState(
    () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
  );
  return useMemo(
    () => resolveViewportFit(size.width, size.height, hasCoarsePointer),
    [size, hasCoarsePointer],
  );
}
