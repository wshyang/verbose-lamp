import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { warmUpSegmenter } from '@/features/background-removal';
import { warmUpFaceLocator } from '@/features/face-detection';
import type { SquareBox } from '@/shared/lib/raster';
import { EMPTY_SESSION, sessionViewOf, type CutOutAvailability, type SessionState } from '../model/sessionView';
import type { AvatarSample } from '../types';
import { usePhotoAnalysis } from './usePhotoAnalysis';
import { usePhotoLoad } from './usePhotoLoad';

export type { CutOutAvailability };

/** The photo session's public surface: the state, the derived view, and the commands. */
export interface PhotoSession extends SessionState, ReturnType<typeof sessionViewOf> {
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
 *
 * The analysis lives in `usePhotoAnalysis`, the view in `model/sessionView`, and
 * this hook is the session's bookkeeping (ADDENDUM-039).
 */
export function usePhotoSession(): PhotoSession {
  const [state, setState] = useState<SessionState>(EMPTY_SESSION);
  const [isAdjusting, setAdjusting] = useState(false);
  const sessionRef = useRef(0);

  useEffect(() => {
    warmUpFaceLocator();
    warmUpSegmenter();
    return () => {
      sessionRef.current += 1;
    };
  }, []);

  const analyse = usePhotoAnalysis((session) => session === sessionRef.current, setState);
  const onLoading = useCallback(() => setAdjusting(false), []);

  const { loadFile, loadSample } = usePhotoLoad({ setState, sessionRef, analyse, onLoading });

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
    () => ({
      ...state,
      ...sessionViewOf(state, isAdjusting),
      loadFile,
      loadSample,
      confirmCrop,
      startAdjusting,
      cancelCrop,
      cancel,
    }),
    [state, isAdjusting, loadFile, loadSample, confirmCrop, startAdjusting, cancelCrop, cancel]
  );
}
