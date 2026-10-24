import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRgbaImage, validateImageFile, downloadGildedPng } from '@/features/gilded-portrait';
import { DEFAULT_BACKDROP_STYLE, PATTERN_DEFAULT_BANDS } from '../data/backdropStyles';
import { WEI_LING_AVATAR } from '../data/weiLing';
import { warmUpFaceLocator } from '../engine/faceLocator';
import { warmUpSegmenter } from '../engine/segmenter';
import { preparePhotoSubject, subjectFromSprite, type PrepareStage, type PreparedSubject } from '../engine/prepareSubject';
import { DEFAULT_MATTE_TUNING } from '../model/matte';
import type { BackdropPatternId, BackdropStyle, EnamelPaletteId, MatteTuning, SubjectFinish } from '../model/types';
import { useShimmerFrames } from './useShimmerFrames';

export type StudioStatus = 'idle' | PrepareStage | 'ready' | 'error';

export interface AvatarStudioOptions {
  /** Open with a stored indexed sprite already loaded (e.g. a demo participant). */
  readonly initialSprite?: { readonly code: string; readonly label: string };
}

const STATUS_COPY: Readonly<Record<StudioStatus, string>> = {
  idle: 'Choose a photograph, or summon Wei_Ling.',
  'detecting-face': 'Finding the face…',
  'removing-background': 'Lifting the subject from the background…',
  ready: '',
  error: 'That photograph could not be prepared.',
};

function statusNote(status: StudioStatus, subject: PreparedSubject | null): string {
  if (status !== 'ready' || subject === null) return STATUS_COPY[status];
  if (subject.matte === null) return 'Background removal was unavailable — the whole photo is kept.';
  return subject.isFaceFound ? '' : 'No face found — centred the crop instead.';
}

export function useAvatarStudio({ initialSprite }: AvatarStudioOptions = {}) {
  const [subject, setSubject] = useState<PreparedSubject | null>(() =>
    initialSprite ? subjectFromSprite(initialSprite.code, initialSprite.label) : null);
  const [status, setStatus] = useState<StudioStatus>(subject ? 'ready' : 'idle');
  const [style, setStyle] = useState<BackdropStyle>(DEFAULT_BACKDROP_STYLE);
  const [tuning, setTuning] = useState<MatteTuning>(DEFAULT_MATTE_TUNING);
  const [finish, setFinish] = useState<SubjectFinish>('gilded');
  const requestRef = useRef(0);
  const frames = useShimmerFrames({ subject, style, tuning, finish });

  useEffect(() => {
    warmUpFaceLocator();
    warmUpSegmenter();
  }, []);

  const loadPhoto = useCallback(async (file: File) => {
    const validation = validateImageFile(file);
    if (!validation.ok) return setStatus('error');
    const request = ++requestRef.current;
    try {
      const photo = await loadRgbaImage(file);
      const prepared = await preparePhotoSubject(photo, {
        label: file.name,
        onStage: (stage) => request === requestRef.current && setStatus(stage),
      });
      if (request !== requestRef.current) return;
      setSubject(prepared);
      setStatus('ready');
    } catch {
      if (request === requestRef.current) setStatus('error');
    }
  }, []);

  const loadWeiLing = useCallback(() => {
    requestRef.current += 1;
    setSubject(subjectFromSprite(WEI_LING_AVATAR.sprite, WEI_LING_AVATAR.nickname));
    setStatus('ready');
  }, []);

  const setPattern = useCallback((pattern: BackdropPatternId) =>
    setStyle((current) => ({ ...current, pattern, bands: PATTERN_DEFAULT_BANDS[pattern] })), []);
  const setPalette = useCallback((palette: EnamelPaletteId) => setStyle((current) => ({ ...current, palette })), []);
  const setBands = useCallback((bands: number) => setStyle((current) => ({ ...current, bands })), []);
  const updateTuning = useCallback((patch: Partial<MatteTuning>) => setTuning((current) => ({ ...current, ...patch })), []);

  const download = useCallback(() => downloadGildedPng(frames[0], `${subject?.label ?? 'gold'}-avatar`), [frames, subject]);

  return {
    subject, status, note: statusNote(status, subject), frames, style, tuning, finish,
    isBusy: status === 'detecting-face' || status === 'removing-background',
    loadPhoto, loadWeiLing, setPattern, setPalette, setBands, updateTuning, setFinish, download,
  };
}

export type AvatarStudioState = ReturnType<typeof useAvatarStudio>;
