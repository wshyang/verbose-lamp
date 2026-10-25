import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { segmentSubject } from '@/features/background-removal';
import { locateFace } from '@/features/face-detection';
import type { RgbaImage } from '@/shared/lib/raster';
import type { SessionState } from '../model/sessionView';

/**
 * Runs the two independent analyses a photo needs — face location and background
 * removal — and writes each result back only if it still belongs to the current
 * session, so a cancelled or replaced photo cannot land late (ADDENDUM-039).
 */
export function usePhotoAnalysis(
  isCurrent: (session: number) => boolean,
  setState: Dispatch<SetStateAction<SessionState>>
) {
  return useCallback(
    (photo: RgbaImage, session: number) => {
      const current = () => isCurrent(session);
      void locateFace(photo).then((box) => {
        if (current()) setState((state) => ({ ...state, crop: box, foundCrop: box, isLocating: false }));
      });
      void segmentSubject(photo).then((matte) => {
        if (current()) setState((state) => ({ ...state, matte, isSegmenting: false }));
      });
    },
    [isCurrent, setState]
  );
}
