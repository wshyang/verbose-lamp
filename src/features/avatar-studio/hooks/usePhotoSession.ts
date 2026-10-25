import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { warmUpSegmenter } from '@/features/background-removal';
import { warmUpFaceLocator } from '@/features/face-detection';
import type { SquareBox } from '@/shared/lib/raster';
import { EMPTY_SESSION, viewOf, type SessionState, type SessionView } from '../photoSession';
import type { AvatarSample } from '../types';
import { usePhotoLoader } from './usePhotoLoader';

export type { CutOutAvailability } from '../photoSession';

export interface PhotoSession extends SessionState, SessionView {
  readonly loadFile: (file: File | null) => Promise<void>;
  readonly loadSample: (sample: AvatarSample) => Promise<void>;
  readonly confirmCrop: (box: SquareBox) => void;
  readonly startAdjusting: () => void;
  readonly cancelCrop: () => void;
  readonly cancel: () => void;
}

/**
 * The photo session, ported from the reference `usePhotoSession` (ADDENDUM-017 §3.4).
 * A session counter makes results that arrive after Cancel (or a newer photo) get
 * dropped. The photo is drawn from pixels, so no object URLs exist to leak.
 */
export function usePhotoSession(): PhotoSession {
  const [state, setState] = useState<SessionState>(EMPTY_SESSION);
  const [isAdjusting, setAdjusting] = useState(false);
  const sessionRef = useRef(0);
  const { loadFile, loadSample } = usePhotoLoader({ sessionRef, setState, setAdjusting });

  useEffect(() => {
    warmUpFaceLocator();
    warmUpSegmenter();
    return () => { sessionRef.current += 1; };
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    setAdjusting(false);
    setState(EMPTY_SESSION);
  }, []);

  const confirmCrop = useCallback((box: SquareBox) => {
    setAdjusting(false);
    setState((current) => ({ ...current, crop: box }));
  }, []);

  const startAdjusting = useCallback(() => setAdjusting(true), []);
  const cancelCrop = useCallback(() => (isAdjusting ? setAdjusting(false) : cancel()), [isAdjusting, cancel]);

  return useMemo(
    () => ({ ...state, ...viewOf(state, isAdjusting), loadFile, loadSample, confirmCrop, startAdjusting, cancelCrop, cancel }),
    [state, isAdjusting, loadFile, loadSample, confirmCrop, startAdjusting, cancelCrop, cancel]
  );
}
