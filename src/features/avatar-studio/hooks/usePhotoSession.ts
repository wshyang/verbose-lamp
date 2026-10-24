import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { segmentSubject, warmUpSegmenter, type SubjectMatte } from '@/features/background-removal';
import { locateFace, warmUpFaceLocator } from '@/features/face-detection';
import { loadRgbaImage, validateImageFile } from '@/features/gilded-portrait';
import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import { startingBox } from '../cropBox';
import { nextStage, stageHint } from '../stage';
import type { AvatarSample, StudioStage } from '../types';

/**
 * The photo session, ported from the reference `usePhotoSession` (ADDENDUM-017 §3.4).
 * A session counter makes results that arrive after Cancel (or a newer photo) get
 * dropped. The photo is drawn from pixels, so no object URLs exist to leak.
 */
interface SessionState {
  readonly photo: RgbaImage | null;
  readonly photoName: string;
  readonly crop: SquareBox | null;
  readonly foundCrop: SquareBox | null;
  readonly matte: SubjectMatte | null;
  readonly isLocating: boolean;
  readonly isSegmenting: boolean;
  readonly error: string | null;
}

const EMPTY_SESSION: SessionState = Object.freeze({
  photo: null, photoName: '', crop: null, foundCrop: null, matte: null, isLocating: false, isSegmenting: false, error: null,
});

export type CutOutAvailability = 'available' | 'pending' | 'unavailable';

export interface PhotoSession extends SessionState {
  readonly stage: StudioStage;
  readonly hint: string;
  readonly isCropping: boolean;
  readonly cropperStart: SquareBox | null;
  readonly cutOut: CutOutAvailability;
  readonly loadFile: (file: File | null) => Promise<void>;
  readonly loadSample: (sample: AvatarSample) => Promise<void>;
  readonly confirmCrop: (box: SquareBox) => void;
  readonly startAdjusting: () => void;
  readonly cancelCrop: () => void;
  readonly cancel: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'That image could not be opened.');

function cutOutOf(state: SessionState): CutOutAvailability {
  if (state.photo === null) return 'available';
  if (state.isSegmenting) return 'pending';
  return state.matte === null ? 'unavailable' : 'available';
}

export function usePhotoSession(): PhotoSession {
  const [state, setState] = useState<SessionState>(EMPTY_SESSION);
  const [isAdjusting, setAdjusting] = useState(false);
  const sessionRef = useRef(0);

  useEffect(() => {
    warmUpFaceLocator();
    warmUpSegmenter();
    return () => { sessionRef.current += 1; };
  }, []);

  const analyse = useCallback((photo: RgbaImage, session: number) => {
    const isCurrent = () => session === sessionRef.current;
    void locateFace(photo).then((box) => {
      if (isCurrent()) setState((current) => ({ ...current, crop: box, foundCrop: box, isLocating: false }));
    });
    void segmentSubject(photo).then((matte) => {
      if (isCurrent()) setState((current) => ({ ...current, matte, isSegmenting: false }));
    });
  }, []);

  const loadFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const session = ++sessionRef.current;
    setAdjusting(false);
    const validation = validateImageFile({ type: file.type, size: file.size });
    if (!validation.ok) {
      setState({ ...EMPTY_SESSION, error: validation.reason });
      return;
    }
    setState({ ...EMPTY_SESSION, photoName: file.name, isLocating: true, isSegmenting: true });
    try {
      const photo = await loadRgbaImage(file);
      if (session !== sessionRef.current) return;
      setState((current) => ({ ...current, photo }));
      analyse(photo, session);
    } catch (error) {
      if (session === sessionRef.current) setState({ ...EMPTY_SESSION, error: messageOf(error) });
    }
  }, [analyse]);

  const loadSample = useCallback(async (sample: AvatarSample) => {
    try {
      const blob = await (await fetch(sample.src)).blob();
      await loadFile(new File([blob], `${sample.name}.jpg`, { type: blob.type || 'image/jpeg' }));
    } catch {
      setState({ ...EMPTY_SESSION, error: `${sample.name}'s photo could not be opened.` });
    }
  }, [loadFile]);

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

  return useMemo(() => {
    const stage = nextStage({ hasImage: state.photo !== null, ...state });
    const isCropping = state.photo !== null && (stage === 'cropping' || (isAdjusting && !state.isLocating));
    const cropperStart = state.photo === null ? null : state.crop ?? state.foundCrop ?? startingBox(state.photo);
    return {
      ...state, stage, hint: stageHint(stage), isCropping, cropperStart, cutOut: cutOutOf(state),
      loadFile, loadSample, confirmCrop, startAdjusting, cancelCrop, cancel,
    };
  }, [state, isAdjusting, loadFile, loadSample, confirmCrop, startAdjusting, cancelCrop, cancel]);
}
