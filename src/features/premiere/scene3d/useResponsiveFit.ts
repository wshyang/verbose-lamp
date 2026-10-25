import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { resolveViewportFit, type ViewportFit } from '../scene/responsiveLayout';

/** Coarse pointer decides the mobile auto-level framing. Read once. */
export function useCoarsePointer(): boolean {
  return useMemo(
    () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
    []
  );
}

/** Aspect-driven card scale and camera pull-back for the live canvas size. */
export function useResponsiveFit(): ViewportFit {
  const size = useThree((state) => state.size);
  const hasCoarsePointer = useCoarsePointer();
  return useMemo(
    () => resolveViewportFit(size.width, size.height, hasCoarsePointer),
    [size.width, size.height, hasCoarsePointer]
  );
}
